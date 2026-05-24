import type { HearingJob } from '../../agents/hearings/index.js'
import { env } from '../../config/env.js'
import type { TelegramInlineKeyboard, TelegramReply } from './types.js'

type TelegramAccount = {
  wallet: string
} | undefined

export type TelegramWalletAccount = {
  profile: {
    displayName: string | null
    username: string | null
  }
  wallet: string
  cases: Array<{ id: string; title: string; role: string; visibility: string }>
  participation: Array<{ id: string; title: string; role: string; visibility: string }>
  follows: Array<{ id: string; title: string; role: string; visibility: string }>
  payouts: unknown[]
}

export function buildDashboardReply({
  firstName,
  account,
  jobs,
  subscribed,
}: {
  firstName?: string
  account?: TelegramAccount
  jobs: HearingJob[]
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

export function buildConnectReply(url: string): TelegramReply {
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

export function buildAccountReply(summary: TelegramWalletAccount): TelegramReply {
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
        [{ text: 'Open profile', url: `${appUrl()}/profile?wallet=${encodeURIComponent(summary.wallet)}` }],
        [{ text: 'My cases', callback_data: 'dash:cases' }, { text: 'Refresh', callback_data: 'dash:me' }],
        [{ text: 'Dashboard', callback_data: 'dash:home' }, { text: 'Dismiss', callback_data: 'dash:dismiss' }],
      ],
    },
  }
}

export function dashboardKeyboard(linked: boolean, subscribed = false): { inline_keyboard: TelegramInlineKeyboard } {
  return {
    inline_keyboard: [
      linked
        ? [{ text: 'My wallet', callback_data: 'dash:me' }, { text: 'My cases', callback_data: 'dash:cases' }]
        : [{ text: 'Connect Wallet', callback_data: 'dash:connect' }],
      [{ text: subscribed ? 'Alerts On' : 'Alerts Off', callback_data: 'dash:alerts' }, { text: 'Open app', url: appUrl() }],
      [{ text: 'Refresh', callback_data: 'dash:home' }, { text: 'Dismiss', callback_data: 'dash:dismiss' }],
    ],
  }
}

export function casesKeyboard(items: Array<{ id: string }>): { inline_keyboard: TelegramInlineKeyboard } {
  return {
    inline_keyboard: [
      ...items.slice(0, 5).map((item, index) => ([{
        text: `Open case ${index + 1}`,
        url: `${appUrl()}/cases/${encodeURIComponent(item.id)}`,
      }])),
      [{ text: 'Dashboard', callback_data: 'dash:home' }, { text: 'Dismiss', callback_data: 'dash:dismiss' }],
    ],
  }
}

export function withKeyboard(text: string, replyMarkup: { inline_keyboard: TelegramInlineKeyboard }): TelegramReply {
  return { text, replyMarkup }
}

export function decorateLegacyReply(text: string, linked: boolean): TelegramReply {
  return { text, replyMarkup: dashboardKeyboard(linked) }
}

export function truncateTelegramLine(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3).trim()}...` : value
}

export function formatTitleCase(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatJobStatus(job: HearingJob) {
  if (job.status === 'completed') return 'Verdict'
  if (job.status === 'running') return 'Hearing'
  return formatTitleCase(job.status)
}

function shortWallet(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function appUrl() {
  return env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')
}
