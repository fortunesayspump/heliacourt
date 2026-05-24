import { randomUUID } from 'node:crypto'
import { desc, eq, isNull, and } from 'drizzle-orm'
import { db, isDatabaseConfigured } from '../../db/client.js'
import { caseFollows, caseParticipants, cases, onchainReceipts, telegramAccounts, telegramAlertSubscriptions, telegramLinkRequests, users } from '../../db/schema.js'

const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000

export async function createTelegramLinkRequest({
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

export async function subscribeChatToAlerts({
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

export async function unsubscribeChatFromAlerts(chatId: string) {
  await db!.delete(telegramAlertSubscriptions).where(eq(telegramAlertSubscriptions.chatId, chatId))
}

export async function isChatSubscribedToAlerts(chatId: string) {
  if (!isDatabaseConfigured) return false
  const [subscription] = await db!
    .select({ chatId: telegramAlertSubscriptions.chatId })
    .from(telegramAlertSubscriptions)
    .where(eq(telegramAlertSubscriptions.chatId, chatId))
    .limit(1)
  return Boolean(subscription)
}

export async function getActiveLinkRequest(token: string) {
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

export async function getLinkedTelegramAccount(telegramUserId: string) {
  if (!isDatabaseConfigured) return undefined
  const [account] = await db!
    .select()
    .from(telegramAccounts)
    .where(eq(telegramAccounts.telegramUserId, telegramUserId))
    .limit(1)
  return account
}

export async function getWalletAccount(wallet: string) {
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

export async function getWalletNotifications(wallet: string) {
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

export async function ensureUser(wallet: string) {
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

export function shortWallet(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}
