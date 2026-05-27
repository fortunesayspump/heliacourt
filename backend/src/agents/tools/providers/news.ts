import type { MarketCase, ToolEvidence } from '../../../court/types'
import { generateRawJson, isCourtModelConfigured } from '../../model'
import { fetchJson } from '../http'
import { getCaseSearchQuery, getEntityCandidates, getMarketGenres, getSearchTerms } from '../text'
import * as cheerio from 'cheerio'

type SearchItem = {
  title: string
  url?: string
  snippet?: string
  observedAt?: string
  source?: string
}

type GdeltResponse = {
  articles?: Array<{
    title?: string
    url?: string
    seendate?: string
    domain?: string
    sourcecountry?: string
  }>
}

type BraveResponse = {
  web?: {
    results?: Array<{
      title?: string
      url?: string
      description?: string
      age?: string
    }>
  }
}

type TavilyResponse = {
  results?: Array<{
    title?: string
    url?: string
    content?: string
    published_date?: string
  }>
}

type ExaResponse = {
  results?: Array<{
    title?: string
    url?: string
    text?: string
    publishedDate?: string
  }>
}

type SerpApiResponse = {
  organic_results?: Array<{
    title?: string
    link?: string
    snippet?: string
    date?: string
    source?: string
  }>
}

type SearxngResponse = {
  results?: Array<{
    title?: string
    url?: string
    content?: string
    publishedDate?: string
    engine?: string
    engines?: string[]
  }>
}

type WikipediaSearchResponse = {
  pages?: Array<{
    title?: string
    key?: string
    excerpt?: string
    description?: string
  }>
}

type CrossrefResponse = {
  message?: {
    items?: Array<{
      title?: string[]
      DOI?: string
      publisher?: string
      published?: {
        'date-parts'?: number[][]
      }
    }>
  }
}

type HackerNewsResponse = {
  hits?: Array<{
    title?: string
    url?: string
    created_at?: string
    author?: string
  }>
}

type SearchPlan = {
  queries?: string[]
  priorityTerms?: string[]
  rationale?: string
}

export async function getNewsEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const liveSearchText = `${marketCase.question} ${marketCase.context ?? ''} ${instruction}`.trim()
  const query = getCaseSearchQuery(liveSearchText)
  const fetchedAt = new Date().toISOString()
  const searchPlan = await planNewsQueries(marketCase, instruction)
  const queries = searchPlan.queries
  const results = await Promise.allSettled([
    getSearxngResults(queries),
    getBraveResults(queries),
    getTavilyResults(queries),
    getExaResults(queries),
    getSerpApiResults(queries),
    getDuckDuckGoHtmlResults(queries),
    getBingHtmlResults(queries),
    getGdeltResults(queries),
    getCryptoRssResults(query),
    getWikipediaResults(query),
    getCrossrefResults(query),
    getHackerNewsResults(query),
  ])

  const searchTerms = [...new Set([
    ...getExpandedNewsTerms(liveSearchText),
    ...searchPlan.priorityTerms,
  ])]
  const items = sortSearchItems(
    dedupeResults(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])))
    .filter((item) => isRelevantSearchItem(item, searchTerms))
    , marketCase,
  ).slice(0, 30)
  const failedProviders = results
    .map((result, index) => (result.status === 'rejected' ? providerNames[index] : null))
    .filter((provider): provider is string => Boolean(provider))
  const hasFreshNewsLikeProvider = items.some((item) => item.source && !referenceProviders.has(item.source))
  const sourceSummary = summarizeSearchSourceCoverage(items)
  const observations = [
    searchPlan.rationale ? `Search plan: ${searchPlan.rationale}` : undefined,
    sourceSummary,
    ...(items.length && !hasFreshNewsLikeProvider
      ? ['No dedicated fresh-news provider returned direct recent news evidence; remaining hits are reference, academic, or community search context.']
      : []),
    ...items.map((item) => `${describeSourceKind(item.source)}: ${item.title}${item.snippet ? ` - ${stripHtml(item.snippet)}` : ''}`),
  ].filter(isString)

  return {
    capability: 'web_news_search',
    provider: items.map((item) => item.source).filter(isString).filter(unique).join('+') || 'web-search',
    query,
    fetchedAt,
    status: items.length ? 'ok' : 'empty',
    observations: observations.length ? observations : ['No usable search/news/reference result matched the case terms.'],
    sources: items.map((item) => ({
      title: item.title,
      url: item.url,
      observedAt: item.observedAt,
      value: item.source,
    })),
    error: failedProviders.length && items.length ? `Some providers were unavailable: ${failedProviders.join(', ')}` : undefined,
  }
}

