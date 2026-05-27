import type { MarketCase, ToolEvidence } from '../../../court/types'
import { getPredictionMarketEvidence } from './prediction-market'
import { getWebPageScrapeEvidence } from './web-scraper'
import { getNewsEvidence } from './news'

export async function getMarketStructureSessionEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const fetchedAt = new Date().toISOString()
  const query = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''} ${instruction}`.trim()
  const marketEvidence = await getPredictionMarketEvidence(marketCase)
  const needsRecovery = shouldRecoverMarket(marketEvidence)
  const recoveryEvidence = needsRecovery
    ? await getMarketRecoveryEvidence(marketCase, instruction).catch((error) => ({
        capability: 'web_news_search',
        provider: 'market-structure-recovery',
        query,
        fetchedAt,
        status: 'error',
        observations: [`Market recovery search failed: ${error instanceof Error ? error.message : 'unknown error'}`],
        sources: [],
        error: error instanceof Error ? error.message : 'unknown error',
      } satisfies ToolEvidence))
    : undefined
  const scrapeEvidence = needsRecovery && marketCase.links?.length
    ? await getWebPageScrapeEvidence(marketCase, `Recover exact filed market/event page structure, child outcomes, rules, deadlines, order-book context if visible, and archive/search fallback if exact page is missing. ${instruction}`).catch((error) => ({
        capability: 'web_page_scrape',
        provider: 'market-structure-reader',
        query,
        fetchedAt,
        status: 'error',
        observations: [`Market page recovery scrape failed: ${error instanceof Error ? error.message : 'unknown error'}`],
        sources: [],
        error: error instanceof Error ? error.message : 'unknown error',
      } satisfies ToolEvidence))
    : undefined

  const classification = classifyMarketStructure(marketEvidence, recoveryEvidence, scrapeEvidence)
  const observations = [
    `Market structure session: ${classification.scope}.`,
    `Filed-market confidence: ${classification.confidence}.`,
    `Exact/sibling/proxy map: ${classification.map}.`,
    ...marketEvidence.observations.slice(0, 8).map((item) => `Market data: ${item}`),
    ...(recoveryEvidence?.observations.slice(0, 4).map((item) => `Recovery search: ${item}`) ?? []),
    ...(scrapeEvidence?.observations.slice(0, 4).map((item) => `Recovery read: ${item}`) ?? []),
    classification.warning,
  ].filter((item): item is string => Boolean(item))

  return {
    capability: 'market_structure_session',
    provider: [
      'prediction-market',
      recoveryEvidence ? 'recovery-search' : undefined,
      scrapeEvidence ? 'recovery-reader' : undefined,
    ].filter(Boolean).join('+'),
    query,
    fetchedAt,
    status: marketEvidence.status === 'ok' || recoveryEvidence?.status === 'ok' || scrapeEvidence?.status === 'ok' ? 'ok' : marketEvidence.status,
    observations: observations.slice(0, 16),
    sources: [
      ...tagSources(marketEvidence.sources, { mode: 'market-structure-primary' }),
      ...tagSources(recoveryEvidence?.sources ?? [], { mode: 'market-structure-recovery-search' }),
      ...tagSources(scrapeEvidence?.sources ?? [], { mode: 'market-structure-recovery-reader' }),
    ],
    error: marketEvidence.error,
  }
}

async function getMarketRecoveryEvidence(marketCase: MarketCase, instruction: string) {
  const linkText = marketCase.links?.join(' ') ?? ''
  return getNewsEvidence({
    ...marketCase,
    question: `${marketCase.question} ${linkText} Polymarket Manifold Kalshi market slug event page archive cache odds liquidity`,
    context: [
      marketCase.context,
      'Market-structure recovery: find exact filed market, event/child outcomes, renamed slugs, archived/cached pages, sibling markets, and platform API references.',
    ].filter(Boolean).join(' '),
  }, instruction)
}

function shouldRecoverMarket(evidence: ToolEvidence) {
  const text = `${evidence.status} ${evidence.error ?? ''} ${evidence.observations.join(' ')}`
  return evidence.status !== 'ok'
    || /\b(no active market|no market candidates|404|missing|invalid|API miss|did not match|no selected child|event-wide|direct event page fallback)\b/i.test(text)
}

function classifyMarketStructure(...items: Array<ToolEvidence | undefined>) {
  const text = items.filter(Boolean).map((item) => `${item?.observations.join(' ')} ${item?.sources.map((source) => `${source.title} ${source.url ?? ''} ${source.value ?? ''}`).join(' ')}`).join(' ')
  const hasDirect = /\b(direct linked market|direct Manifold|direct Polymarket|direct Kalshi|filed market|supplied market|Public Manifold API closeTime|Public Polymarket Gamma API endDate|Public Kalshi API ticker)\b/i.test(text)
  const eventWide = /\b(event-wide|multi-outcome|child contracts|child outcomes|answer outcomes)\b/i.test(text)
  const missing = /\b(404|no active market|no market candidates|missing market|invalid market|never existed|no API match)\b/i.test(text)
  const sibling = /\b(sibling|broader market|nearby|supporting only|proxy)\b/i.test(text)
  const orderBook = /\b(best bid|best ask|spread|last trade|order-book|order book|volume24|24h volume|1w volume|accepting orders)\b/i.test(text)

  const scope = eventWide
    ? 'filed link appears event-wide or multi-outcome; rank/compare children and do not silently pick a proxy'
    : hasDirect
    ? 'specific filed market appears recoverable'
    : missing
    ? 'exact filed market remains missing or API-unresolved'
    : sibling
    ? 'only sibling/proxy market context is visible'
    : 'market scope is partially supported but should be handled cautiously'
  const confidence = hasDirect && orderBook ? 'high for market identity and microstructure' : hasDirect ? 'moderate for market identity' : missing ? 'low for exact filed market' : 'low-moderate'
  const map = [
    hasDirect ? 'exact/direct market evidence present' : 'no confirmed exact/direct market evidence',
    eventWide ? 'event/multi-outcome structure present' : 'no confirmed event-wide child list',
    sibling ? 'sibling/proxy markets present' : 'no meaningful sibling/proxy map found',
    orderBook ? 'microstructure/freshness fields present' : 'microstructure/freshness weak or absent',
  ].join('; ')
  const warning = missing
    ? 'Warning: do not treat nearby markets as the filed contract unless the exact market is recovered or the verdict explicitly says proxy/no-edge.'
    : undefined

  return { scope, confidence, map, warning }
}

function tagSources(sources: ToolEvidence['sources'], extra: Record<string, unknown>) {
  return sources.map((source) => ({
    ...source,
    value: mergeValue(source.value, extra),
  }))
}

function mergeValue(value: string | undefined, extra: Record<string, unknown>) {
  if (!value) return JSON.stringify(extra)
  try {
    return JSON.stringify({ ...JSON.parse(value), ...extra })
  } catch {
    return JSON.stringify({ ...extra, sourceValue: value })
  }
}
