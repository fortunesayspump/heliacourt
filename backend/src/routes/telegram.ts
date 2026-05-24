import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { verifyMessage } from 'viem'
import { z } from 'zod'
import { listHearingJobs } from '../agents/hearings/index.js'
import { env } from '../config/env.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { authChallenges, caseFollows, caseParticipants, cases, onchainReceipts, telegramAccounts, telegramAlertSubscriptions, telegramLinkRequests, users } from '../db/schema.js'
import { TELEGRAM_BOT_COMMANDS, buildTelegramBotReply } from '../integrations/telegram.js'

type TelegramUpdate = {
  message?: {
    message_id?: number
    chat?: { id?: number | string; type?: string; title?: string; username?: string; first_name?: string }
    from?: { id?: number | string; username?: string; first_name?: string }
    text?: string
  }
  callback_query?: {
    id?: string
    data?: string
    from?: { id?: number | string; username?: string; first_name?: string }
    message?: {
      message_id?: number
      chat?: { id?: number | string; type?: string; title?: string; username?: string; first_name?: string }
    }
  }
}

type TelegramInlineKeyboard = Array<Array<{
  text: string
  callback_data?: string
  url?: string
}>>

type TelegramReply = {
  text: string
  replyMarkup?: {
    inline_keyboard: TelegramInlineKeyboard
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
    if (update.callback_query) {
      const callback = update.callback_query
      const chatId = callback.message?.chat?.id
      const messageId = callback.message?.message_id
      const telegramUserId = callback.from?.id ? String(callback.from.id) : undefined
      if (!chatId || !telegramUserId) return { ok: true }

      await answerTelegramCallback(callback.id).catch((error) => {
        request.log.warn({ err: error }, 'telegram callback answer failed')
      })

      if (callback.data === 'dash:dismiss' && messageId) {
        await deleteTelegramMessage(String(chatId), messageId).catch((error) => {
          request.log.warn({ err: error, chatId: String(chatId), messageId }, 'telegram dashboard delete failed')
        })
        return { ok: true }
      }

      const response = await buildTelegramCallbackReply({
        data: callback.data ?? 'dash:home',
        chatId: String(chatId),
        messageId,
        telegramUserId,
        username: callback.from?.username,
        firstName: callback.from?.first_name,
        chatType: callback.message?.chat?.type,
        chatTitle: callback.message?.chat?.title ?? callback.message?.chat?.username ?? callback.message?.chat?.first_name,
      }).catch((error) => {
        request.log.error({ err: error, chatId: String(chatId), telegramUserId }, 'telegram callback failed')
        return {
          text: 'Something went wrong while opening that dashboard action. Try /dashboard again.',
          replyMarkup: dashboardKeyboard(Boolean(telegramUserId)),
        }
      })

      if (messageId) {
        await editTelegramMessage(String(chatId), messageId, response).catch(async (error) => {
          request.log.warn({ err: error, chatId: String(chatId), messageId }, 'telegram dashboard edit failed')
          await sendTelegramReply(String(chatId), response)
        })
      } else {
        await sendTelegramReply(String(chatId), response)
      }
      return { ok: true }
    }

    const message = update.message
    const chatId = message?.chat?.id
    const from = message?.from
    const text = message?.text

    if (!chatId || !text) return { ok: true }

    const responseText = await buildTelegramReply({
      text,
      chatId: String(chatId),
      chatType: message?.chat?.type,
      chatTitle: message?.chat?.title ?? message?.chat?.username ?? message?.chat?.first_name,
      telegramUserId: from?.id ? String(from.id) : String(chatId),
      username: from?.username,
      firstName: from?.first_name,
    }).catch((error) => {
      request.log.error({
        err: error,
        chatId: String(chatId),
        telegramUserId: from?.id ? String(from.id) : String(chatId),
      }, 'telegram command failed')
      return {
        text: 'Something went wrong while handling that command. Try again in a moment, or open /dashboard.',
        replyMarkup: dashboardKeyboard(false),
      }
    })
    await sendTelegramReply(String(chatId), responseText).catch((error) => {
      request.log.warn({
        err: error,
        chatId: String(chatId),
        telegramUserId: from?.id ? String(from.id) : String(chatId),
      }, 'telegram reply failed')
    })

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

    await sendTelegramReply(
      linkRequest.chatId,
      `Telegram linked to wallet ${shortWallet(wallet)}. Send /me to view your account or /mycases to inspect your cases.`,
    ).catch((error) => {
      request.log.warn({
        err: error,
        telegramUserId: linkRequest.telegramUserId,
      }, 'telegram link confirmation failed')
    })

    return {
      ok: true,
      wallet,
      telegram: {
        telegramUserId: linkRequest.telegramUserId,
        username: linkRequest.username,
        firstName: linkRequest.firstName,
        linkedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    }
  })

  app.get('/telegram/commands', async () => ({
    commands: TELEGRAM_BOT_COMMANDS,
  }))
}

