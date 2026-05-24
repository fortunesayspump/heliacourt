import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { verifyMessage } from 'viem'
import { z } from 'zod'
import { listHearingJobs } from '../../agents/hearings/index.js'
import { env } from '../../config/env.js'
import { db, isDatabaseConfigured } from '../../db/client.js'
import { authChallenges, telegramAccounts, telegramLinkRequests } from '../../db/schema.js'
import { TELEGRAM_BOT_COMMANDS, buildTelegramBotReply } from '../../integrations/telegram.js'
import {
  createTelegramLinkRequest,
  ensureUser,
  getActiveLinkRequest,
  getLinkedTelegramAccount,
  getWalletAccount,
  getWalletNotifications,
  isChatSubscribedToAlerts,
  shortWallet,
  subscribeChatToAlerts,
  unsubscribeChatFromAlerts,
} from './account-service.js'
import { answerTelegramCallback, deleteTelegramMessage, editTelegramMessage, sendTelegramReply } from './bot-api.js'
import {
  buildAccountReply,
  buildConnectReply,
  buildDashboardReply,
  casesKeyboard,
  dashboardKeyboard,
  decorateLegacyReply,
  formatTitleCase,
  truncateTelegramLine,
  withKeyboard,
} from './dashboard.js'
import type { TelegramReply, TelegramUpdate } from './types.js'

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
    await unsubscribeChatFromAlerts(chatId)
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
      await unsubscribeChatFromAlerts(chatId)
      return withKeyboard('Alerts are off for this chat.', dashboardKeyboard(Boolean(account), false))
    }
    if (!isDatabaseConfigured) return withKeyboard('Alert subscriptions are unavailable while the database is not configured.', dashboardKeyboard(Boolean(account)))
    await subscribeChatToAlerts({ chatId, chatType, chatTitle, telegramUserId })
    return withKeyboard('Alerts are on for this chat. I will post case updates here.', dashboardKeyboard(Boolean(account), true))
  }

  return withKeyboard('Unknown dashboard action. Open the dashboard below.', dashboardKeyboard(Boolean(account)))
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
