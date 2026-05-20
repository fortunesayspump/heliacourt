import type { MarketCase, ToolEvidence } from '../../court/types'
import { fetchJson } from './http'
import { getCaseSearchQuery, getCryptoAssetIds, getSearchTerms, getStockSymbols, getUsdTarget, normalizeSearchText } from './text'

type PolymarketMarket = {
  question?: string
  slug?: string
  endDate?: string
  liquidity?: string
  volume?: string
  outcomePrices?: string
}

type PolymarketPageMarket = PolymarketMarket & {
  active?: boolean
  closed?: boolean
  bestBid?: number
  bestAsk?: number
  lastTradePrice?: number
  updatedAt?: string
}

type KalshiMarketsResponse = {
  markets?: Array<{
    ticker?: string
    title?: string
    subtitle?: string
    close_time?: string
    liquidity?: number
    volume?: number
    yes_bid?: number
    yes_ask?: number
    last_price?: number
    last_price_dollars?: string
  }>
}

type ManifoldMarket = {
  question?: string
  url?: string
  closeTime?: number
  probability?: number
  totalLiquidity?: number
  volume?: number
  volume24Hours?: number
  isResolved?: boolean
}

type RequiredMarketTerms = {
  any: string[]
  all: string[]
  numeric: string[]
}

type CoinGeckoSimplePrice = Record<
  string,
  {
    usd?: number
    usd_24h_change?: number
    usd_24h_vol?: number
    last_updated_at?: number
  }
>