const providerNames = ['searxng', 'brave', 'tavily', 'exa', 'serpapi', 'duckduckgo-html', 'bing-html', 'gdelt', 'crypto-rss', 'wikipedia', 'crossref', 'hackernews']
const referenceProviders = new Set(['wikipedia', 'crossref', 'hackernews'])

function describeSourceKind(source?: string) {
  if (!source) return 'web search result'
  if (referenceProviders.has(source)) return `${source} reference result`
  return `${source} web/news result`
}

function summarizeSearchSourceCoverage(items: SearchItem[]) {
  if (!items.length) return undefined
  const domains = [...new Set(items.map((item) => getDomain(item.url)).filter(Boolean))]
  const officialLike = items.filter((item) => /\b(gov|mil|int|fifa|uefa|nba|nfl|mlb|nhl|reuters|apnews|sec|cftc|fed|who|cdc|state\.gov|defense)\b/i.test(`${getDomain(item.url)} ${item.title}`))
  const datedItems = items
    .map((item) => ({ ...item, time: parseObservedTime(item.observedAt) }))
    .filter((item) => typeof item.time === 'number')
    .sort((left, right) => (right.time ?? 0) - (left.time ?? 0))
  const newest = datedItems[0]
  const providerMix = [...new Set(items.map((item) => item.source).filter(Boolean))].slice(0, 6).join(', ')

  return [
    `Search coverage: ${items.length} relevant result(s) across ${domains.length || 'unknown'} domain(s)`,
    providerMix ? `providers ${providerMix}` : undefined,
    officialLike.length ? `${officialLike.length} official/primary/high-authority-looking result(s)` : 'no obvious official/primary source in top results',
    newest?.observedAt ? `freshest dated result: ${newest.title} (${newest.observedAt})` : 'no reliable publication date in result metadata',
  ].filter(Boolean).join('; ') + '.'
}

