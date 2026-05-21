import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, isDatabaseConfigured } from '../db/client.js'
import { caseParticipants, cases, onchainReceipts, users } from '../db/schema.js'

const walletSchema = z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value))
const updateProfileSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/).optional().or(z.literal('')),
  displayName: z.string().trim().max(80).optional().or(z.literal('')),
  avatarUrl: z.string().trim().url().optional().or(z.literal('')),
  bio: z.string().trim().max(280).optional().or(z.literal('')),
})

export async function userRoutes(app: FastifyInstance) {
  app.get('/users/:wallet', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const parsed = z.object({ wallet: walletSchema }).safeParse(request.params)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid wallet' })

    const wallet = normalizeWallet(parsed.data.wallet)
    const profile = await ensureUser(wallet)
    const [participatedCases, payoutRows] = await Promise.all([
      db!
        .select({
          caseId: cases.id,
          question: cases.question,
          role: caseParticipants.role,
          visibility: cases.visibility,
          updatedAt: cases.updatedAt,
        })
        .from(caseParticipants)
        .innerJoin(cases, eq(cases.id, caseParticipants.caseId))
        .where(eq(caseParticipants.wallet, wallet))
        .orderBy(desc(cases.updatedAt)),
      db!
        .select()
        .from(onchainReceipts)
        .where(eq(onchainReceipts.receiptType, 'agent-payout'))
        .orderBy(desc(onchainReceipts.createdAt)),
    ])

    const walletPayouts = payoutRows
      .filter((row) => {
        const payload = row.payload as { wallet?: string } | null
        return payload?.wallet?.toLowerCase() === wallet
      })

    return {
      profile: formatProfile(profile),
      cases: participatedCases
        .filter((item) => item.role === 'filer')
        .map((item) => ({
          id: item.caseId,
          title: item.question,
          visibility: item.visibility,
          role: item.role,
          updated: item.updatedAt.toISOString(),
        })),
      participation: participatedCases.map((item) => ({
        id: item.caseId,
        title: item.question,
        role: item.role,
        visibility: item.visibility,
        updated: item.updatedAt.toISOString(),
      })),
      payouts: walletPayouts.map((row) => {
        const payload = row.payload as { amountUsdc?: string; agentId?: string; wallet?: string } | null
        return {
          caseId: row.caseId,
          txHash: row.txHash,
          agentId: payload?.agentId,
          wallet: payload?.wallet,
          amountUsdc: payload?.amountUsdc,
          createdAt: row.createdAt.toISOString(),
        }
      }),
    }
  })

  app.put('/users/:wallet', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const params = z.object({ wallet: walletSchema }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'invalid wallet' })

    const parsed = updateProfileSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid profile',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const wallet = normalizeWallet(params.data.wallet)
    const now = new Date()
    const values = {
      username: normalizeOptional(parsed.data.username),
      displayName: normalizeOptional(parsed.data.displayName),
      avatarUrl: normalizeOptional(parsed.data.avatarUrl),
      bio: normalizeOptional(parsed.data.bio),
      updatedAt: now,
      lastSeenAt: now,
    }

    await ensureUser(wallet)
    const [profile] = await db!
      .update(users)
      .set(values)
      .where(eq(users.wallet, wallet))
      .returning()

    return { profile: formatProfile(profile) }
  })
}

async function ensureUser(wallet: string) {
  const now = new Date()
  await db!
    .insert(users)
    .values({
      wallet,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: users.wallet,
      set: {
        lastSeenAt: now,
        updatedAt: now,
      },
    })

  const [profile] = await db!
    .select()
    .from(users)
    .where(eq(users.wallet, wallet))
    .limit(1)

  return profile
}

function formatProfile(profile: typeof users.$inferSelect) {
  return {
    wallet: profile.wallet,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    lastSeenAt: profile.lastSeenAt?.toISOString(),
  }
}

function normalizeWallet(value: string) {
  return value.toLowerCase()
}

function normalizeOptional(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}
