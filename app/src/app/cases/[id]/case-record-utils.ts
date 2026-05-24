import type { ApiCaseDetail, ApiCourtArtifact, ApiTranscriptTurn } from '../../../lib/backend-data'
import { getAgentAvatarUrl } from '../../../lib/agent-images'
import { getAgentRoleColorClass } from '../../../lib/agent-role-colors'

export type TranscriptSourceCard = {
  url: string
  title: string
  kind: string
  detail?: string
}

export function getRelatedLinks(caseLinks: string[] | undefined, context: string | undefined, artifacts: ApiCourtArtifact[]) {
  const submittedLinks: TranscriptSourceCard[] = (caseLinks ?? []).map((url) => ({
    url,
    title: formatUrlLabel(url),
    kind: isSupportedPredictionMarketLink(url) ? 'Market' : 'Case link',
    detail: domainFromUrl(url),
  }))
  const contextLinks: TranscriptSourceCard[] = extractUrls(context ?? '').map((url) => ({
    url,
    title: formatUrlLabel(url),
    kind: isSupportedPredictionMarketLink(url) ? 'Market' : 'Case link',
    detail: domainFromUrl(url),
  }))

  const sourceLinks: TranscriptSourceCard[] = artifacts
    .flatMap((artifact) => artifact.toolEvidence ?? [])
    .flatMap((evidence) => evidence.sources?.flatMap((source) => {
      if (!source.url) return []
      return [{
        url: source.url,
        title: source.title ?? formatUrlLabel(source.url),
        kind: evidence.capability ? formatAgentLabel(evidence.capability.replace(/_/g, '-')) : 'Source',
        detail: source.value,
      }]
    }) ?? [])

  const seen = new Set<string>()
  return [...submittedLinks, ...contextLinks, ...sourceLinks]
    .filter((source) => {
      const key = normalizeUrlForCompare(source.url)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

export function isSupportedPredictionMarketLink(link: string) {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '').toLowerCase()
    return ['polymarket.com', 'kalshi.com', 'manifold.markets'].some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export function formatUrlLabel(value: string) {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 82)
  } catch {
    return value
  }
}

export function formatAgentLabel(agentId?: string) {
  if (!agentId) return 'court'

  return agentId
    .replace(/-(?:witness|counsel|judge|clerk|bailiff|juror)$/i, '')
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatReceiptType(type: string) {
  if (type === 'case-added-funding') return 'Added Case Funding'

  return type
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

export function buildCaseHistoryEvents(
  courtCase: NonNullable<ApiCaseDetail['case']>,
  caseDetail: ApiCaseDetail,
  receipts: NonNullable<ApiCaseDetail['onchainSettlement']>['receipts'],
) {
  const events: Array<{ kind: string; title: string; detail: string; time?: string }> = []

  events.push({
    kind: 'Filing',
    title: 'Case filed',
    detail: `${courtCase.market ?? 'Prediction market'} question opened for review.`,
    time: courtCase.createdAt,
  })

  if (courtCase.onchain) {
    events.push({
      kind: 'Funding',
      title: `${courtCase.onchain.budgetUsdc} USDC escrowed`,
      detail: `Escrow case #${courtCase.onchain.caseId} opened on Arc.`,
      time: courtCase.createdAt,
    })
  }

  for (const turn of caseDetail.transcript.slice(0, 10)) {
    events.push({
      kind: formatAgentLabel(turn.seat),
      title: `${turn.agentName}: ${turn.stage}`,
      detail: summarizeTurn(turn),
      time: turn.createdAt,
    })
  }

  for (const artifact of caseDetail.artifacts.slice(0, 5)) {
    events.push({
      kind: formatReceiptType(artifact.type),
      title: artifact.summary,
      detail: artifact.claims?.slice(0, 2).join(' ') || artifact.transcriptMessage || 'Artifact recorded for the case.',
      time: artifact.createdAt,
    })
  }

  for (const receipt of receipts ?? []) {
    events.push({
      kind: formatReceiptType(receipt.type),
      title: receipt.agentId ? `${formatAgentLabel(receipt.agentId)} receipt` : 'Settlement receipt',
      detail: `${receipt.amountUsdc ? `${receipt.amountUsdc} USDC · ` : ''}${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-6)}`,
      time: caseDetail.case.updated,
    })
  }

  return events
    .sort((left, right) => Date.parse(left.time ?? '') - Date.parse(right.time ?? ''))
    .slice(0, 24)
}

export function formatHistoryDate(value?: string) {
  if (!value) return 'Pending'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function getVerdictDisplay({
  confidence,
  fallback,
  summary,
  transcriptMessage,
}: {
  confidence: string
  fallback?: string
  summary?: string
  transcriptMessage?: string
}) {
  const rawSummary = summary || fallback || 'Hearing pending'
  const title = formatVerdictTitle(rawSummary)
  const defaultBody = rawSummary !== title ? rawSummary : `Confidence: ${confidence}. Verdict-only intelligence; no trade is executed.`
  const body = stripRepeatedVerdictLead(transcriptMessage, rawSummary) || defaultBody

  return { title, body }
}

export function formatFilingKind(kind?: string) {
  if (kind === 'fresh-hearing') return 'Fresh hearing'
  if (kind === 'private-fork') return 'Private fork'
  return 'Case'
}

export function formatMarketType(value?: string) {
  if (!value || value === 'prediction-market') return 'Prediction market'
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

export function shortCaseId(id: string) {
  if (id.startsWith('0x') && id.length > 18) return `${id.slice(0, 8)}...${id.slice(-6)}`
  if (id.length > 18) return `${id.slice(0, 12)}...`
  return id
}

export function shortReceiptHash(value?: string) {
  if (!value) return 'Pending'
  if (value.length > 18) return `${value.slice(0, 10)}...${value.slice(-6)}`
  return value
}

export function summarizeSeatedAgents(transcript: ApiTranscriptTurn[]) {
  const byAgent = new Map<string, { id: string; name: string; seat: string; turns: number; avatarUrl?: string; roleColorClass?: string }>()

  for (const turn of transcript) {
    const current = byAgent.get(turn.agentId)
    if (current) {
      current.turns += 1
    } else {
      byAgent.set(turn.agentId, {
        id: turn.agentId,
        name: turn.agentName,
        seat: turn.seat,
        turns: 1,
        avatarUrl: getAgentAvatarUrl(turn.agentId, turn.agentName),
        roleColorClass: getAgentRoleColorClass(turn),
      })
    }
  }

  return [...byAgent.values()].sort((left, right) => right.turns - left.turns)
}

function summarizeTurn(turn: ApiTranscriptTurn) {
  return turn.message.length > 120 ? `${turn.message.slice(0, 117)}...` : turn.message
}

function extractUrls(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi))
    .map((match) => match[0].replace(/[.,;:!?]+$/, ''))
}

function normalizeUrlForCompare(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return value.replace(/\/$/, '').toLowerCase()
  }
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function formatVerdictTitle(value: string) {
  const normalized = value.replace(/^verdict:\s*/i, '').trim()
  const lower = normalized.toLowerCase()

  if (lower.includes('leaning yes')) return 'Leaning Yes'
  if (lower.includes('leaning no')) return 'Leaning No'
  if (lower.includes('unresolved')) return 'Unresolved'
  if (lower.includes('hearing open')) return 'Hearing Open'
  if (lower.includes('settled yes')) return 'Settled Yes'
  if (lower.includes('settled no')) return 'Settled No'

  const firstClause = normalized.split(/[.,;:]/)[0]?.trim()
  if (firstClause && firstClause.length <= 42) return titleCaseVerdict(firstClause)
  if (normalized.length <= 58) return normalized
  return `${normalized.slice(0, 55).trim()}...`
}

function stripRepeatedVerdictLead(message: string | undefined, summary: string) {
  if (!message) return undefined

  const trimmedMessage = message.trim()
  const trimmedSummary = summary.trim()
  if (!trimmedMessage) return undefined
  if (trimmedMessage === trimmedSummary) return undefined
  if (!trimmedMessage.toLowerCase().startsWith(trimmedSummary.toLowerCase())) return trimmedMessage

  const withoutSummary = trimmedMessage.slice(trimmedSummary.length).replace(/^[\s.:;-]+/, '').trim()
  return withoutSummary || undefined
}

function titleCaseVerdict(value: string) {
  return value
    .split(/\s+/)
    .map((word) => word.length <= 3 ? word.toUpperCase() : `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}
