import type { MarketCase, ToolEvidence } from '../../../court/types'
import { getCaseSearchQuery, getMarketGenres, getPossibleCountryCode, getSearchTerms, normalizeSearchText } from '../text'
import { getCalendarEvidence } from './calendar'
import { getMarketDataEvidence } from './market-data'
import { getNewsEvidence } from './news'
import { getPredictionMarketEvidence } from './prediction-market'
import { getWebPageScrapeEvidence } from './web-scraper'

const maxBranches = readPositiveIntegerEnv('HELIA_RESEARCH_MAX_BRANCHES', 4)
const maxSourcesToRead = readPositiveIntegerEnv('HELIA_RESEARCH_MAX_READ_SOURCES', 6)

type Branch = {
  id: string
  query: string
  purpose: string
}

type RankedSource = {
  title: string
  url?: string
  observedAt?: string
  value?: string
  branchId: string
  branchPurpose: string
  score: number
}

export async function getResearchSessionEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const fetchedAt = new Date().toISOString()
  const query = `${marketCase.question} ${marketCase.context ?? ''} ${instruction}`.trim()
  const branches = buildResearchBranches(marketCase, instruction).slice(0, maxBranches)
  const branchResults = await Promise.all(branches.map(async (branch) => ({
    branch,
    evidence: await getNewsEvidence({
      ...marketCase,
      question: branch.query,
      context: `${marketCase.context ?? ''}\nResearch branch purpose: ${branch.purpose}`,
    }, branch.purpose).catch((error) => ({
      capability: 'web_news_search',
      provider: 'research-session',
      query: branch.query,
      fetchedAt,
      status: 'error',
      observations: [`Research branch search failed: ${error instanceof Error ? error.message : 'unknown error'}`],
      sources: [],
      error: error instanceof Error ? error.message : 'unknown error',
    } satisfies ToolEvidence)),
  })))

  const rankedSources = rankSources(branchResults.flatMap(({ branch, evidence }) =>
    evidence.sources.map((source) => ({
      ...source,
      branchId: branch.id,
      branchPurpose: branch.purpose,
      score: scoreResearchSource(source, marketCase, instruction, branch),
    })),
  ))
  const urlsToRead = rankedSources.filter((source) => source.url).slice(0, maxSourcesToRead)
  const scrapeEvidence = urlsToRead.length
    ? await getWebPageScrapeEvidence({
        ...marketCase,
        links: urlsToRead.map((source) => source.url as string),
        context: [
          marketCase.context,
          `Research session selected these sources because they scored highest for: ${urlsToRead.map((source) => `${source.title} (${source.branchPurpose})`).join('; ')}`,
        ].filter(Boolean).join('\n'),
      }, `Read selected sources for exact claims, dates, author/source identity, source trail, catalysts, blockers, and resolution-rule relevance. Original instruction: ${instruction}`).catch((error) => ({
        capability: 'web_page_scrape',
        provider: 'research-session-reader',
        query,
        fetchedAt,
        status: 'error',
        observations: [`Research session reader failed: ${error instanceof Error ? error.message : 'unknown error'}`],
        sources: [],
        error: error instanceof Error ? error.message : 'unknown error',
      } satisfies ToolEvidence))
    : undefined

  const structuredEvidence = await getStructuredContext(marketCase, instruction, fetchedAt)
  const observations = [
    `Research session plan: ${branches.map((branch) => `${branch.id}: ${branch.purpose}`).join(' | ')}.`,
    ...branchResults.map(({ branch, evidence }) =>
      `Branch ${branch.id} searched "${branch.query}" and returned ${evidence.sources.length} source(s); status ${evidence.status}. ${compact(evidence.observations.find((item) => !/^Search plan:/i.test(item)) ?? '', 260)}`,
    ),
    rankedSources.length
      ? `Selected source leads: ${rankedSources.slice(0, maxSourcesToRead).map((source) => `${source.title}${source.url ? ` (${source.url})` : ''} via ${source.branchId}`).join(' | ')}.`
      : 'No source leads survived relevance ranking.',
    scrapeEvidence
      ? `Reader result: ${scrapeEvidence.status}; ${compact(scrapeEvidence.observations[0] ?? scrapeEvidence.error ?? '', 420)}`
      : 'Reader result: skipped because no URL survived source ranking.',
    ...structuredEvidence.map((evidence) => `Structured context ${evidence.capability}: ${compact(evidence.observations[0] ?? evidence.error ?? '', 320)}`),
  ].filter(Boolean)

  const sources: ToolEvidence['sources'] = [
    ...rankedSources.slice(0, 12).map((source) => ({
      title: source.title,
      url: source.url,
      observedAt: source.observedAt,
      value: JSON.stringify({
        mode: 'research-search-lead',
        branchId: source.branchId,
        branchPurpose: source.branchPurpose,
        score: source.score,
        provider: source.value,
      }),
    })),
    ...(scrapeEvidence?.sources ?? []).map((source) => ({
      ...source,
      value: mergeSourceValue(source.value, { mode: 'research-reader-source' }),
    })),
    ...structuredEvidence.flatMap((evidence) => evidence.sources.slice(0, 4).map((source) => ({
      ...source,
      value: mergeSourceValue(source.value, { mode: `research-${evidence.capability}` }),
    }))),
  ]

  const anyOk = branchResults.some(({ evidence }) => evidence.status === 'ok') || scrapeEvidence?.status === 'ok' || structuredEvidence.some((evidence) => evidence.status === 'ok')

  return {
    capability: 'research_session',
    provider: 'branch-search-read',
    query,
    fetchedAt,
    status: anyOk ? 'ok' : 'empty',
    observations: observations.slice(0, 12),
    sources,
    error: anyOk ? undefined : 'Research session found no usable search, reader, or structured evidence.',
  }
}