async function buildTelegramReply({
  text,
  chatId,
  chatType,
  chatTitle,
  telegramUserId,
  username,
  firstName,
}: {
  text: string
  chatId: string
  chatType?: string
  chatTitle?: string
  telegramUserId: string
  username?: string
  firstName?: string
}): Promise<TelegramReply> {
  const jobs = (await listHearingJobs()).filter((job) => (job.marketCase.visibility ?? 'public') === 'public')
  const [command = ''] = text.trim().split(/\s+/)
  const name = command.toLowerCase().replace(/@\w+$/, '')
  const account = await getLinkedTelegramAccount(telegramUserId)

  if (name === '/start' || name === '/help' || name === '/dashboard' || name === '/home') {
    return buildDashboardReply({
      telegramUserId,
      firstName,
      account,
      jobs,
      subscribed: await isChatSubscribedToAlerts(chatId),
    })
  }

  if (name === '/connect' || name === '/link') {
    if (!isDatabaseConfigured) return withKeyboard('Account linking is unavailable while the database is not configured.', dashboardKeyboard(Boolean(account)))
    const token = await createTelegramLinkRequest({ telegramUserId, chatId, username, firstName })
    const url = `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/profile?telegramLink=${encodeURIComponent(token)}`
    return buildConnectReply(url)
  }

  if (name === '/subscribe' || name === '/alerts_on') {
    if (!isDatabaseConfigured) return withKeyboard('Alert subscriptions are unavailable while the database is not configured.', dashboardKeyboard(Boolean(account)))
    await subscribeChatToAlerts({ chatId, chatType, chatTitle, telegramUserId })
    return withKeyboard('Alerts are on for this chat. I will post case updates here.', dashboardKeyboard(Boolean(account), true))
  }

  if (name === '/unsubscribe' || name === '/alerts_off') {
    if (!isDatabaseConfigured) return withKeyboard('Alert subscriptions are unavailable while the database is not configured.', dashboardKeyboard(Boolean(account)))
    await db!.delete(telegramAlertSubscriptions).where(eq(telegramAlertSubscriptions.chatId, chatId))
    return withKeyboard('Alerts are off for this chat.', dashboardKeyboard(Boolean(account), false))
  }

  if (name === '/alerts') {
    const subscribed = await isChatSubscribedToAlerts(chatId)
    return withKeyboard(
      subscribed ? 'Alerts are on for this chat.' : 'Alerts are off for this chat.',
      dashboardKeyboard(Boolean(account), subscribed),
    )
  }

  if (name === '/account' || name === '/me') {
    if (!account) return withKeyboard('No wallet linked yet. Use Connect Wallet below.', dashboardKeyboard(false))
    return buildAccountReply(await getWalletAccount(account.wallet))
  }

  if (name === '/mycases') {
    if (!account) return withKeyboard('No wallet linked yet. Use Connect Wallet below.', dashboardKeyboard(false))
    const summary = await getWalletAccount(account.wallet)
    const items = [...summary.cases, ...summary.follows].slice(0, 8)
    if (!items.length) return withKeyboard(`Wallet ${shortWallet(account.wallet)} has no filed or followed cases yet.`, dashboardKeyboard(true))
    return {
      text: [
        'Arc case desk',
        '',
        ...items.map((item, index) => `${index + 1}. ${truncateTelegramLine(item.title, 92)}\n${formatTitleCase(item.role)} - ${formatTitleCase(item.visibility)}`),
      ].join('\n\n'),
      replyMarkup: casesKeyboard(items),
    }
  }

  if (name === '/notifications') {
    if (!account) return withKeyboard('No wallet linked yet. Use Connect Wallet below.', dashboardKeyboard(false))
    const notifications = await getWalletNotifications(account.wallet)
    if (!notifications.length) return withKeyboard(`No account notifications for ${shortWallet(account.wallet)} yet.`, dashboardKeyboard(true))
    return withKeyboard([
      'Recent account signals',
      '',
      ...notifications.map((item, index) => `${index + 1}. ${truncateTelegramLine(item.title, 80)}\n${item.detail}`),
    ].join('\n\n'), dashboardKeyboard(true))
  }

  if (name === '/disconnect' || name === '/unlink') {
    if (!isDatabaseConfigured) return withKeyboard('Account linking is unavailable while the database is not configured.', dashboardKeyboard(Boolean(account)))
    await db!.delete(telegramAccounts).where(eq(telegramAccounts.telegramUserId, telegramUserId))
    return withKeyboard('Telegram has been unlinked from your Arc profile.', dashboardKeyboard(false))
  }

  return decorateLegacyReply(buildTelegramBotReply(text, jobs), Boolean(account))
}

