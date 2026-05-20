import type { AgentContext, CourtArtifact, EvidenceItem } from './types'

export type ForecastClaimType =
  | 'resolution-rule'
  | 'direct-proof'
  | 'yes-pathway'
  | 'no-blocker'
  | 'timing'
  | 'market-context'
  | 'source-quality'
  | 'quant-bridge'
  | 'update-trigger'

export type ForecastClaimStatus = 'open' | 'supported' | 'contested' | 'missing' | 'limited' | 'struck'

export type ForecastClaim = {
  id: string
  type: ForecastClaimType
  side: 'yes' | 'no' | 'neutral'
  status: ForecastClaimStatus
  text: string
  evidenceIds: string[]
  pressure: number
  lastAgentId?: string
}

export type ClaimMap = {
  claims: ForecastClaim[]
  centralClash: string
  unresolvedGaps: string[]
  nextBestMove: string
}

export function buildClaimMap(context: AgentContext): ClaimMap {
  const artifacts = context.artifacts ?? []
  const ledger = context.evidenceLedger ?? artifacts.flatMap((artifact) => artifact.evidenceItems ?? [])
  const claims = [
    buildResolutionRuleClaim(context),
    ...buildAgendaClaims(context),
    ...buildEvidenceClaims(ledger),
    ...buildArgumentClaims(artifacts, ledger),
    ...buildGapClaims(artifacts),
  ]
  const compacted = dedupeClaims(claims)
    .sort((a, b) => b.pressure - a.pressure)
    .slice(0, 14)

  return {
    claims: compacted,
    centralClash: buildCentralClash(compacted),
    unresolvedGaps: compacted
      .filter((claim) => claim.status === 'missing' || claim.status === 'contested' || claim.status === 'open')
      .slice(0, 5)
      .map((claim) => `${claim.id}: ${claim.text}`),
    nextBestMove: buildNextBestMove(compacted),
  }
}

function buildResolutionRuleClaim(context: AgentContext): ForecastClaim {
  return {
    id: 'claim-resolution-rule',
    type: 'resolution-rule',
    side: 'neutral',
    status: context.marketCase.context ? 'supported' : 'open',
    text: compact(`Resolution rule: ${context.marketCase.context ?? context.marketCase.question}`, 260),
    evidenceIds: [],
    pressure: 0.6,
  }
}

function buildAgendaClaims(context: AgentContext): ForecastClaim[] {
  const agenda = context.evidenceAgenda
  if (!agenda) return []
  const coveredText = context.artifacts
    .flatMap((artifact) => [
      artifact.summary,
      artifact.transcriptMessage,
      ...(artifact.claims ?? []),
      ...(artifact.risks ?? []),
      artifact.testimony?.finding,
      ...(artifact.evidenceItems ?? []).map((item) => item.claim),
    ])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return agenda.requiredFacts.map((item) => {
    const covered = agendaItemLooksCovered(item.label, item.id, coveredText)
    return {
      id: `claim-agenda-${item.id}`,
      type: claimTypeFromAgendaId(item.id),
      side: 'neutral' as const,
      status: covered ? 'limited' as const : 'open' as const,
      text: compact(`Agenda: ${item.label}. Why it matters: ${item.whyItMatters}. Preferred witnesses: ${item.preferredWitnesses.join(', ')}`, 280),
      evidenceIds: [],
      pressure: covered ? 0.42 : 0.66,
    }
  })
}

function claimTypeFromAgendaId(id: string): ForecastClaimType {
  if (id.includes('resolution')) return 'resolution-rule'
  if (id.includes('market')) return 'market-context'
  if (id.includes('deadline') || id.includes('window') || id.includes('timeline')) return 'timing'
  if (id.includes('quant') || id.includes('scenario')) return 'quant-bridge'
  if (id.includes('source')) return 'source-quality'
  if (id.includes('status')) return 'direct-proof'

  return 'yes-pathway'
}

