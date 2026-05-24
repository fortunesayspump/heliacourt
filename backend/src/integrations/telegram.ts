import { env } from '../config/env.js'
import type { HearingJob } from '../agents/hearings/index.js'
import type { CourtArtifact, CourtTranscriptTurn } from '../court/types.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { telegramAlertSubscriptions } from '../db/schema.js'

type TelegramAlert = {
  title: string
  body: string
  href?: string
}

const telegramApiBase = 'https://api.telegram.org'

export const TELEGRAM_BOT_COMMANDS = [
  { command: 'cases', description: 'Latest public cases' },
  { command: 'case', description: 'Case status and verdict' },
  { command: 'transcript', description: 'Latest transcript turns' },
  { command: 'receipts', description: 'Arc receipt summary' },
  { command: 'file', description: 'Prepare a filing from a market URL' },
  { command: 'connect', description: 'Link Telegram to your wallet' },
  { command: 'me', description: 'Linked wallet account summary' },
  { command: 'mycases', description: 'Cases tied to your linked wallet' },
  { command: 'notifications', description: 'Wallet account notifications' },
  { command: 'subscribe', description: 'Receive case alerts in this chat' },
  { command: 'unsubscribe', description: 'Stop case alerts in this chat' },
  { command: 'alerts', description: 'Check alert subscription status' },
  { command: 'disconnect', description: 'Unlink Telegram from your wallet' },
] as const

export async function registerTelegramBotCommands() {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, skipped: true }

  const response = await fetch(`${telegramApiBase}/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS }),
  })

  if (!response.ok) {
    throw new Error(`telegram command registration failed: ${response.status}`)
  }

  return { ok: true, skipped: false }
}

export async function sendTelegramAlert(alert: TelegramAlert) {
  const chatIds = await getTelegramChatIds()
  if (!env.TELEGRAM_BOT_TOKEN || !chatIds.length) return { sent: 0, skipped: true }

  const text = [
    `Helia Court: ${alert.title}`,
    alert.body,
    alert.href ? `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}${alert.href}` : undefined,
  ].filter(Boolean).join('\n\n')

  const results = await Promise.allSettled(chatIds.map((chatId) => sendTelegramMessage(chatId, text)))
  return {
    sent: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  }
}

export function notifyCaseFiled(params: {
  caseId: string
  title: string
  budgetUsdc?: string
  status?: string
}) {
  return sendTelegramAlert({
    title: 'case filed',
    body: [
      params.title,
      params.budgetUsdc ? `Budget: ${params.budgetUsdc} USDC` : undefined,
      params.status ? `Status: ${params.status}` : undefined,
    ].filter(Boolean).join('\n'),
    href: `/cases/${encodeURIComponent(params.caseId)}`,
  })
}

export function notifyCaseFunded(params: {
  caseId: string
  title: string
  amountUsdc: string
  txHash: string
}) {
  return sendTelegramAlert({
    title: 'case funded',
    body: [
      params.title,
      `Amount: ${params.amountUsdc} USDC`,
      `Tx: ${shortHash(params.txHash)}`,
    ].join('\n'),
    href: `/cases/${encodeURIComponent(params.caseId)}?tab=receipts`,
  })
}

export function notifyCaseCompleted(params: {
  caseId: string
  title: string
  verdict?: string
  confidence?: number
  receiptCount?: number
}) {
  return sendTelegramAlert({
    title: 'verdict sealed',
    body: [
      params.title,
      params.verdict ? `Verdict: ${params.verdict}` : undefined,
      typeof params.confidence === 'number' ? `Confidence: ${Math.round(params.confidence * 100)}%` : undefined,
      typeof params.receiptCount === 'number' ? `Receipts: ${params.receiptCount}` : undefined,
    ].filter(Boolean).join('\n'),
    href: `/cases/${encodeURIComponent(params.caseId)}`,
  })
}

async function sendTelegramMessage(chatId: string, text: string) {
  const response = await fetch(`${telegramApiBase}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`telegram send failed: ${response.status}`)
  }
}