export async function getPredictionMarketEvidence(marketCase: MarketCase): Promise<ToolEvidence> {
  const query = getCaseSearchQuery(marketCase.question)
  const fetchedAt = new Date().toISOString()
  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []

  try {
    const cryptoIds = getCryptoAssetIds(marketCase.question)
    const stockSymbols = getStockSymbols(marketCase.question)
    const usdTarget = cryptoIds.length || stockSymbols.length ? getUsdTarget(marketCase.question) : undefined
    const searchQueries = getPredictionSearchQueries(query, cryptoIds, usdTarget)
    const [markets, kalshiMarkets, manifoldMarkets] = await Promise.all([
      fetchPolymarketMarkets(searchQueries),
      fetchKalshiMarkets(searchQueries),
      fetchManifoldMarkets(searchQueries),
    ])

    const searchTerms = getSearchTerms(marketCase.question)
    const requiredTerms = getRequiredMarketTerms(marketCase.question, cryptoIds, stockSymbols, usdTarget)
    const relevantMarkets = markets
      .filter((market) => market.question && hasMarketRelevance(searchTerms, market.question, requiredTerms))
      .slice(0, 5)

    for (const market of relevantMarkets) {
      const liquidity = market.liquidity ? Number(market.liquidity).toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'unknown'
      observations.push(`Polymarket: ${market.question} has about ${liquidity} liquidity.`)
      sources.push({
        title: market.question ?? 'Polymarket market',
        url: market.slug ? `https://polymarket.com/event/${market.slug}` : undefined,
        observedAt: market.endDate,
        value: market.outcomePrices,
      })
    }

    const directPolymarketMarkets = !relevantMarkets.length ? await fetchPolymarketEventPageFallbacks(marketCase.question) : []
    for (const market of directPolymarketMarkets) {
      const yesPrice = getYesPrice(market)
      const volume = market.volume ? Number(market.volume).toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'unknown'
      const status = market.closed === true ? 'closed' : market.active === false ? 'inactive' : 'active'
      observations.push(
        `Polymarket direct event page fallback: ${market.question ?? 'matching market'} is ${status}; Yes is ${yesPrice ?? 'unknown'} with about ${volume} volume. Gamma search did not surface this as a relevant match, so treat the page as direct market-context evidence and the API miss as a search-quality warning.`,
      )
      sources.push({
        title: market.question ?? 'Polymarket direct event page',
        url: market.slug ? `https://polymarket.com/event/${market.slug}` : undefined,
        observedAt: market.updatedAt ?? market.endDate ?? fetchedAt,
        value: Array.isArray(market.outcomePrices) ? JSON.stringify(market.outcomePrices) : market.outcomePrices ?? yesPrice,
      })
    }

    if (!relevantMarkets.length) {
      observations.push(
        directPolymarketMarkets.length
          ? 'Polymarket Gamma public search did not match the case, but a direct event page fallback did find a market-context match.'
          : markets.length
          ? 'Polymarket public search responded, but no active market matched the case asset, target, and relevance filters.'
          : 'Polymarket public search returned no active market candidates for this query.',
      )
    }

    const broaderPolymarketMarkets = markets
      .filter((market) => market.question)
      .filter((market) => hasAssetRelevance(market.question, cryptoIds, stockSymbols))
      .filter((market) => !hasMarketRelevance(searchTerms, market.question, requiredTerms))
      .filter((market) => !isUnrelatedConditionalMarket(market.question, marketCase.question))
      .sort((a, b) => getProviderMarketScore(b, cryptoIds, usdTarget) - getProviderMarketScore(a, cryptoIds, usdTarget))
      .slice(0, 3)

    for (const market of broaderPolymarketMarkets) {
      const liquidity = market.liquidity ? Number(market.liquidity).toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'unknown'
      observations.push(`Broader market board (supporting only): Polymarket: ${market.question} has about ${liquidity} liquidity.`)
      sources.push({
        title: market.question ?? 'Polymarket broader market',
        url: market.slug ? `https://polymarket.com/event/${market.slug}` : undefined,
        observedAt: market.endDate,
        value: market.outcomePrices,
      })
    }

    const relevantKalshiMarkets = (kalshiMarkets.markets ?? [])
      .filter((market) => hasMarketRelevance(searchTerms, `${market.title ?? ''} ${market.subtitle ?? ''}`, requiredTerms))
      .slice(0, 5)

    for (const market of relevantKalshiMarkets) {
      const price = market.last_price_dollars ?? (typeof market.last_price === 'number' ? `${market.last_price} cents` : 'unknown price')
      observations.push(`Kalshi: ${market.title ?? market.ticker ?? 'market'} last traded around ${price}.`)
      sources.push({
        title: market.title ?? market.ticker ?? 'Kalshi market',
        url: market.ticker ? `https://kalshi.com/markets/${market.ticker}` : 'https://kalshi.com/markets',
        observedAt: market.close_time,
        value: price,
      })
    }

    if (!relevantKalshiMarkets.length) {
      observations.push(
        (kalshiMarkets.markets ?? []).length
          ? 'Kalshi public search responded, but no active market matched the case asset, target, and relevance filters.'
          : 'Kalshi public search returned no active market candidates for this query.',
      )
    }

    const broaderKalshiMarkets = (kalshiMarkets.markets ?? [])
      .filter((market) => hasAssetRelevance(`${market.title ?? ''} ${market.subtitle ?? ''}`, cryptoIds, stockSymbols))
      .filter((market) => !hasMarketRelevance(searchTerms, `${market.title ?? ''} ${market.subtitle ?? ''}`, requiredTerms))
      .filter((market) => !isUnrelatedConditionalMarket(`${market.title ?? ''} ${market.subtitle ?? ''}`, marketCase.question))
      .sort((a, b) => getKalshiMarketScore(b, cryptoIds, usdTarget) - getKalshiMarketScore(a, cryptoIds, usdTarget))
      .slice(0, 3)

    for (const market of broaderKalshiMarkets) {
      const price = market.last_price_dollars ?? (typeof market.last_price === 'number' ? `${market.last_price} cents` : 'unknown price')
      observations.push(`Broader market board (supporting only): Kalshi: ${market.title ?? market.ticker ?? 'market'} last traded around ${price}.`)
      sources.push({
        title: market.title ?? market.ticker ?? 'Kalshi broader market',
        url: market.ticker ? `https://kalshi.com/markets/${market.ticker}` : 'https://kalshi.com/markets',
        observedAt: market.close_time,
        value: price,
      })
    }

    const shortHorizonHours = getShortHorizonHours(marketCase.question)
    const manifoldCandidates = manifoldMarkets
      .filter((market) => !market.isResolved)
      .filter((market) => hasMarketRelevance(searchTerms, market.question, requiredTerms))
      .filter((market) => !isUnrelatedConditionalMarket(market.question, marketCase.question))
      .sort((a, b) => getMarketScore(b, marketCase.question, usdTarget) - getMarketScore(a, marketCase.question, usdTarget))
    const directHorizonManifoldMarkets = shortHorizonHours
      ? manifoldCandidates.filter((market) => isWithinHorizon(market.closeTime, shortHorizonHours))
      : manifoldCandidates
    const relevantManifoldMarkets = (directHorizonManifoldMarkets.length ? directHorizonManifoldMarkets : manifoldCandidates).slice(0, directHorizonManifoldMarkets.length ? 5 : 2)

    if (shortHorizonHours && manifoldCandidates.length && !directHorizonManifoldMarkets.length) {
      observations.push(
        `No direct Manifold market matching the ${shortHorizonHours}h horizon was found; nearby target markets below have different resolution windows and should be treated as indirect context only.`,
      )
    }

    for (const market of relevantManifoldMarkets) {
      const probability = typeof market.probability === 'number' ? `${Math.round(market.probability * 100)}%` : 'unknown probability'
      const liquidity =
        typeof market.totalLiquidity === 'number'
          ? market.totalLiquidity.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : 'unknown'
      const horizonLabel = shortHorizonHours && !isWithinHorizon(market.closeTime, shortHorizonHours) ? 'indirect horizon' : 'matching horizon'
      observations.push(`Manifold (${horizonLabel}): ${market.question ?? 'market'} implies about ${probability} with ${liquidity} liquidity.`)
      sources.push({
        title: market.question ?? 'Manifold market',
        url: market.url ?? 'https://manifold.markets/',
        observedAt: market.closeTime ? new Date(market.closeTime).toISOString() : fetchedAt,
        value: probability,
      })
    }

    const relevantManifoldQuestions = new Set(relevantManifoldMarkets.map((market) => market.question))
    const broaderManifoldMarkets = manifoldMarkets
      .filter((market) => !market.isResolved)
      .filter((market) => !relevantManifoldQuestions.has(market.question))
      .filter((market) => hasAssetRelevance(market.question, cryptoIds, stockSymbols))
      .filter((market) => !hasMarketRelevance(searchTerms, market.question, requiredTerms))
      .filter((market) => !isUnrelatedConditionalMarket(market.question, marketCase.question))
      .filter((market) => isUsefulBroaderHorizon(market.closeTime, shortHorizonHours))
      .sort((a, b) => getMarketScore(b, marketCase.question, usdTarget, { broader: true }) - getMarketScore(a, marketCase.question, usdTarget, { broader: true }))
      .slice(0, 4)

    for (const market of broaderManifoldMarkets) {
      const probability = typeof market.probability === 'number' ? `${Math.round(market.probability * 100)}%` : 'unknown probability'
      const liquidity =
        typeof market.totalLiquidity === 'number'
          ? market.totalLiquidity.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : 'unknown'
      observations.push(`Broader market board (supporting only): Manifold: ${market.question ?? 'market'} implies about ${probability} with ${liquidity} liquidity.`)
      sources.push({
        title: market.question ?? 'Manifold broader market',
        url: market.url ?? 'https://manifold.markets/',
        observedAt: market.closeTime ? new Date(market.closeTime).toISOString() : fetchedAt,
        value: probability,
      })
    }

    if (cryptoIds.length) {
      const prices = await fetchJson<CoinGeckoSimplePrice>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`,
      )

      for (const [id, data] of Object.entries(prices)) {
        const targetText =
          typeof data.usd === 'number' && usdTarget
            ? ` Target $${usdTarget.toLocaleString('en-US')} is ${(((usdTarget - data.usd) / data.usd) * 100).toFixed(2)}% from current price.`
            : ''
        observations.push(
          `${id}: $${data.usd?.toLocaleString('en-US') ?? 'unknown'} with ${data.usd_24h_change?.toFixed(2) ?? 'unknown'}% 24h change.${targetText}`,
        )
        sources.push({
          title: `CoinGecko ${id} price`,
          url: `https://www.coingecko.com/en/coins/${id}`,
          observedAt: data.last_updated_at ? new Date(data.last_updated_at * 1000).toISOString() : fetchedAt,
          value: data.usd?.toString(),
        })
      }
    }

    return {
      capability: 'prediction_market_data',
      provider: 'polymarket-gamma+kalshi+manifold+coingecko',
      query,
      fetchedAt,
      status: observations.length ? 'ok' : 'empty',
      observations,
      sources,
    }
  } catch (error) {
    return {
      capability: 'prediction_market_data',
      provider: 'polymarket-gamma+kalshi+manifold+coingecko',
      query,
      fetchedAt,
      status: 'error',
      observations: [],
      sources: [],
      error: error instanceof Error ? error.message : 'Prediction market tool failed',
    }
  }
}

