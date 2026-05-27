import type { CourtArtifact, EvidenceItem, MarketCase, ToolEvidence, ToolEvidenceSource } from './types'

export function buildEvidenceLedger(params: {
  marketCase: MarketCase
  artifacts?: CourtArtifact[]
  toolEvidence?: ToolEvidence[]
  agentId?: string
}) {
  const existing = (params.artifacts ?? []).flatMap((artifact) => artifact.evidenceItems ?? [])
  const fresh = normalizeToolEvidenceToLedgerItems({
    marketCase: params.marketCase,
    toolEvidence: params.toolEvidence ?? [],
    agentId: params.agentId,
    offset: existing.length,
  })

  return dedupeEvidenceItems([...existing, ...fresh])
}

export function normalizeToolEvidenceToLedgerItems(params: {
  marketCase: MarketCase
  toolEvidence: ToolEvidence[]
  agentId?: string
  offset?: number
}) {
  const output: EvidenceItem[] = []
  let index = params.offset ?? 0

  for (const evidence of params.toolEvidence) {
    const baseLimitations = buildEvidenceLimitations(evidence)
    const observations = (evidence.observations.length
      ? evidence.observations.slice(0, 8)
      : [evidence.status === 'ok' ? 'Tool returned no written observations.' : evidence.error ?? `${evidence.capability} returned ${evidence.status}.`])
      .filter((observation) => !shouldSkipObservation(observation))
    const sources = evidence.sources.length ? evidence.sources.slice(0, observations.length) : []

    observations.forEach((observation, observationIndex) => {
      const source = normalizeEvidenceSource(sources[observationIndex] ?? sources[0])
      index += 1
      output.push({
        id: buildEvidenceId(params.marketCase.id, evidence, observation, index),
        caseId: params.marketCase.id,
        capability: evidence.capability,
        provider: evidence.provider,
        sourceTitle: source?.title ?? evidence.provider,
        sourceUrl: source?.url,
        sourceType: classifySourceType(evidence, source),
        observedAt: source?.observedAt ?? evidence.fetchedAt,
        claim: compact(observation, 420),
        supports: classifySupport(observation),
        directness: classifyDirectness(params.marketCase, evidence, observation),
        freshness: classifyFreshness(source?.observedAt ?? evidence.fetchedAt),
        reliability: classifyReliability(evidence, source),
        limitations: baseLimitations,
        relevance: evidence.relevance,
        plannerReason: evidence.plannerReason,
      })
    })
  }

  return output
}

function shouldSkipObservation(observation: string) {
  return /\b(search plan|deterministic fallback search plan|planner relevance|tool returned no written observations)\b/i.test(observation)
}

export function summarizeEvidenceLedger(ledger: EvidenceItem[] | undefined, max = 12) {
  if (!ledger?.length) return []

  return ledger.slice(-max).map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    sourceTitle: compact(item.sourceTitle, 90),
    supports: item.supports,
    directness: item.directness,
    freshness: item.freshness,
    reliability: item.reliability,
    claim: compact(item.claim, 220),
    limitations: item.limitations.slice(0, 2).map((limit) => compact(limit, 120)),
    url: item.sourceUrl,
  }))
}

function buildEvidenceId(caseId: string, evidence: ToolEvidence, observation: string, index: number) {
  return `ev-${slug(caseId)}-${slug(evidence.capability)}-${hashText(`${evidence.provider}:${observation}`)}-${index}`
}

function normalizeEvidenceSource(source?: ToolEvidenceSource): ToolEvidenceSource | undefined {
  if (!source) return undefined

  return {
    title: stringifySourceField(source.title) || 'Untitled source',
    url: stringifySourceField(source.url),
    observedAt: stringifySourceField(source.observedAt),
    value: stringifySourceField(source.value),
  }
}

function stringifySourceField(value: unknown) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function classifySourceType(evidence: ToolEvidence, source?: ToolEvidenceSource): EvidenceItem['sourceType'] {
  if (evidence.capability === 'prediction_market_data') return 'market'
  if (evidence.capability === 'market_structure_session') return 'market'
  if (evidence.capability === 'market_data') return 'market'
  if (evidence.capability === 'web_news_search') return isOfficialSource(source) ? 'official' : 'news'
  if (evidence.capability === 'research_session') return isOfficialSource(source) ? 'official' : source?.url ? 'scrape' : 'dataset'
  if (evidence.capability === 'web_page_scrape') return isOfficialSource(source) ? 'official' : 'scrape'
  if (evidence.capability === 'visual_page_analysis') return 'visual'
  if (evidence.capability === 'social_activity_data') return 'social'
  if (evidence.capability === 'onchain_data') return 'onchain'
  if (evidence.capability === 'risk_analysis') return 'risk'
  if (evidence.capability === 'settlement_accounting') return 'settlement'
  if (evidence.capability === 'weather_data' || evidence.capability === 'sports_data' || evidence.capability === 'calendar_data' || evidence.capability === 'calendar_resolution_session') return 'dataset'

  return 'unknown'
}

function classifySupport(text: string): EvidenceItem['supports'] {
  const lower = text.toLowerCase()
  if (/\b(yes is|probability is|outcomeprices|market-context|market context|market odds|liquidity|volume|gamma .*? did not|api .*? missed|search did not match|no active market matched)\b/.test(lower)) return 'context'
  if (/\b(no confirmed|no current|not reported|not confirmed|low risk|has not|inactive|closed|no usable)\b/.test(lower)) return 'no'
  if (/\b(confirmed|active|catalyst|outbreak|released|declassified|said|took the field|reported)\b/.test(lower)) return 'yes'
  if (/\b(resolve|resolution|context|rule|criteria|source|background|supporting only)\b/.test(lower)) return 'context'

  return 'neutral'
}