function buildResearchBranches(marketCase: MarketCase, instruction: string): Branch[] {
  const text = `${marketCase.question} ${marketCase.context ?? ''} ${instruction}`
  const base = getCaseSearchQuery(text)
  const genres = getMarketGenres(text)
  const branches: Branch[] = [
    {
      id: 'rule-status',
      purpose: 'confirm exact resolution rule, current status, and direct source criteria',
      query: `${base} resolution criteria current status official source trusted reporting`,
    },
    {
      id: 'yes-pathway',
      purpose: 'find catalysts and mechanisms that would make YES happen before the deadline',
      query: `${base} catalyst trigger mechanism latest news evidence`,
    },
    {
      id: 'no-blocker',
      purpose: 'find blockers, disconfirming evidence, incentives, constraints, or missing prerequisites',
      query: `${base} blocker risk constraints no evidence official statement latest`,
    },
    {
      id: 'proxy-class',
      purpose: 'find quantitative proxies, base rates, historical analogs, market siblings, or threshold distance',
      query: `${base} historical precedent base rate data threshold polling market odds`,
    },
  ]

  if (genres.includes('politics') || /\b(election|poll|candidate|vote|nomination|primary)\b/i.test(text)) {
    branches.push({
      id: 'local-election-data',
      purpose: 'find local-language election calendar, candidates, polls, ballot access, and official electoral sources',
      query: getPossibleCountryCode(text) === 'BR'
        ? 'eleição presidencial 2026 pesquisa Datafolha Quaest Ipec AtlasIntel PoderData TSE candidatos primeiro turno'
        : `${base} local polling candidate list official electoral calendar`,
    })
  }

  if (genres.includes('business') || genres.includes('science-tech') || /\b(ai|bubble|capex|revenue|down round|valuation|earnings|index|stock)\b/i.test(text)) {
    branches.push(
      {
        id: 'company-financials',
        purpose: 'find company financial data, capex guidance, valuations, earnings calls, down rounds, and funding changes',
        query: `${base} capex guidance revenue valuation down round earnings call funding latest`,
      },
      {
        id: 'media-language',
        purpose: 'test whether trusted media are using the market-resolution language',
        query: `${base} "bubble bursts" "bubble popped" Reuters Bloomberg CNBC Financial Times WSJ`,
      },
    )
  }

  if (genres.includes('geopolitics') || /\b(china|taiwan|invasion|war|military|blockade|PLA)\b/i.test(text)) {
    branches.push({
      id: 'operational-signals',
      purpose: 'find official military statements, exercises, logistics, OSINT, and escalation signals',
      query: `${base} military exercises official statement logistics OSINT blockade latest`,
    })
  }

  return dedupeBranches(branches).slice(0, Math.max(maxBranches, 1))
}