async function getTelegramChatIds() {
  const configuredChatIds = (env.TELEGRAM_ALERT_CHAT_IDS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (!isDatabaseConfigured) return configuredChatIds

  const subscriptions = await db!
    .select({ chatId: telegramAlertSubscriptions.chatId })
    .from(telegramAlertSubscriptions)

  return Array.from(new Set([
    ...configuredChatIds,
    ...subscriptions.map((item) => item.chatId),
  ]))
}

function shortHash(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value
}

export function buildTelegramBotReply(text: string, jobs: HearingJob[]) {
  const [command = '', ...args] = text.trim().split(/\s+/)
  const name = command.toLowerCase().replace(/@\w+$/, '')

  if (name === '/start' || name === '/help') {
    return [
      'Helia Court bot',
      '',
      '/cases - latest public cases',
      '/case <id> - case status and verdict',
      '/transcript <id> - latest transcript turns',
      '/receipts <id> - Arc receipt summary',
      '/file <market-url> - prepare a filing link',
      '/subscribe - receive case alerts in this chat',
      '/unsubscribe - stop case alerts in this chat',
      '/connect - link Telegram to your wallet',
    ].join('\n')
  }

  if (name === '/cases' || name === '/latest') {
    const latest = jobs.slice(0, 6)
    if (!latest.length) return 'No public cases yet.'
    return latest.map((job, index) => [
      `${index + 1}. ${job.marketCase.question}`,
      `${formatJobStatus(job)} - /case ${job.marketCase.id}`,
    ].join('\n')).join('\n\n')
  }

  if (name === '/case') {
    const job = findJob(jobs, args[0])
    if (!job) return 'Case not found. Try /cases.'
    const result = getResult(job)
    const verdict = findVerdict(result?.artifacts)
    return [
      job.marketCase.question,
      `Status: ${formatJobStatus(job)}`,
      verdict?.summary ? `Verdict: ${truncate(verdict.summary, 420)}` : undefined,
      typeof verdict?.confidence === 'number' ? `Confidence: ${Math.round(verdict.confidence * 100)}%` : undefined,
      `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/cases/${encodeURIComponent(job.marketCase.id)}`,
    ].filter(Boolean).join('\n\n')
  }

  if (name === '/transcript') {
    const job = findJob(jobs, args[0])
    if (!job) return 'Case not found. Try /cases.'
    const turns = getResult(job)?.transcript?.slice(-6) ?? []
    if (!turns.length) return 'No transcript turns available yet.'
    return turns.map((turn) => `${turn.agentName}: ${truncate(turn.message, 260)}`).join('\n\n')
  }

  if (name === '/receipts') {
    const job = findJob(jobs, args[0])
    if (!job) return 'Case not found. Try /cases.'
    const settlement = getResult(job)?.onchainSettlement
    const receipts = settlement?.receipts ?? []
    if (!receipts.length) return 'No Arc receipts recorded yet.'
    return receipts.slice(-8).map((receipt) => [
      receipt.type,
      receipt.amountUsdc ? `${receipt.amountUsdc} USDC` : undefined,
      shortHash(receipt.txHash),
    ].filter(Boolean).join(' - ')).join('\n')
  }

  if (name === '/file') {
    const url = args[0]
    if (!url || !/^https?:\/\//i.test(url)) return 'Send /file followed by a Polymarket, Kalshi, or Manifold URL.'
    const filingUrl = `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/cases/new?url=${encodeURIComponent(url)}`
    return `Open a filing draft:\n${filingUrl}`
  }

  return 'Unknown command. Try /help.'
}

function findJob(jobs: HearingJob[], value?: string) {
  if (!value) return undefined
  return jobs.find((job) => job.marketCase.id === value || job.caseId === value || job.id === value || job.marketCase.id.startsWith(value))
}

function getResult(job: HearingJob) {
  return job.result as {
    artifacts?: CourtArtifact[]
    transcript?: CourtTranscriptTurn[]
    onchainSettlement?: {
      receipts?: Array<{
        type: string
        txHash: string
        amountUsdc?: string
      }>
    }
  } | undefined
}

function findVerdict(artifacts?: CourtArtifact[]) {
  return artifacts?.filter((artifact) => artifact.type === 'verdict').at(-1)
}

function formatJobStatus(job: HearingJob) {
  if (job.status === 'completed') return 'Verdict'
  if (job.status === 'running') return 'Hearing'
  return job.status.slice(0, 1).toUpperCase() + job.status.slice(1)
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value
}