async function buildTelegramCallbackReply({
  data,
  chatId,
  telegramUserId,
  username,
  firstName,
  chatType,
  chatTitle,
}: {
  data: string
  chatId: string
  messageId?: number
  telegramUserId: string
  username?: string
  firstName?: string
  chatType?: string
  chatTitle?: string
}): Promise<TelegramReply> {
  const jobs = (await listHearingJobs()).filter((job) => (job.marketCase.visibility ?? 'public') === 'public')
  const account = await getLinkedTelegramAccount(telegramUserId)

  if (data === 'dash:home') {
    return buildDashboardReply({
      telegramUserId,
      firstName,
      account,
      jobs,
      subscribed: await isChatSubscribedToAlerts(chatId),
    })
  }
  if (data === 'dash:connect') {
    if (!isDatabaseConfigured) return withKeyboard('Account linking is unavailable while the database is not configured.', dashboardKeyboard(Boolean(account)))
    const token = await createTelegramLinkRequest({ telegramUserId, chatId, username, firstName })
    const url = `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/profile?telegramLink=${encodeURIComponent(token)}`
    return buildConnectReply(url)
  }
  if (data === 'dash:me') {
    if (!account) return withKeyboard('No wallet linked yet. Use Connect Wallet below.', dashboardKeyboard(false))
    return buildAccountReply(await getWalletAccount(account.wallet))
  }
  if (data === 'dash:cases') {
    if (!account) return withKeyboard('No wallet linked yet. Use Connect Wallet below.', dashboardKeyboard(false))
    const summary = await getWalletAccount(account.wallet)
    const items = [...summary.cases, ...summary.follows].slice(0, 8)
    if (!items.length) return withKeyboard(`Wallet ${shortWallet(account.wallet)} has no filed or followed cases yet.`, dashboardKeyboard(true))
    return {
      text: [
        'Arc case desk',
        '',
        ...items.map((item, index) => `${index + 1}. ${truncateTelegramLine(item.title, 92)}\n${formatTitleCase(item.role)} - ${formatTitleCase(item.visibility)}`),
      ].join('\n\n'),
      replyMarkup: casesKeyboard(items),
    }
  }
  if (data === 'dash:alerts') {
    const subscribed = await isChatSubscribedToAlerts(chatId)
    if (subscribed) {
      await db!.delete(telegramAlertSubscriptions).where(eq(telegramAlertSubscriptions.chatId, chatId))
      return withKeyboard('Alerts are off for this chat.', dashboardKeyboard(Boolean(account), false))
    }
    if (!isDatabaseConfigured) return withKeyboard('Alert subscriptions are unavailable while the database is not configured.', dashboardKeyboard(Boolean(account)))
    await subscribeChatToAlerts({ chatId, chatType, chatTitle, telegramUserId })
    return withKeyboard('Alerts are on for this chat. I will post case updates here.', dashboardKeyboard(Boolean(account), true))
  }

  return withKeyboard('Unknown dashboard action. Open the dashboard below.', dashboardKeyboard(Boolean(account)))
}

async function sendTelegramReply(chatId: string, reply: TelegramReply | string) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return
  const normalized = typeof reply === 'string' ? { text: reply } : reply

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: normalized.text,
      disable_web_page_preview: true,
      reply_markup: normalized.replyMarkup,
    }),
  })

  if (!response.ok) {
    throw new Error(`telegram reply failed: ${response.status}`)
  }
}

async function editTelegramMessage(chatId: string, messageId: number, reply: TelegramReply) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: reply.text,
      disable_web_page_preview: true,
      reply_markup: reply.replyMarkup,
    }),
  })

  if (!response.ok) {
    throw new Error(`telegram edit failed: ${response.status}`)
  }
}

async function deleteTelegramMessage(chatId: string, messageId: number) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  })

  if (!response.ok) {
    throw new Error(`telegram delete failed: ${response.status}`)
  }
}