async function getStructuredContext(marketCase: MarketCase, instruction: string, fetchedAt: string): Promise<ToolEvidence[]> {
  const text = `${marketCase.question} ${marketCase.context ?? ''} ${instruction}`
  const tasks: Array<Promise<ToolEvidence | undefined>> = []

  if (marketCase.type === 'prediction-market' || /\b(polymarket|manifold|kalshi|odds|liquidity|order book|spread|market)\b/i.test(text)) {
    tasks.push(getPredictionMarketEvidence(marketCase).catch((error) => buildStructuredError('prediction_market_data', fetchedAt, marketCase.question, error)))
  }
  if (/\b(deadline|date|schedule|calendar|meeting|election|primary|FOMC|close time|end date)\b/i.test(text)) {
    tasks.push(getCalendarEvidence(marketCase, instruction).catch((error) => buildStructuredError('calendar_data', fetchedAt, marketCase.question, error)))
  }
  if (/\b(stock|equity|shares|nasdaq|s&p|index|bitcoin|btc|ethereum|eth|solana|sol|price|capex|valuation)\b/i.test(text)) {
    tasks.push(getMarketDataEvidence(marketCase, instruction).catch((error) => buildStructuredError('market_data', fetchedAt, marketCase.question, error)))
  }

  const evidence = await Promise.all(tasks)
  return evidence.filter((item): item is ToolEvidence => Boolean(item))
}

function buildStructuredError(capability: ToolEvidence['capability'], fetchedAt: string, query: string, error: unknown): ToolEvidence {
  return {
    capability,
    provider: 'research-session',
    query,
    fetchedAt,
    status: 'error',
    observations: [`Structured research context failed for ${capability}: ${error instanceof Error ? error.message : 'unknown error'}`],
    sources: [],
    error: error instanceof Error ? error.message : 'unknown error',
  }
}

function rankSources(sources: RankedSource[]) {
  const seen = new Set<string>()
  const output: RankedSource[] = []

  for (const source of sources.sort((left, right) => right.score - left.score)) {
    const key = source.url ?? `${source.title}:${source.branchId}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(source)
  }

  return output
}

function scoreResearchSource(source: ToolEvidence['sources'][number], marketCase: MarketCase, instruction: string, branch: Branch) {
  const caseTerms = getSearchTerms(`${marketCase.question} ${marketCase.context ?? ''} ${instruction}`)
  const haystack = normalizeSearchText(`${source.title} ${source.url ?? ''} ${source.value ?? ''} ${branch.purpose}`)
  let score = 0
  score += caseTerms.filter((term) => term.length > 3 && haystack.includes(normalizeSearchText(term))).length * 2
  if (source.url) score += 2
  if (/\b(reuters|apnews|associated press|bloomberg|financial times|ft\.com|wsj|cnbc|businessinsider|business insider|bbc|nytimes|official|\.gov|tse\.jus\.br|federalreserve|sec\.gov)\b/i.test(`${source.title} ${source.url ?? ''}`)) score += 8
  if (/\b(pdf|data|dataset|calendar|poll|polling|earnings|transcript|official|press release|filing|results|report)\b/i.test(`${source.title} ${source.url ?? ''}`)) score += 5
  if (/\b(login|privacy|terms|advertise|homepage|latest news|wikipedia|crossref|doi\.org)\b/i.test(`${source.title} ${source.url ?? ''}`)) score -= 8
  if (branch.id === 'media-language' && /\b(burst|bursts|popped|pop|crash|bubble)\b/i.test(`${source.title} ${source.value ?? ''}`)) score += 6
  if (branch.id === 'yes-pathway' && /\b(catalyst|trigger|cut|halt|down round|default|bankruptcy|exercise|statement|surge|launch|announce)\b/i.test(`${source.title} ${source.value ?? ''}`)) score += 5
  if (branch.id === 'no-blocker' && /\b(no evidence|denies|unlikely|delay|blocked|constraint|not planned|shortfall)\b/i.test(`${source.title} ${source.value ?? ''}`)) score += 5
  return score
}

function dedupeBranches(branches: Branch[]) {
  const seen = new Set<string>()
  const output: Branch[] = []
  for (const branch of branches) {
    const key = normalizeSearchText(branch.query)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(branch)
  }
  return output
}

function mergeSourceValue(value: string | undefined, extra: Record<string, unknown>) {
  if (!value) return JSON.stringify(extra)
  try {
    return JSON.stringify({ ...JSON.parse(value), ...extra })
  } catch {
    return JSON.stringify({ ...extra, sourceValue: value })
  }
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}