function hasMarketRelevance(searchTerms: string[], marketQuestion = '', requiredTerms: RequiredMarketTerms) {
  const normalizedQuestion = normalizeSearchText(marketQuestion)

  if (requiredTerms.all.length && !requiredTerms.all.every((term) => normalizedQuestion.includes(normalizeSearchText(term)))) {
    return false
  }

  if (requiredTerms.any.length && !requiredTerms.any.some((term) => normalizedQuestion.includes(normalizeSearchText(term)))) {
    return false
  }

  if (requiredTerms.numeric.length && !requiredTerms.numeric.some((term) => normalizedQuestion.includes(term))) {
    return false
  }

  return hasEnoughOverlap(searchTerms, normalizedQuestion)
}

function hasAssetRelevance(marketQuestion = '', cryptoIds: string[], stockSymbols: string[]) {
  const normalizedQuestion = normalizeSearchText(marketQuestion)
  const cryptoTerms = cryptoIds.flatMap((id) => {
    if (id === 'bitcoin') return ['bitcoin', 'btc']
    if (id === 'ethereum') return ['ethereum', 'ether', 'eth']
    if (id === 'solana') return ['solana', 'sol']
    return [id]
  })
  const assetTerms = [...cryptoTerms, ...stockSymbols.map((symbol) => symbol.toLowerCase())]

  return assetTerms.length > 0 && assetTerms.some((term) => normalizedQuestion.includes(normalizeSearchText(term)))
}

