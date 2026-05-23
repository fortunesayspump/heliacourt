import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { verifyMessage } from 'viem'
import { z } from 'zod'
import { listHearingJobs } from '../agents/hearing-jobs.js'
import { env } from '../config/env.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { authChallenges, caseFollows, caseParticipants, cases, onchainReceipts, telegramAccounts, telegramLinkRequests, users } from '../db/schema.js'
import { buildTelegramBotReply } from '../integrations/telegram.js'

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string }
    from?: { id?: number | string; username?: string; first_name?: string }
    text?: string
  }
}

const walletSchema = z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value))
const linkChallengeSchema = z.object({
  token: z.string().uuid(),
  wallet: walletSchema,
})
const linkSchema = linkChallengeSchema.extend({
  auth: z.object({
    message: z.string().min(1),
    signature: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)),
  }),
})
const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000
const TELEGRAM_LINK_PURPOSE_PREFIX = 'telegram:link'

export async function telegramRoutes(app: FastifyInstance) {
  app.post('/telegram/webhook', async (request, reply) => {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers['x-telegram-bot-api-secret-token']
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return reply.code(401).send({ ok: false })
      }
    }

    const update = request.body as TelegramUpdate
    const chatId = update.message?.chat?.id
    const from = update.message?.from
    const text = update.message?.text

    if (!chatId || !text) return { ok: true }

    const jobs = (await listHearingJobs()).filter((job) => (job.marketCase.visibility ?? 'public') === 'public')
    const responseText = await buildTelegramReply({
      text,
      chatId: String(chatId),
      telegramUserId: from?.id ? String(from.id) : String(chatId),
      username: from?.username,
      firstName: from?.first_name,
      jobs,
    })
    await sendTelegramReply(String(chatId), responseText)

    return { ok: true }
  })

  app.post('/telegram/link-challenge', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const parsed = linkChallengeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid link request' })

    const token = parsed.data.token
    const wallet = normalizeWallet(parsed.data.wallet)
    const linkRequest = await getActiveLinkRequest(token)
    if (!linkRequest) return reply.status(404).send({ error: 'telegram link request expired or not found' })

    await ensureUser(wallet)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000)
    const nonce = randomUUID()
    const message = buildTelegramLinkChallengeMessage({
      wallet,
      telegramUserId: linkRequest.telegramUserId,
      token,
      nonce,
      issuedAt: now,
      expiresAt,
    })

    await db!
      .insert(authChallenges)
      .values({
        id: randomUUID(),
        wallet,
        nonce,
        message,
        purpose: telegramLinkPurpose(token),
        expiresAt,
        createdAt: now,
      })

    return {
      wallet,
      token,
      message,
      expiresAt: expiresAt.toISOString(),
    }
  })

  app.post('/telegram/link', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const parsed = linkSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid link request' })

    const token = parsed.data.token
    const wallet = normalizeWallet(parsed.data.wallet)
    const linkRequest = await getActiveLinkRequest(token)
    if (!linkRequest) return reply.status(404).send({ error: 'telegram link request expired or not found' })

    const authorized = await consumeTelegramLinkChallenge({
      wallet,
      token,
      message: parsed.data.auth.message,
      signature: parsed.data.auth.signature,
    })
    if (!authorized.ok) return reply.status(401).send({ error: authorized.error })

    const now = new Date()
    await ensureUser(wallet)
    await db!
      .insert(telegramAccounts)
      .values({
        telegramUserId: linkRequest.telegramUserId,
        chatId: linkRequest.chatId,
        wallet,
        username: linkRequest.username,
        firstName: linkRequest.firstName,
        linkedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: telegramAccounts.telegramUserId,
        set: {
          chatId: linkRequest.chatId,
          wallet,
          username: linkRequest.username,
          firstName: linkRequest.firstName,
          updatedAt: now,
        },
      })

    await db!
      .update(telegramLinkRequests)
      .set({ wallet, consumedAt: now })
      .where(eq(telegramLinkRequests.id, linkRequest.id))

    return { ok: true, wallet, telegramUserId: linkRequest.telegramUserId }
  })

  app.get('/telegram/commands', async () => ({
    commands: [
      { command: 'cases', description: 'Latest public cases' },
      { command: 'case', description: 'Case status and verdict' },
      { command: 'transcript', description: 'Latest transcript turns' },
      { command: 'receipts', description: 'Arc receipt summary' },
      { command: 'file', description: 'Prepare a filing from a market URL' },
      { command: 'connect', description: 'Link Telegram to your wallet' },
      { command: 'account', description: 'Linked wallet account summary' },
      { command: 'mycases', description: 'Cases tied to your linked wallet' },
      { command: 'notifications', description: 'Wallet account notifications' },
      { command: 'disconnect', description: 'Unlink Telegram from your wallet' },
    ],
  }))
}

