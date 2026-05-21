import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { verifyMessage } from 'viem'
import { z } from 'zod'
import { env } from '../config/env.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { authChallenges, caseFollows, caseParticipants, cases, onchainReceipts, users } from '../db/schema.js'

const walletSchema = z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value))
const profileFieldsSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/).optional().or(z.literal('')),
  displayName: z.string().trim().max(80).optional().or(z.literal('')),
  avatarUrl: z.string().trim().url().optional().or(z.literal('')),
  bio: z.string().trim().max(280).optional().or(z.literal('')),
})
const updateProfileSchema = profileFieldsSchema.extend({
  auth: z.object({
    message: z.string().min(1),
    signature: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)),
  }),
})

const PROFILE_UPDATE_PURPOSE = 'profile:update'
const CHALLENGE_TTL_MS = 5 * 60 * 1000

export async function userRoutes(app: FastifyInstance) {
  app.get('/users/:wallet', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const parsed = z.object({ wallet: walletSchema }).safeParse(request.params)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid wallet' })

    const wallet = normalizeWallet(parsed.data.wallet)
    const profile = await ensureUser(wallet)
    const [participatedCases, followedCases, payoutRows] = await Promise.all([
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
        .select({
          caseId: cases.id,
          question: cases.question,
          visibility: cases.visibility,
          followedAt: caseFollows.createdAt,
          updatedAt: cases.updatedAt,
        })
        .from(caseFollows)
        .innerJoin(cases, eq(cases.id, caseFollows.caseId))
        .where(eq(caseFollows.wallet, wallet))
        .orderBy(desc(caseFollows.createdAt)),
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
      follows: followedCases.map((item) => ({
        id: item.caseId,
        title: item.question,
        visibility: item.visibility,
        followedAt: item.followedAt.toISOString(),
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

  app.post('/users/:wallet/challenge', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const parsed = z.object({ wallet: walletSchema }).safeParse(request.params)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid wallet' })

    const wallet = normalizeWallet(parsed.data.wallet)
    await ensureUser(wallet)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS)
    const nonce = randomUUID()
    const message = buildProfileChallengeMessage({ wallet, nonce, issuedAt: now, expiresAt })

    await db!
      .insert(authChallenges)
      .values({
        id: randomUUID(),
        wallet,
        nonce,
        message,
        purpose: PROFILE_UPDATE_PURPOSE,
        expiresAt,
        createdAt: now,
      })

    return {
      wallet,
      nonce,
      message,
      expiresAt: expiresAt.toISOString(),
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
    const authorized = await consumeProfileChallenge({
      wallet,
      message: parsed.data.auth.message,
      signature: parsed.data.auth.signature,
    })

    if (!authorized.ok) {
      return reply.status(401).send({ error: authorized.error })
    }

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

async function consumeProfileChallenge({
  wallet,
  message,
  signature,
}: {
  wallet: string
  message: string
  signature: `0x${string}`
}) {
  const [challenge] = await db!
    .select()
    .from(authChallenges)
    .where(and(
      eq(authChallenges.wallet, wallet),
      eq(authChallenges.message, message),
      eq(authChallenges.purpose, PROFILE_UPDATE_PURPOSE),
      isNull(authChallenges.consumedAt),
    ))
    .limit(1)

  if (!challenge) return { ok: false, error: 'profile signature challenge was not found or was already used' }
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: 'profile signature challenge expired' }

  const isValid = await verifyMessage({
    address: wallet as `0x${string}`,
    message,
    signature,
  }).catch(() => false)

  if (!isValid) return { ok: false, error: 'profile signature did not match the connected wallet' }

  await db!
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(authChallenges.id, challenge.id))

  return { ok: true }
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

function buildProfileChallengeMessage({
  wallet,
  nonce,
  issuedAt,
  expiresAt,
}: {
  wallet: string
  nonce: string
  issuedAt: Date
  expiresAt: Date
}) {
  return [
    'Helia Court profile update',
    '',
    `Origin: ${env.APP_ORIGIN}`,
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    '',
    'Sign this message to update your Helia Court profile. This does not send a transaction or spend gas.',
  ].join('\n')
}