function hasEnoughOverlap(searchTerms: string[], marketQuestion = '') {
  if (!searchTerms.length) return false

  const normalized = normalizeSearchText(marketQuestion)
  const hits = searchTerms.filter((term) => normalized.includes(term)).length

  return hits >= Math.min(2, searchTerms.length)
}

function getRequiredMarketTerms(question: string, cryptoIds: string[], stockSymbols: string[], usdTarget?: number): RequiredMarketTerms {
  const cryptoTerms = cryptoIds.flatMap((id) => {
    if (id === 'bitcoin') return ['bitcoin', 'btc']
    if (id === 'ethereum') return ['ethereum', 'ether', 'eth']
    if (id === 'solana') return ['solana', 'sol']
    return [id]
  })
  const assetTerms = [...cryptoTerms, ...stockSymbols.map((symbol) => symbol.toLowerCase())]

  if (assetTerms.length) return { any: assetTerms, all: [], numeric: usdTarget ? [String(usdTarget)] : [] }

  const topicTerms = getDistinctiveTopicTerms(question)
  const [topicAnchor] = topicTerms
  const contextAnchor = topicTerms.find((term) => term !== topicAnchor)

  return { any: [], all: [topicAnchor, contextAnchor].filter((term): term is string => Boolean(term)), numeric: [] }
}