function getDomain(value?: string) {
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function parseObservedTime(value?: string) {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function getBraveResults(query: string | string[]): Promise<SearchItem[]> {
  if (!process.env.BRAVE_SEARCH_API_KEY) return []

  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.all(queries.slice(0, 3).map((item) => getSingleBraveResults(item)))

  return batches.flat()
}

async function getSearxngResults(query: string | string[]): Promise<SearchItem[]> {
  if (!process.env.SEARXNG_BASE_URL) return []

  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.allSettled(queries.slice(0, 6).map((item) => getSingleSearxngResults(item)))

  return batches.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function getSingleSearxngResults(query: string): Promise<SearchItem[]> {
  const baseUrl = process.env.SEARXNG_BASE_URL
  if (!baseUrl) return []

  const url = new URL('/search', baseUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('language', 'en')
  url.searchParams.set('safesearch', '0')

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
    },
  })

  if (!response.ok) return []

  const payload = (await response.json()) as SearxngResponse

  return (payload.results ?? []).slice(0, 10).map((item) => ({
    title: item.title ?? 'SearXNG result',
    url: item.url,
    snippet: item.content,
    observedAt: item.publishedDate,
    source: item.engine ? `searxng:${item.engine}` : item.engines?.length ? `searxng:${item.engines.join(',')}` : 'searxng',
  }))
}

async function getSingleBraveResults(query: string): Promise<SearchItem[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return []

  const payload = await fetchJson<BraveResponse>(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6&freshness=pd`,
    {
      headers: {
        'X-Subscription-Token': apiKey,
      },
    },
  )

  return (payload.web?.results ?? []).map((item) => ({
    title: item.title ?? 'Brave result',
    url: item.url,
    snippet: item.description,
    observedAt: item.age,
    source: 'brave',
  }))
}

async function getTavilyResults(query: string | string[]): Promise<SearchItem[]> {
  if (!process.env.TAVILY_API_KEY) return []

  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.all(queries.slice(0, 3).map((item) => getSingleTavilyResults(item)))

  return batches.flat()
}

async function getSingleTavilyResults(query: string): Promise<SearchItem[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []

  const payload = await fetchJson<TavilyResponse>('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 6,
    }),
  })

  return (payload.results ?? []).map((item) => ({
    title: item.title ?? 'Tavily result',
    url: item.url,
    snippet: item.content,
    observedAt: item.published_date,
    source: 'tavily',
  }))
}

async function getExaResults(query: string | string[]): Promise<SearchItem[]> {
  if (!process.env.EXA_API_KEY) return []

  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.all(queries.slice(0, 3).map((item) => getSingleExaResults(item)))

  return batches.flat()
}

async function getSingleExaResults(query: string): Promise<SearchItem[]> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return []

  const payload = await fetchJson<ExaResponse>('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: 6,
      useAutoprompt: true,
    }),
  })

  return (payload.results ?? []).map((item) => ({
    title: item.title ?? 'Exa result',
    url: item.url,
    snippet: item.text,
    observedAt: item.publishedDate,
    source: 'exa',
  }))
}

async function getSerpApiResults(query: string | string[]): Promise<SearchItem[]> {
  if (!process.env.SERPAPI_API_KEY) return []

  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.all(queries.slice(0, 3).map((item) => getSingleSerpApiResults(item)))

  return batches.flat()
}

async function getSingleSerpApiResults(query: string): Promise<SearchItem[]> {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) return []

  const payload = await fetchJson<SerpApiResponse>(
    `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}`,
  )

  return (payload.organic_results ?? []).map((item) => ({
    title: item.title ?? 'SerpAPI result',
    url: item.link,
    snippet: item.snippet,
    observedAt: item.date,
    source: item.source ? `serpapi:${item.source}` : 'serpapi',
  }))
}

async function getDuckDuckGoHtmlResults(query: string | string[]): Promise<SearchItem[]> {
  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.allSettled(queries.slice(0, 8).map((item) => getSingleDuckDuckGoHtmlResults(item)))

  return batches.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function getSingleDuckDuckGoHtmlResults(query: string): Promise<SearchItem[]> {
  const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: 'text/html',
      'User-Agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
    },
  })

  if (!response.ok) return []

  const $ = cheerio.load(await response.text())

  return $('.result')
    .toArray()
    .slice(0, 8)
    .map((element) => {
      const link = $(element).find('.result__a').first()
      const rawUrl = link.attr('href')

      return {
        title: link.text().replace(/\s+/g, ' ').trim() || 'DuckDuckGo result',
        url: normalizeDuckDuckGoUrl(rawUrl),
        snippet: $(element).find('.result__snippet').first().text().replace(/\s+/g, ' ').trim() || undefined,
        source: 'duckduckgo-html',
      }
    })
    .filter((item) => Boolean(item.title))
}

async function getBingHtmlResults(query: string | string[]): Promise<SearchItem[]> {
  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.allSettled(queries.slice(0, 6).map((item) => getSingleBingHtmlResults(item)))

  return batches.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function getSingleBingHtmlResults(query: string): Promise<SearchItem[]> {
  const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: 'text/html',
      'User-Agent': process.env.HELIA_HTTP_USER_AGENT ?? 'Mozilla/5.0 HeliaCourt/0.1',
    },
  })

  if (!response.ok) return []

  const $ = cheerio.load(await response.text())

  return $('li.b_algo')
    .toArray()
    .slice(0, 8)
    .map((element) => {
      const link = $(element).find('h2 a').first()
      const rawUrl = link.attr('href')

      return {
        title: link.text().replace(/\s+/g, ' ').trim() || 'Bing result',
        url: normalizeBingUrl(rawUrl),
        snippet: $(element).find('.b_caption p').first().text().replace(/\s+/g, ' ').trim() || undefined,
        source: 'bing-html',
      }
    })
    .filter((item) => Boolean(item.title))
}

function normalizeBingUrl(rawUrl?: string) {
  if (!rawUrl) return undefined

  try {
    const url = new URL(rawUrl)
    const encodedTarget = url.searchParams.get('u')
    if (encodedTarget) {
      const decoded = Buffer.from(encodedTarget.replace(/^a1/, ''), 'base64url').toString('utf8')
      if (/^https?:\/\//i.test(decoded)) return decoded
    }
    return url.toString()
  } catch {
    return rawUrl
  }
}

function normalizeDuckDuckGoUrl(rawUrl?: string) {
  if (!rawUrl) return undefined

  try {
    const url = new URL(rawUrl, 'https://duckduckgo.com')
    const uddg = url.searchParams.get('uddg')

    return uddg ? decodeURIComponent(uddg) : url.toString()
  } catch {
    return rawUrl
  }
}

async function getGdeltResults(query: string | string[]): Promise<SearchItem[]> {
  const queries = Array.isArray(query) ? query : [query]
  const batches = await Promise.allSettled(queries.slice(0, 2).map((item) => getSingleGdeltResults(item)))

  return batches.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function getSingleGdeltResults(query: string): Promise<SearchItem[]> {
  const response = await fetch(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=6&sort=HybridRel`,
    {
      signal: AbortSignal.timeout(4_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
      },
    },
  )

  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    return []
  }

  const payload = (await response.json()) as GdeltResponse

  return (payload.articles ?? []).map((article) => ({
    title: article.title ?? 'GDELT article',
    url: article.url,
    snippet: article.domain,
    observedAt: article.seendate,
    source: 'gdelt',
  }))
}