async function buildTelegramReply({
  text,
  chatId,
  telegramUserId,
  username,
  firstName,
  jobs,
}: {
  text: string
  chatId: string
  telegramUserId: string
  username?: string
  firstName?: string
  jobs: Awaited<ReturnType<typeof listHearingJobs>>
}) {
  const [command = ''] = text.trim().split(/\s+/)
  const name = command.toLowerCase().replace(/@\w+$/, '')

  if (name === '/connect' || name === '/link') {
    if (!isDatabaseConfigured) return 'Account linking is unavailable while the database is not configured.'
    const token = await createTelegramLinkRequest({ telegramUserId, chatId, username, firstName })
    const url = `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/profile?telegramLink=${encodeURIComponent(token)}`
    return [
      'Link this Telegram chat to your Helia Court wallet:',
      url,
      '',
      'Open it, connect your wallet, and sign the message. No transaction or gas is required.',
    ].join('\n')
  }

  if (name === '/account' || name === '/me') {
    const account = await getLinkedTelegramAccount(telegramUserId)
    if (!account) return 'No wallet linked yet. Send /connect first.'
    return formatAccountSummary(await getWalletAccount(account.wallet))
  }

  if (name === '/mycases') {
    const account = await getLinkedTelegramAccount(telegramUserId)
    if (!account) return 'No wallet linked yet. Send /connect first.'
    const summary = await getWalletAccount(account.wallet)
    const items = [...summary.cases, ...summary.follows].slice(0, 8)
    if (!items.length) return `Linked wallet ${shortWallet(account.wallet)} has no filed or followed cases yet.`
    return items.map((item, index) => [
      `${index + 1}. ${item.title}`,
      `${item.role} - ${item.visibility} - ${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/cases/${encodeURIComponent(item.id)}`,
    ].join('\n')).join('\n\n')
  }

  if (name === '/notifications') {
    const account = await getLinkedTelegramAccount(telegramUserId)
    if (!account) return 'No wallet linked yet. Send /connect first.'
    const notifications = await getWalletNotifications(account.wallet)
    if (!notifications.length) return `No account notifications for ${shortWallet(account.wallet)} yet.`
    return notifications.map((item, index) => [
      `${index + 1}. ${item.title}`,
      item.detail,
      `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}${item.href}`,
    ].join('\n')).join('\n\n')
  }

  if (name === '/disconnect' || name === '/unlink') {
    if (!isDatabaseConfigured) return 'Account linking is unavailable while the database is not configured.'
    await db!.delete(telegramAccounts).where(eq(telegramAccounts.telegramUserId, telegramUserId))
    return 'Telegram has been unlinked from Helia Court. Send /connect to link a wallet again.'
  }

  return buildTelegramBotReply(text, jobs)
}

async function sendTelegramReply(chatId: string, text: string) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`telegram reply failed: ${response.status}`)
  }
}

async function createTelegramLinkRequest({
  telegramUserId,
  chatId,
  username,
  firstName,
}: {
  telegramUserId: string
  chatId: string
  username?: string
  firstName?: string
}) {
  const now = new Date()
  const token = randomUUID()
  await db!
    .insert(telegramLinkRequests)
    .values({
      id: randomUUID(),
      token,
      telegramUserId,
      chatId,
      username,
      firstName,
      expiresAt: new Date(now.getTime() + TELEGRAM_LINK_TTL_MS),
      createdAt: now,
    })
  return token
}

async function getActiveLinkRequest(token: string) {
  const [linkRequest] = await db!
    .select()
    .from(telegramLinkRequests)
    .where(and(
      eq(telegramLinkRequests.token, token),
      isNull(telegramLinkRequests.consumedAt),
    ))
    .limit(1)

  if (!linkRequest || linkRequest.expiresAt.getTime() < Date.now()) return undefined
  return linkRequest
}