function getPredictionSearchQueries(query: string, cryptoIds: string[], usdTarget?: number) {
  const aliases = cryptoIds.flatMap((id) => {
    if (id === 'bitcoin') return ['BTC', 'Bitcoin']
    if (id === 'ethereum') return ['ETH', 'Ethereum']
    if (id === 'solana') return ['SOL', 'Solana']
    return [id]
  })
  const targetQueries = usdTarget
    ? aliases.flatMap((alias) => [`${alias} ${usdTarget}`, `${alias} ${Math.round(usdTarget / 1000)}k`, `${alias} price`])
    : aliases.map((alias) => `${alias} price`)
  const topicTerms = !aliases.length && !usdTarget ? getDistinctiveTopicTerms(query) : []
  const topicQueries =
    topicTerms.length > 0
      ? [
          topicTerms.slice(0, 4).join(' '),
          topicTerms.slice(0, 3).join(' '),
          topicTerms[0],
          topicTerms.slice(0, 2).reverse().join(' '),
        ]
      : []

  return [...new Set([query, ...targetQueries, ...topicQueries].filter((item): item is string => Boolean(item)))].slice(0, 8)
}

function getDistinctiveTopicTerms(question: string) {
  const genericTerms = new Set([
    'will',
    'would',
    'should',
    'could',
    'play',
    'played',
    'playing',
    'selected',
    'called',
    'called up',
    'squad',
    'team',
    'fifa',
    'world',
    'cup',
    'match',
    'game',
    'games',
    'market',
    'question',
    'before',
    'after',
    'during',
    'within',
    'next',
    'this',
    'that',
    'yes',
    'no',
  ])

  return [...new Set(getSearchTerms(question))]
    .filter((term) => term.length > 3)
    .filter((term) => !/^\d{4}$/.test(term))
    .filter((term) => !genericTerms.has(term))
    .slice(0, 6)
}

async function fetchPolymarketMarkets(queries: string[]) {
  const results = await Promise.allSettled(
    queries.map((search) =>
      fetchJson<PolymarketMarket[]>(`https://gamma-api.polymarket.com/markets?limit=12&closed=false&search=${encodeURIComponent(search)}`).catch(() => []),
    ),
  )

  return dedupeByQuestion(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])))
}

async function fetchPolymarketEventPageFallbacks(question: string) {
  const candidates = getPolymarketEventSlugCandidates(question)
  const results = await Promise.allSettled(candidates.map((slug) => fetchPolymarketEventPage(slug)))
  return dedupeByQuestion(
    results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : [])),
    (market) => market.slug ?? market.question,
  )
    .sort((a, b) => scoreDirectPolymarketFallback(b) - scoreDirectPolymarketFallback(a))
    .slice(0, 2)
}

function scoreDirectPolymarketFallback(market: PolymarketPageMarket) {
  let score = 0
  if (market.active !== false) score += 4
  if (market.closed !== true) score += 2
  if (getYesPrice(market)) score += 3
  if (market.volume && Number(market.volume) > 0) score += 1
  if (market.slug?.endsWith('-1')) score += 1
  return score
}

async function fetchPolymarketEventPage(slug: string): Promise<PolymarketPageMarket | undefined> {
  const url = `https://polymarket.com/event/${slug}`
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 HeliaCourt/0.1 market-context-fallback',
    },
  })

  if (!response.ok) return undefined

  const html = await response.text()
  const market = extractPolymarketPageMarket(html, slug)
  if (!market?.question && !market?.outcomePrices) return undefined

  return {
    ...market,
    slug,
  }
}