function agendaItemLooksCovered(label: string, id: string, text: string) {
  const tokens = Array.from(new Set(
    `${id} ${label}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 4 && !stopWords.has(token)),
  )).slice(0, 8)
  const hits = tokens.filter((token) => text.includes(token)).length

  return hits >= Math.min(2, tokens.length)
}

function buildEvidenceClaims(ledger: EvidenceItem[]): ForecastClaim[] {
  return ledger.filter((item) => !isPlannerMetadata(item.claim)).slice(-18).map((item) => {
    const type = claimTypeFromEvidence(item)
    const status = claimStatusFromEvidence(item)
    return {
      id: `claim-${item.id}`,
      type,
      side: item.supports === 'context' ? 'neutral' : item.supports,
      status,
      text: compact(`${item.sourceTitle}: ${item.claim}`, 260),
      evidenceIds: [item.id],
      pressure: evidencePressure(item),
    }
  })
}

function buildArgumentClaims(artifacts: CourtArtifact[], ledger: EvidenceItem[]): ForecastClaim[] {
  const evidenceById = new Map(ledger.map((item) => [item.id, item]))

  return artifacts.flatMap((artifact) =>
    (artifact.argumentNodes ?? []).map((node) => {
      const cited = node.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean)
      const hasDirect = cited.some((item) => item?.directness === 'direct')
      const hasEvidence = cited.length > 0
      const warnings = artifact.argumentQuality ?? []
      const hasSevereWarning = warnings.some((warning) => warning.severity === 'high')
      const status: ForecastClaimStatus = hasSevereWarning
        ? 'contested'
        : hasDirect
          ? 'supported'
          : hasEvidence
            ? 'limited'
            : 'missing'

      return {
        id: `claim-arg-${node.id}`,
        type: node.side === 'yes' ? 'yes-pathway' : node.side === 'no' ? 'no-blocker' : 'quant-bridge',
        side: node.side === 'no-edge' ? 'neutral' : node.side,
        status,
        text: compact(`${node.claim} | Bridge: ${node.warrant}`, 280),
        evidenceIds: node.evidenceIds,
        pressure: (node.confidence ?? 0.4) + (hasSevereWarning ? 0.2 : 0) + (hasDirect ? 0.1 : 0),
        lastAgentId: artifact.agentId,
      }
    }),
  )
}

function buildGapClaims(artifacts: CourtArtifact[]): ForecastClaim[] {
  return artifacts
    .flatMap((artifact) => [
      ...(artifact.risks ?? []),
      ...(artifact.argumentQuality ?? []).map((warning) => warning.message),
    ].filter((risk) => !isPlannerMetadata(risk)).map((risk, index) => ({
      id: `claim-gap-${artifact.agentId}-${index}-${hashText(risk)}`,
      type: 'quant-bridge' as const,
      side: 'neutral' as const,
      status: 'missing' as const,
      text: compact(risk, 240),
      evidenceIds: [],
      pressure: /\b(direct|resolution|unsupported|missing|overread|bridge|quant|probability|repeat)\b/i.test(risk) ? 0.72 : 0.48,
      lastAgentId: artifact.agentId,
    })))
}

function isPlannerMetadata(text: string) {
  return /\b(search plan|deterministic fallback search plan|planner relevance)\b/i.test(text)
}

function claimTypeFromEvidence(item: EvidenceItem): ForecastClaimType {
  if (item.sourceType === 'market') return 'market-context'
  if (item.directness === 'direct') return 'direct-proof'
  if (item.directness === 'missing') return 'source-quality'
  if (item.supports === 'yes') return 'yes-pathway'
  if (item.supports === 'no') return 'no-blocker'
  if (/\b(date|deadline|window|before|after|published|observed|reported)\b/i.test(item.claim)) return 'timing'
  if (/\b(probability|odds|volume|liquidity|price|range|market)\b/i.test(item.claim)) return 'market-context'
  return 'source-quality'
}

function claimStatusFromEvidence(item: EvidenceItem): ForecastClaimStatus {
  if (item.directness === 'missing') return 'missing'
  if (item.directness === 'direct' && item.reliability !== 'low') return 'supported'
  if (item.directness === 'background' || item.supports === 'context') return 'limited'
  return 'contested'
}

function evidencePressure(item: EvidenceItem) {
  let pressure = 0.3
  if (item.directness === 'direct') pressure += 0.25
  if (item.directness === 'indirect') pressure += 0.12
  if (item.reliability === 'high') pressure += 0.15
  if (item.freshness === 'fresh') pressure += 0.1
  if (item.supports === 'yes' || item.supports === 'no') pressure += 0.08
  if (item.limitations.length) pressure += 0.04

  return Math.min(0.9, pressure)
}

function buildCentralClash(claims: ForecastClaim[]) {
  const yes = claims.find((claim) => claim.side === 'yes' && claim.status !== 'struck')
  const no = claims.find((claim) => claim.side === 'no' && claim.status !== 'struck')
  const gap = claims.find((claim) => claim.status === 'missing' || claim.status === 'contested')

  if (!yes && !no && !gap) return 'No central clash has formed yet.'

  return [
    yes ? `Yes: ${yes.text}` : undefined,
    no ? `No: ${no.text}` : undefined,
    gap ? `Gap: ${gap.text}` : undefined,
  ].filter(Boolean).join(' / ')
}

function buildNextBestMove(claims: ForecastClaim[]) {
  const missingDirect = claims.find((claim) => claim.type === 'direct-proof' && claim.status !== 'supported')
  if (missingDirect) return `Test directness: ${missingDirect.text}`

  const highGap = claims.find((claim) => claim.status === 'missing' || claim.status === 'contested')
  if (highGap) return `Repair or strike: ${highGap.text}`

  const yes = claims.find((claim) => claim.side === 'yes')
  const no = claims.find((claim) => claim.side === 'no')
  if (yes && no) return 'Force counsel to compare the strongest Yes pathway against the strongest No blocker with a probability range.'

  return 'Proceed to calibration if no new claim can be added.'
}

function dedupeClaims(claims: ForecastClaim[]) {
  const seen = new Map<string, ForecastClaim>()

  for (const claim of claims) {
    const key = `${claim.type}:${claim.side}:${shapeKey(claim.text)}`
    const prior = seen.get(key)
    if (!prior || claim.pressure > prior.pressure) seen.set(key, claim)
  }

  return Array.from(seen.values())
}

function shapeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 4 && !stopWords.has(token))
    .slice(0, 12)
    .sort()
    .join(' ')
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

const stopWords = new Set([
  'about',
  'after',
  'before',
  'being',
  'case',
  'claim',
  'court',
  'evidence',
  'forecast',
  'market',
  'probability',
  'reported',
  'resolution',
  'source',
  'testimony',
])