async function getLinkedTelegramAccount(telegramUserId: string) {
  if (!isDatabaseConfigured) return undefined
  const [account] = await db!
    .select()
    .from(telegramAccounts)
    .where(eq(telegramAccounts.telegramUserId, telegramUserId))
    .limit(1)
  return account
}

async function getWalletAccount(wallet: string) {
  const profile = await ensureUser(wallet)
  const [filedCases, followedCases, payoutRows] = await Promise.all([
    db!
      .select({
        id: cases.id,
        title: cases.question,
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
        id: cases.id,
        title: cases.question,
        visibility: cases.visibility,
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

  const payouts = payoutRows.filter((row) => {
    const payload = row.payload as { wallet?: string } | null
    return payload?.wallet?.toLowerCase() === wallet
  })

  return {
    profile,
    wallet,
    cases: filedCases.filter((item) => item.role === 'filer'),
    participation: filedCases,
    follows: followedCases.map((item) => ({ ...item, role: 'follow' })),
    payouts,
  }
}

async function getWalletNotifications(wallet: string) {
  const summary = await getWalletAccount(wallet)
  return [
    ...summary.payouts.map((row) => {
      const payload = row.payload as { amountUsdc?: string } | null
      return {
        href: `/cases/${row.caseId}?tab=receipts`,
        title: 'Receipt recorded',
        detail: payload?.amountUsdc ? `${payload.amountUsdc} USDC agent payout` : 'Agent payout recorded',
        createdAt: row.createdAt,
      }
    }),
    ...summary.participation.map((item) => ({
      href: `/cases/${item.id}`,
      title: item.title,
      detail: item.role === 'filer' ? 'Filed case updated' : `${item.role} participation updated`,
      createdAt: item.updatedAt,
    })),
    ...summary.follows.map((item) => ({
      href: `/cases/${item.id}`,
      title: item.title,
      detail: 'Followed case updated',
      createdAt: item.updatedAt,
    })),
  ]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 8)
}

function formatAccountSummary(summary: Awaited<ReturnType<typeof getWalletAccount>>) {
  const name = summary.profile.displayName || summary.profile.username || shortWallet(summary.wallet)
  return [
    `Linked account: ${name}`,
    `Wallet: ${shortWallet(summary.wallet)}`,
    `Filed cases: ${summary.cases.length}`,
    `Followed cases: ${summary.follows.length}`,
    `Participation: ${summary.participation.length}`,
    `Payout receipts: ${summary.payouts.length}`,
    `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/profile?wallet=${encodeURIComponent(summary.wallet)}`,
  ].join('\n')
}

async function consumeTelegramLinkChallenge({
  wallet,
  token,
  message,
  signature,
}: {
  wallet: string
  token: string
  message: string
  signature: `0x${string}`
}) {
  const [challenge] = await db!
    .select()
    .from(authChallenges)
    .where(and(
      eq(authChallenges.wallet, wallet),
      eq(authChallenges.message, message),
      eq(authChallenges.purpose, telegramLinkPurpose(token)),
      isNull(authChallenges.consumedAt),
    ))
    .limit(1)

  if (!challenge) return { ok: false, error: 'telegram link challenge was not found or was already used' }
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: 'telegram link challenge expired' }

  const isValid = await verifyMessage({
    address: wallet as `0x${string}`,
    message,
    signature,
  }).catch(() => false)

  if (!isValid) return { ok: false, error: 'telegram link signature did not match the connected wallet' }

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

function buildTelegramLinkChallengeMessage({
  wallet,
  telegramUserId,
  token,
  nonce,
  issuedAt,
  expiresAt,
}: {
  wallet: string
  telegramUserId: string
  token: string
  nonce: string
  issuedAt: Date
  expiresAt: Date
}) {
  return [
    'Helia Court Telegram link',
    '',
    `Origin: ${env.APP_ORIGIN}`,
    `Wallet: ${wallet}`,
    `Telegram User: ${telegramUserId}`,
    `Link Token: ${token}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    '',
    'Sign this message to link Telegram to your Helia Court wallet. This does not send a transaction, create a wallet, expose keys, or spend gas.',
  ].join('\n')
}

function telegramLinkPurpose(token: string) {
  return `${TELEGRAM_LINK_PURPOSE_PREFIX}:${token}`
}

function normalizeWallet(value: string) {
  return value.toLowerCase()
}

function shortWallet(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}