function extractPolymarketPageMarket(html: string, slug?: string): PolymarketPageMarket | undefined {
  const question = decodeHtml(readMetaContent(html, 'og:title') ?? readTitle(html))
  const description = decodeHtml(readMetaContent(html, 'description') ?? '')
  const pageJsonMarket = extractPolymarketEmbeddedMarket(html, slug)
  const probability = pageJsonMarket ? getYesPrice(pageJsonMarket) : extractProbabilityFromText(description)
  const volume = pageJsonMarket?.volume ?? extractVolumeFromText(description)

  return {
    ...pageJsonMarket,
    question: pageJsonMarket?.question ?? question,
    outcomePrices: pageJsonMarket?.outcomePrices ?? (probability ? JSON.stringify([probabilityToDecimal(probability), String(1 - Number(probabilityToDecimal(probability)))]) : undefined),
    volume,
  }
}

function extractPolymarketEmbeddedMarket(html: string, slug?: string): PolymarketPageMarket | undefined {
  const marker = slug ? `"slug":"${slug}"` : '"outcomePrices"'
  let markerIndex = html.indexOf(marker)
  if (markerIndex === -1 && slug) markerIndex = html.indexOf('"outcomePrices"')
  if (markerIndex === -1) return undefined

  const start = html.lastIndexOf('{', markerIndex)
  const end = findJsonObjectEnd(html, start)
  if (start === -1 || end === -1) return undefined

  try {
    const parsed = JSON.parse(html.slice(start, end + 1)) as PolymarketPageMarket & { title?: string; markets?: PolymarketPageMarket[] }
    const market = parsed.markets?.find((candidate) => candidate.outcomePrices)
    const normalized = market ?? parsed
    normalized.question = normalized.question ?? parsed.question ?? parsed.title
    normalized.volume = normalized.volume ?? parsed.volume
    normalized.endDate = normalized.endDate ?? parsed.endDate
    normalized.active = normalized.active ?? parsed.active
    normalized.closed = normalized.closed ?? parsed.closed
    if (!normalized.question && !normalized.outcomePrices) return undefined
    return normalized
  } catch {
    return undefined
  }
}

function findJsonObjectEnd(text: string, start: number) {
  if (start < 0) return -1

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') inString = true
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function getPolymarketEventSlugCandidates(question: string) {
  const base = slugifyMarketQuestion(question)
  const withoutYearAfterDate = base.replace(/-(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{1,2})-\d{4}$/u, '-$1-$2')
  const withoutByYear = base.replace(/-by-\d{4}$/u, '')
  const withoutTrailingYear = base.replace(/-\d{4}$/u, '')

  return [...new Set([
    `${base}-1`,
    base,
    withoutYearAfterDate ? `${withoutYearAfterDate}-1` : '',
    withoutYearAfterDate,
    withoutByYear ? `${withoutByYear}-1` : '',
    withoutByYear,
    withoutTrailingYear ? `${withoutTrailingYear}-1` : '',
    withoutTrailingYear,
  ].filter(Boolean))].slice(0, 8)
}

function slugifyMarketQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/['’]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function getYesPrice(market: Pick<PolymarketPageMarket, 'outcomePrices' | 'lastTradePrice' | 'bestBid' | 'bestAsk'>) {
  const prices = parseOutcomePrices(market.outcomePrices)
  const yes = prices?.[0] ?? market.lastTradePrice ?? midpoint(market.bestBid, market.bestAsk)
  if (typeof yes !== 'number' || !Number.isFinite(yes)) return undefined

  return yes <= 1 ? `${Math.round(yes * 100)}%` : `${Math.round(yes)}%`
}

function parseOutcomePrices(outcomePrices?: string) {
  if (!outcomePrices) return undefined
  try {
    const parsed = JSON.parse(outcomePrices) as unknown
    if (!Array.isArray(parsed)) return undefined
    return parsed.map((price) => Number(price)).filter((price) => Number.isFinite(price))
  } catch {
    return undefined
  }
}

function midpoint(a?: number, b?: number) {
  if (typeof a !== 'number' || typeof b !== 'number') return undefined
  return (a + b) / 2
}

function probabilityToDecimal(probability: string) {
  const value = Number(probability.replace('%', ''))
  return String(value > 1 ? value / 100 : value)
}

function extractProbabilityFromText(text: string) {
  return text.match(/probability is\s+(\d{1,3})%/iu)?.[1] ?? text.match(/(\d{1,3})%\s+for\s+["“]?Yes/iu)?.[1]
}

function extractVolumeFromText(text: string) {
  const match = text.match(/\$([\d,.]+)\s*([KMB])?/iu)
  if (!match?.[1]) return undefined
  const raw = Number(match[1].replace(/,/g, ''))
  const multiplier = match[2]?.toUpperCase() === 'B' ? 1_000_000_000 : match[2]?.toUpperCase() === 'M' ? 1_000_000 : match[2]?.toUpperCase() === 'K' ? 1_000 : 1
  return String(raw * multiplier)
}

function readMetaContent(html: string, name: string) {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']+)["']`, 'iu')
  return html.match(pattern)?.[1]
}

function readTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]
}

function decodeHtml(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s*\|\s*Polymarket$/iu, '')
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function fetchKalshiMarkets(queries: string[]) {
  const results = await Promise.allSettled(
    queries.map((search) =>
      fetchJson<KalshiMarketsResponse>(`https://external-api.kalshi.com/trade-api/v2/markets?limit=12&search=${encodeURIComponent(search)}`).catch(() => ({ markets: [] })),
    ),
  )

  const markets = results.flatMap((result) => (result.status === 'fulfilled' ? result.value.markets ?? [] : []))
  return { markets: dedupeKalshiMarkets(markets) }
}