function classifyDirectness(marketCase: MarketCase, evidence: ToolEvidence, text: string): EvidenceItem['directness'] {
  if (evidence.status !== 'ok') return 'missing'
  const lower = text.toLowerCase()
  if (/\b(no match|missing|timed out|skipped|could not|failed|unavailable|blocked)\b/.test(lower)) return 'missing'
  if (/\b(background|supporting only|context|nearby|broader market)\b/.test(lower)) return 'background'
  if (evidence.capability === 'prediction_market_data' || evidence.capability === 'market_data') return 'background'
  if (evidence.capability === 'market_structure_session') return 'background'

  const hasDirectResolutionLanguage = /\b(primary resolution|resolution source|resolves?|resolve to|confirmed|laboratory-confirmed|officially reported|inside|territory|by the specified date|said the listed term|took the field|declassified)\b/.test(lower)
  const fit = resolutionFit(marketCase, text)

  if (hasDirectResolutionLanguage && fit.score >= 0.26) return 'direct'
  if (hasDirectResolutionLanguage || fit.score >= 0.18) return 'indirect'

  return 'indirect'
}

function classifyFreshness(observedAt?: string): EvidenceItem['freshness'] {
  if (!observedAt) return 'unknown'
  const timestamp = Date.parse(observedAt)
  if (!Number.isFinite(timestamp)) return 'unknown'
  const ageDays = (Date.now() - timestamp) / 86_400_000
  if (ageDays <= 2) return 'fresh'
  if (ageDays <= 21) return 'recent'
  if (ageDays > 21) return 'stale'

  return 'unknown'
}

function classifyReliability(evidence: ToolEvidence, source?: ToolEvidenceSource): EvidenceItem['reliability'] {
  if (evidence.status === 'error' || evidence.status === 'skipped') return 'low'
  if (isOfficialSource(source)) return 'high'
  if (evidence.capability === 'prediction_market_data' || evidence.capability === 'market_data') return 'medium'
  if (evidence.capability === 'market_structure_session' || evidence.capability === 'calendar_resolution_session') return isOfficialSource(source) ? 'high' : 'medium'
  if (evidence.capability === 'web_news_search') return 'medium'
  if (evidence.capability === 'research_session') return isOfficialSource(source) ? 'high' : 'medium'
  if (evidence.status === 'ok') return 'medium'

  return 'unknown'
}

function buildEvidenceLimitations(evidence: ToolEvidence) {
  const limitations: string[] = []
  if (evidence.status !== 'ok') limitations.push(`${evidence.capability} status is ${evidence.status}; treat as missing or weak evidence.`)
  if (evidence.relevance && evidence.relevance !== 'primary') limitations.push(`Planner relevance is ${evidence.relevance}.`)
  if (evidence.error) limitations.push(evidence.error)
  if (evidence.capability === 'prediction_market_data') limitations.push('Market odds are calibration/context, not proof of resolution.')
  if (evidence.capability === 'market_structure_session') limitations.push('Market-structure sessions classify exact vs sibling/proxy markets; odds still calibrate rather than prove outcome resolution.')
  if (evidence.capability === 'calendar_resolution_session') limitations.push('Calendar-resolution sessions anchor dates when possible; compare event date, market close, and reporting lag before forecasting.')
  if (evidence.capability === 'web_news_search') limitations.push('Search snippets need source verification before being treated as direct proof.')
  if (evidence.capability === 'research_session') limitations.push('Research sessions combine search, reader, and structured context; source-level claims still need directness/source-quality grading.')
  if (evidence.capability === 'visual_page_analysis') limitations.push('Visual reads capture visible state at inspection time only.')

  return limitations.slice(0, 4)
}

function isOfficialSource(source?: ToolEvidenceSource) {
  const text = `${source?.title ?? ''} ${source?.url ?? ''}`.toLowerCase()
  return /\b(cdc\.gov|who\.int|fifa\.com|sec\.gov|whitehouse\.gov|defense\.gov|state\.gov|treasury\.gov|congress\.gov|federalregister\.gov|gov\.uk|\.gov)\b/.test(text)
}

function resolutionFit(marketCase: MarketCase, text: string) {
  const criteria = `${marketCase.question} ${marketCase.context ?? ''}`
  const criterionTokens = importantTokens(criteria)
  const textTokens = importantTokens(text)
  if (!criterionTokens.length || !textTokens.length) return { score: 0, overlap: [] as string[] }

  const textSet = new Set(textTokens)
  const overlap = Array.from(new Set(criterionTokens)).filter((token) => textSet.has(token))
  const score = overlap.length / Math.max(criterionTokens.length, 1)

  return { score, overlap }
}

function importantTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !resolutionStopWords.has(token))
    .slice(0, 80)
}

const resolutionStopWords = new Set([
  'this',
  'that',
  'will',
  'with',
  'from',
  'have',
  'been',
  'being',
  'market',
  'resolve',
  'resolves',
  'resolution',
  'source',
  'primary',
  'otherwise',
  'reported',
  'official',
  'information',
  'credible',
  'consensus',
  'specified',
  'date',
  'time',
  'card',
  'icon',
])

function dedupeEvidenceItems(items: EvidenceItem[]) {
  const seen = new Set<string>()
  const output: EvidenceItem[] = []

  for (const item of items) {
    const key = `${item.capability}:${item.sourceUrl ?? item.sourceTitle}:${item.claim}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }

  return output
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item'
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