async function getCryptoRssResults(query: string): Promise<SearchItem[]> {
  if (!/\b(btc|bitcoin|eth|ethereum|sol|solana|crypto|token|coin)\b/i.test(query)) return []

  const feeds = [
    ['coindesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
    ['cointelegraph', 'https://cointelegraph.com/rss'],
    ['decrypt', 'https://decrypt.co/feed'],
  ] as const
  const results = await Promise.allSettled(
    feeds.map(async ([source, url]) => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(6_000),
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml',
          'User-Agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
        },
      })
      if (!response.ok) return []

      return parseRssItems(await response.text(), source)
    }),
  )

  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function getWikipediaResults(query: string): Promise<SearchItem[]> {
  const payload = await fetchJson<WikipediaSearchResponse>(
    `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=3`,
    {
      headers: {
        'User-Agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
      },
    },
  )

  return (payload.pages ?? []).map((page) => ({
    title: page.title ?? 'Wikipedia page',
    url: page.key ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}` : undefined,
    snippet: page.description ?? page.excerpt,
    source: 'wikipedia',
  }))
}

async function getCrossrefResults(query: string): Promise<SearchItem[]> {
  const genres = getMarketGenres(query)
  if (!genres.some((genre) => ['health', 'science-tech'].includes(genre)) && !/\b(study|paper|journal|research|doi|science|clinical|trial)\b/i.test(query)) {
    return []
  }

  const mailto = process.env.CROSSREF_MAILTO
  const payload = await fetchJson<CrossrefResponse>(
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3${mailto ? `&mailto=${encodeURIComponent(mailto)}` : ''}`,
    {
      headers: {
        'User-Agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
      },
    },
  )

  return (payload.message?.items ?? []).map((item) => ({
    title: item.title?.[0] ?? 'Crossref work',
    url: item.DOI ? `https://doi.org/${item.DOI}` : undefined,
    snippet: item.publisher,
    observedAt: item.published?.['date-parts']?.[0]?.join('-'),
    source: 'crossref',
  }))
}

async function getHackerNewsResults(query: string): Promise<SearchItem[]> {
  const payload = await fetchJson<HackerNewsResponse>(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=3`,
  )

  return (payload.hits ?? []).map((item) => ({
    title: item.title ?? 'Hacker News story',
    url: item.url,
    observedAt: item.created_at,
    snippet: item.author,
    source: 'hackernews',
  }))
}

function dedupeResults(items: SearchItem[]) {
  const seen = new Set<string>()
  const deduped: SearchItem[] = []

  for (const item of items) {
    const key = item.url ?? item.title.toLowerCase()

    if (seen.has(key)) continue

    seen.add(key)
    deduped.push(item)
  }

  return deduped
}

function sortSearchItems(items: SearchItem[], marketCase: MarketCase) {
  const caseText = `${marketCase.question} ${marketCase.context ?? ''}`
  const terms = getSearchTerms(caseText)

  return [...items].sort((left, right) => scoreSearchItem(right, terms) - scoreSearchItem(left, terms))
}

function scoreSearchItem(item: SearchItem, terms: string[]) {
  const haystack = `${item.title} ${item.snippet ?? ''} ${item.url ?? ''} ${item.source ?? ''}`.toLowerCase()
  const termHits = terms.filter((term) => term.length > 2 && haystack.includes(term.toLowerCase())).length
  let score = termHits

  if (/\b(transcript|caption|captions|subtitle|subtitles|quote|remarks|interview|says|said)\b/i.test(haystack)) score += 12
  if (/\b(official|video|audio|watch|vimeo|whitehouse|archive|factbase|rev|c-span|fox|fifa|sec\.gov|cdc\.gov|who\.int)\b/i.test(haystack)) score += 10
  if (/\b(latest|official|confirmed|reported|source|statement|filing|release|deadline|timeline|update|criteria|qualifying|resolution)\b/i.test(haystack)) score += 5
  if (/\b(reuters|apnews|associated press|bbc|bloomberg|cnbc|financial times|espn)\b/i.test(haystack)) score += 4
  if (/\b(polymarket|kalshi|predictmarketcap|startuphub|analytics|price|odds|volume|chance)\b/i.test(haystack)) score -= 12
  if (/\b(youtube\.com|youtu\.be|app store|google play|login|sign up|homepage)\b/i.test(haystack) && !/\b(interview|remarks|speech|statement|press conference|official channel)\b/i.test(haystack)) score -= 18

  return score
}

function parseRssItems(xml: string, source: string): SearchItem[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 12).map((match) => {
    const item = match[0]
    return {
      title: readXmlTag(item, 'title') ?? `${source} RSS item`,
      url: readXmlTag(item, 'link'),
      snippet: readXmlTag(item, 'description'),
      observedAt: readXmlTag(item, 'pubDate'),
      source,
    }
  })
}

function readXmlTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!match?.[1]) return undefined

  return decodeXml(stripHtml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))).trim()
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

async function planNewsQueries(marketCase: MarketCase, instruction = ''): Promise<Required<SearchPlan>> {
  const fallbackQueries = getFallbackNewsQueries(marketCase, instruction)
  const liveSearchText = `${marketCase.question} ${marketCase.context ?? ''} ${instruction}`.trim()
  const fallback = {
    queries: fallbackQueries,
    priorityTerms: getExpandedNewsTerms(liveSearchText),
    rationale: 'Deterministic fallback search plan: direct question, live examination question, official/source query, timing query, and credible reporting query.',
  }

  if (process.env.HELIA_DISABLE_AI_SEARCH_PLANNER === 'true') return fallback
  if (process.env.HELIA_DISABLE_MODEL === 'true' || !isCourtModelConfigured()) return fallback

  const result = await generateRawJson<SearchPlan>({
    model: process.env.HELIA_SEARCH_PLANNER_MODEL ?? process.env.HELIA_DEFAULT_MODEL ?? process.env.OPENROUTER_MODEL,
    temperature: Number(process.env.HELIA_SEARCH_PLANNER_TEMPERATURE ?? 0.05),
    system: searchPlannerSystemPrompt,
    user: JSON.stringify({
      question: marketCase.question,
      context: marketCase.context,
      liveCourtInstruction: instruction,
      links: marketCase.links,
      type: marketCase.type,
      fallbackQueries,
    }, null, 2),
  })

  if (!result.ok) return fallback

  const queries = normalizePlannerQueries(result.content.queries, fallbackQueries)
  const priorityTerms = normalizePlannerTerms(result.content.priorityTerms)

  return {
    queries,
    priorityTerms: priorityTerms.length ? priorityTerms : fallback.priorityTerms,
    rationale: cleanPlannerText(result.content.rationale) || fallback.rationale,
  }
}

const searchPlannerSystemPrompt = `
You are Helia Court's generic evidence search planner for prediction-market hearings.
Create web/news search queries from ONLY the supplied market question, live court instruction, context, links, and resolution rules.

Do not add facts not present in the input. Do not assume a specific event already happened.
Do not hardcode domain-specific facts. Derive generic evidence needs:
- exact resolution wording and qualifying event
- the specific live follow-up question, if supplied
- named actors/entities
- affected geography or population
- primary/official source type named in context
- current source flow
- timing/deadline/reporting lag
- catalysts that would make Yes plausible
- blockers or disconfirming evidence that would make No plausible

Return strict JSON:
{
  "queries": ["6-10 concise search queries"],
  "priorityTerms": ["terms that should rank results as relevant"],
  "rationale": "one sentence explaining the search strategy"
}
`

function normalizePlannerQueries(queries: unknown, fallbackQueries: string[]) {
  const planned = Array.isArray(queries)
    ? queries
      .filter((query): query is string => typeof query === 'string')
      .map((query) => getCaseSearchQuery(query))
      .filter(Boolean)
      .slice(0, 10)
    : []

  return [...new Set([...planned, ...fallbackQueries])].slice(0, 14)
}

function normalizePlannerTerms(terms: unknown) {
  return Array.isArray(terms)
    ? terms
      .filter((term): term is string => typeof term === 'string')
      .map((term) => term.toLowerCase().replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 12)
    : []
}

function cleanPlannerText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 240) : undefined
}

function getFallbackNewsQueries(marketCase: MarketCase, instruction = '') {
  const caseText = `${marketCase.question} ${marketCase.context ?? ''}`
  const liveText = `${caseText} ${instruction}`.trim()
  const base = getCaseSearchQuery(caseText)
  const liveBase = instruction ? getCaseSearchQuery(liveText) : ''
  const entities = getEntityCandidates(liveText).slice(0, 3).join(' ')
  const exactEntities = getEntityCandidates(liveText)
    .filter((entity) => /\s/.test(entity))
    .slice(0, 3)
    .map((entity) => `"${entity}"`)
    .join(' ')
  const genres = getMarketGenres(liveText)
  const quotedTerms = getQuotedTerms(liveText).slice(0, 3).join(' ')
  const dateHints = getDateHints(liveText).join(' ')
  const genreQuery = genres.length ? `${base} ${genres.join(' ')}` : base
  const officialQuery = `${entities || base} official source filing press release statement`
  const resolutionQuery = `${base} resolution criteria official source`
  const timingQuery = `${entities || base} timeline deadline reported confirmed`
  const credibilityQuery = `${entities || base} latest credible reporting source`
  const catalystQueries = getCatalystQueries({
    base,
    entities: entities || base,
    genres,
    quotedTerms,
    instruction,
  })
  const exactEntityQueries = exactEntities
    ? [
        `${exactEntities} ${genres.join(' ')} latest credible reporting`,
        `${exactEntities} official source statement confirmed`,
        `${exactEntities} ${quotedTerms || 'resolution criteria'}`,
      ]
    : []
  const needsTranscript = genres.includes('social') || /\b(interview|say|said|remarks|quote|transcript|audio|video)\b/i.test(base)
  const transcriptQueries = needsTranscript
    ? [
        `${entities || base} ${quotedTerms} transcript official audio video`,
        `${entities || base} ${quotedTerms} exact quote transcript`,
        `${entities || base} interview transcript ${quotedTerms}`,
        `${entities || base} archive transcript ${quotedTerms}`,
        `${entities || base} ${dateHints} transcript interview`,
        `${entities || base} ${dateHints} official video interview`,
      ]
    : []

  const liveQueries = instruction
    ? [
        liveBase,
        `${entities || base} ${instruction} official source latest`,
        `${entities || base} ${instruction} credible reporting`,
      ]
    : []

  return [...new Set([base, ...exactEntityQueries, ...liveQueries, ...transcriptQueries, ...catalystQueries, genreQuery, officialQuery, resolutionQuery, timingQuery, credibilityQuery])]
    .map((item) => getCaseSearchQuery(item))
    .filter(Boolean)
    .slice(0, 14)
}

function getCatalystQueries({
  base,
  entities,
  genres,
  quotedTerms,
  instruction,
}: {
  base: string
  entities: string
  genres: ReturnType<typeof getMarketGenres>
  quotedTerms: string
  instruction: string
}) {
  const queries: string[] = []
  const requestedCatalyst = /\b(catalyst|mechanism|pathway|trigger|blocker|buildup|preparation|exercise|official statement|source gap)\b/i.test(instruction)

  if (requestedCatalyst || genres.includes('geopolitics')) {
    queries.push(
      `${entities} military exercises buildup official statement latest`,
      `${entities} trigger escalation warning signs latest`,
      `${entities} defense ministry official statement drills`,
      `${entities} satellite logistics troop movement reporting`,
    )
  }

  if (requestedCatalyst || genres.includes('politics')) {
    queries.push(
      `${entities} campaign polling official filing latest`,
      `${entities} endorsement fundraising ballot access latest`,
      `${entities} election catalyst blocker credible reporting`,
    )
  }

  if (requestedCatalyst || genres.includes('business') || genres.includes('science-tech')) {
    queries.push(
      `${entities} announcement milestone revenue official source latest`,
      `${entities} launch roadmap delay catalyst latest`,
      `${entities} ${quotedTerms || 'market question'} evidence blocker source`,
    )
  }

  if (requestedCatalyst || genres.includes('sports')) {
    queries.push(
      `${entities} official team news injuries roster odds latest`,
      `${entities} schedule qualification standings official source`,
    )
  }

  return queries.length ? queries : [`${base} catalyst blocker latest evidence`]
}

function getQuotedTerms(value: string) {
  return [...value.matchAll(/["“”']([^"“”']{2,80})["“”']/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
}

function getDateHints(value: string) {
  const hints = new Set<string>()
  const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'

  for (const match of value.matchAll(new RegExp(`\\b${monthPattern}\\s+\\d{1,2},?\\s+20\\d{2}\\b`, 'gi'))) {
    hints.add(match[0].replace(/\s+/g, ' ').trim())
  }
  for (const match of value.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)) {
    hints.add(match[0])
  }

  return [...hints].slice(0, 3)
}

function getExpandedNewsTerms(question: string) {
  const terms = new Set(getSearchTerms(question).filter((term) => !softNewsTerms.has(term)))

  if (/\b(btc|bitcoin)\b/i.test(question)) {
    terms.add('btc')
    terms.add('bitcoin')
  }
  if (/\b(eth|ethereum)\b/i.test(question)) {
    terms.add('eth')
    terms.add('ethereum')
  }
  if (/\b(sol|solana)\b/i.test(question)) {
    terms.add('sol')
    terms.add('solana')
  }

  return [...terms]
}

const softNewsTerms = new Set(['reach', 'within', 'next', 'hours', 'hour', 'days', 'over', 'will', 'outperform'])

function isRelevantSearchItem(item: SearchItem, searchTerms: string[]) {
  if (!searchTerms.length) return true

  const source = item.source ?? ''
  const haystack = `${item.title} ${item.snippet ?? ''}`.toLowerCase()
  const hits = searchTerms.filter((term) => haystack.includes(term)).length

  if (referenceProviders.has(source)) return hits >= Math.min(2, searchTerms.length)
  return hits >= 1
}

function unique(value: string, index: number, values: string[]) {
  return values.indexOf(value) === index
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}