async function fetchManifoldMarkets(queries: string[]) {
  const results = await Promise.allSettled(
    queries.map((search) =>
      fetchJson<ManifoldMarket[]>(`https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(search)}&limit=12`).catch(() => []),
    ),
  )

  return dedupeByQuestion(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])))
}

function dedupeByQuestion<T extends { question?: string }>(items: T[], getKey?: (item: T) => string | undefined) {
  const seen = new Set<string>()
  const output: T[] = []

  for (const item of items) {
    const key = getKey?.(item) ?? item.question
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }

  return output
}

function dedupeKalshiMarkets(markets: NonNullable<KalshiMarketsResponse['markets']>) {
  const seen = new Set<string>()
  const output: NonNullable<KalshiMarketsResponse['markets']> = []

  for (const market of markets) {
    const key = market.ticker ?? `${market.title} ${market.subtitle}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(market)
  }

  return output
}

function getShortHorizonHours(question: string) {
  const match = question.match(/\bwithin\s+(\d+)\s*(hour|hours|h)\b/i) ?? question.match(/\bnext\s+(\d+)\s*(hour|hours|h)\b/i)
  if (!match?.[1]) return undefined
  const hours = Number(match[1])
  return Number.isFinite(hours) ? hours : undefined
}

function isWithinHorizon(closeTime: number | undefined, horizonHours: number) {
  if (!closeTime) return false
  const closeMs = closeTime > 10_000_000_000 ? closeTime : closeTime * 1000
  const deltaHours = (closeMs - Date.now()) / 3_600_000
  return deltaHours > 0 && deltaHours <= horizonHours + 3
}

function isUsefulBroaderHorizon(closeTime: number | undefined, shortHorizonHours?: number) {
  if (!shortHorizonHours || !closeTime) return true
  const closeMs = closeTime > 10_000_000_000 ? closeTime : closeTime * 1000
  const deltaDays = (closeMs - Date.now()) / 86_400_000

  return deltaDays > 0 && deltaDays <= 400
}

function isUnrelatedConditionalMarket(marketQuestion = '', caseQuestion: string) {
  const normalizedMarket = normalizeSearchText(marketQuestion)
  const normalizedCase = normalizeSearchText(caseQuestion)
  const unrelatedTerms = ['spacex', 'gta', 'ipo', 'rihanna', 'album', 'christ', 'trump', 'taiwan']

  return unrelatedTerms.some((term) => normalizedMarket.includes(term) && !normalizedCase.includes(term))
}

function getProviderMarketScore(market: PolymarketMarket, cryptoIds: string[], usdTarget?: number) {
  const normalizedMarket = normalizeSearchText(market.question)
  let score = getAssetScore(normalizedMarket, cryptoIds)

  if (usdTarget && normalizedMarket.includes(String(usdTarget))) score += 5
  if (/\b(price|close|above|below|reach|hit|cross|ath|all time high|end of)\b/.test(normalizedMarket)) score += 2
  if (market.liquidity) score += Math.min(Number(market.liquidity) / 10_000, 2)
  if (market.volume) score += Math.min(Number(market.volume) / 100_000, 2)

  return score
}

function getKalshiMarketScore(market: NonNullable<KalshiMarketsResponse['markets']>[number], cryptoIds: string[], usdTarget?: number) {
  const normalizedMarket = normalizeSearchText(`${market.title ?? ''} ${market.subtitle ?? ''}`)
  let score = getAssetScore(normalizedMarket, cryptoIds)

  if (usdTarget && normalizedMarket.includes(String(usdTarget))) score += 5
  if (/\b(price|close|above|below|reach|hit|cross|ath|all time high|end of)\b/.test(normalizedMarket)) score += 2
  if (typeof market.liquidity === 'number') score += Math.min(market.liquidity / 10_000, 2)
  if (typeof market.volume === 'number') score += Math.min(market.volume / 100_000, 2)

  return score
}

function getAssetScore(normalizedMarket: string, cryptoIds: string[]) {
  let score = 0

  if (cryptoIds.includes('bitcoin') && (normalizedMarket.includes('btc') || normalizedMarket.includes('bitcoin'))) score += 4
  if (cryptoIds.includes('ethereum') && (normalizedMarket.includes('eth') || normalizedMarket.includes('ethereum') || normalizedMarket.includes('ether'))) score += 4
  if (cryptoIds.includes('solana') && (normalizedMarket.includes('sol') || normalizedMarket.includes('solana'))) score += 4

  return score
}

function getMarketScore(market: ManifoldMarket, caseQuestion: string, usdTarget?: number, options?: { broader?: boolean }) {
  const normalizedMarket = normalizeSearchText(market.question)
  const normalizedCase = normalizeSearchText(caseQuestion)
  let score = 0

  if (normalizedMarket.includes('btc') || normalizedMarket.includes('bitcoin')) score += 4
  if (usdTarget && normalizedMarket.includes(String(usdTarget))) score += options?.broader ? 1 : 5
  if (/\b(close|above|reach|hit|cross)\b/.test(normalizedMarket)) score += 2
  if (/\b(price|ath|all time high|end of|before|after)\b/.test(normalizedMarket)) score += 1
  if (typeof market.totalLiquidity === 'number') score += Math.min(market.totalLiquidity / 2_500, 3)
  if (typeof market.volume24Hours === 'number') score += Math.min(market.volume24Hours / 1_000, 2)
  if (typeof market.volume === 'number') score += Math.min(market.volume / 10_000, 2)
  if (options?.broader && market.closeTime) {
    const closeMs = market.closeTime > 10_000_000_000 ? market.closeTime : market.closeTime * 1000
    const deltaDays = (closeMs - Date.now()) / 86_400_000
    if (deltaDays > 0) score += Math.max(0, 2 - deltaDays / 90)
  }
  for (const term of normalizeSearchText(caseQuestion).split(' ')) {
    if (term.length > 3 && normalizedMarket.includes(term)) score += 0.5
  }
  if (normalizedMarket.includes('end of') && !normalizedCase.includes('end of')) score -= 1
  if (isUnrelatedConditionalMarket(market.question, caseQuestion)) score -= 10

  return score
}