async function answerTelegramCallback(callbackId?: string) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token || !callbackId) return

  const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  })

  if (!response.ok) {
    throw new Error(`telegram callback answer failed: ${response.status}`)
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

async function subscribeChatToAlerts({
  chatId,
  chatType,
  chatTitle,
  telegramUserId,
}: {
  chatId: string
  chatType?: string
  chatTitle?: string
  telegramUserId: string
}) {
  const now = new Date()
  await db!
    .insert(telegramAlertSubscriptions)
    .values({
      chatId,
      chatType,
      title: chatTitle,
      subscribedByTelegramUserId: telegramUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: telegramAlertSubscriptions.chatId,
      set: {
        chatType,
        title: chatTitle,
        subscribedByTelegramUserId: telegramUserId,
        updatedAt: now,
      },
    })
}

async function isChatSubscribedToAlerts(chatId: string) {
  if (!isDatabaseConfigured) return false
  const [subscription] = await db!
    .select({ chatId: telegramAlertSubscriptions.chatId })
    .from(telegramAlertSubscriptions)
    .where(eq(telegramAlertSubscriptions.chatId, chatId))
    .limit(1)
  return Boolean(subscription)
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

function buildDashboardReply({
  firstName,
  account,
  jobs,
  subscribed,
}: {
  telegramUserId: string
  firstName?: string
  account?: Awaited<ReturnType<typeof getLinkedTelegramAccount>>
  jobs: Awaited<ReturnType<typeof listHearingJobs>>
  subscribed: boolean
}): TelegramReply {
  const latest = jobs.slice(0, 3)
  const lines = [
    'Arc Court dashboard',
    '',
    `${firstName ? `Welcome, ${firstName}.` : 'Welcome.'}`,
    account ? `Wallet: ${shortWallet(account.wallet)}` : 'Wallet: not linked',
    `Public cases: ${jobs.length}`,
    `Alerts: ${subscribed ? 'on' : 'off'}`,
    '',
    latest.length ? 'Latest hearings:' : 'No public hearings yet.',
    ...latest.map((job, index) => `${index + 1}. ${truncateTelegramLine(job.marketCase.question, 82)}\n${formatJobStatus(job)}`),
  ]

  return {
    text: lines.filter(Boolean).join('\n'),
    replyMarkup: dashboardKeyboard(Boolean(account), subscribed),
  }
}

function buildConnectReply(url: string): TelegramReply {
  return {
    text: [
      'Connect wallet',
      '',
      'Open the secure link, connect your wallet, and sign once.',
      'No transaction, gas, or private key is required.',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: 'Open secure link', url }],
        [{ text: 'Back to dashboard', callback_data: 'dash:home' }, { text: 'Dismiss', callback_data: 'dash:dismiss' }],
      ],
    },
  }
}

function buildAccountReply(summary: Awaited<ReturnType<typeof getWalletAccount>>): TelegramReply {
  const name = summary.profile.displayName || summary.profile.username || shortWallet(summary.wallet)
  return {
    text: [
      'Arc account',
      '',
      `Name: ${name}`,
      `Wallet: ${shortWallet(summary.wallet)}`,
      `Filed cases: ${summary.cases.length}`,
      `Followed cases: ${summary.follows.length}`,
      `Participation: ${summary.participation.length}`,
      `Payout receipts: ${summary.payouts.length}`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: 'Open profile', url: `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/profile?wallet=${encodeURIComponent(summary.wallet)}` }],
        [{ text: 'My cases', callback_data: 'dash:cases' }, { text: 'Refresh', callback_data: 'dash:me' }],
        [{ text: 'Dashboard', callback_data: 'dash:home' }, { text: 'Dismiss', callback_data: 'dash:dismiss' }],
      ],
    },
  }
}

function dashboardKeyboard(linked: boolean, subscribed = false): { inline_keyboard: TelegramInlineKeyboard } {
  return {
    inline_keyboard: [
      linked
        ? [{ text: 'My wallet', callback_data: 'dash:me' }, { text: 'My cases', callback_data: 'dash:cases' }]
        : [{ text: 'Connect Wallet', callback_data: 'dash:connect' }],
      [{ text: subscribed ? 'Alerts On' : 'Alerts Off', callback_data: 'dash:alerts' }, { text: 'Open app', url: env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '') }],
      [{ text: 'Refresh', callback_data: 'dash:home' }, { text: 'Dismiss', callback_data: 'dash:dismiss' }],
    ],
  }
}

function casesKeyboard(items: Array<{ id: string }>): { inline_keyboard: TelegramInlineKeyboard } {
  return {
    inline_keyboard: [
      ...items.slice(0, 5).map((item, index) => ([{
        text: `Open case ${index + 1}`,
        url: `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/cases/${encodeURIComponent(item.id)}`,
      }])),
      [{ text: 'Dashboard', callback_data: 'dash:home' }, { text: 'Dismiss', callback_data: 'dash:dismiss' }],
    ],
  }
}

function withKeyboard(text: string, replyMarkup: { inline_keyboard: TelegramInlineKeyboard }): TelegramReply {
  return { text, replyMarkup }
}

function decorateLegacyReply(text: string, linked: boolean): TelegramReply {
  return { text, replyMarkup: dashboardKeyboard(linked) }
}

function formatJobStatus(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  if (job.status === 'completed') return 'Verdict'
  if (job.status === 'running') return 'Hearing'
  return formatTitleCase(job.status)
}

function truncateTelegramLine(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3).trim()}...` : value
}

function formatTitleCase(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
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
