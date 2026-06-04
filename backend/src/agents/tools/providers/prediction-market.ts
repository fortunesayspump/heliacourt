import type { MarketCase, ToolEvidence } from '../../../court/types'
import { fetchJson } from '../http'
import { getCaseSearchQuery, getCryptoAssetIds, getSearchTerms, getStockSymbols, getUsdTarget, normalizeSearchText } from '../text'

type PolymarketMarket = {
  question?: string
  slug?: string
  eventSlug?: string
  endDate?: string
  liquidity?: string
  volume?: string
  volume24hr?: number
  volume1wk?: number
  volume1mo?: number
  volumeClob?: number
  liquidityClob?: number
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number
  updatedAt?: string
  acceptingOrders?: boolean
  enableOrderBook?: boolean
  clobTokenIds?: string
  outcomePrices?: string
  outcomes?: string
  description?: string
  rules?: string
  sourceUrl?: string
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
    event_ticker?: string
    title?: string
    subtitle?: string
    yes_sub_title?: string
    close_time?: string
    expected_expiration_time?: string
    liquidity?: number
    liquidity_dollars?: string
    volume?: number
    volume_24h_fp?: string
    volume_fp?: string
    open_interest_fp?: string
    yes_bid?: number
    yes_ask?: number
    yes_bid_dollars?: string
    yes_ask_dollars?: string
    yes_bid_size_fp?: string
    yes_ask_size_fp?: string
    no_bid_dollars?: string
    no_ask_dollars?: string
    no_bid_size_fp?: string
    no_ask_size_fp?: string
    last_price?: number
    last_price_dollars?: string
    previous_price_dollars?: string
    previous_yes_bid_dollars?: string
    previous_yes_ask_dollars?: string
    rules_primary?: string
    rules_secondary?: string
    status?: string
    updated_time?: string
  }>
}

type KalshiMarket = NonNullable<KalshiMarketsResponse['markets']>[number]

type ManifoldMarket = {
  id?: string
  question?: string
  url?: string
  slug?: string
  textDescription?: string
  description?: unknown
  createdTime?: number
  closeTime?: number
  probability?: number
  totalLiquidity?: number
  pool?: Record<string, number>
  volume?: number
  volume24Hours?: number
  uniqueBettorCount?: number
  lastUpdatedTime?: number
  lastBetTime?: number
  mechanism?: string
  outcomeType?: string
  isResolved?: boolean
  answers?: Array<{
    id?: string
    text?: string
    name?: string
    probability?: number
  }>
  sourceUrl?: string
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

type JsonRecord = Record<string, unknown>

type PolymarketOrderBook = {
  market?: string
  asset_id?: string
  timestamp?: string
  bids?: Array<{ price?: string; size?: string }>
  asks?: Array<{ price?: string; size?: string }>
}

type KalshiOrderBook = {
  orderbook_fp?: {
    yes_dollars?: Array<[string, string]>
    no_dollars?: Array<[string, string]>
  }
}

type ManifoldBet = {
  outcome?: string
  amount?: number
  orderAmount?: number
  shares?: number
  probBefore?: number
  probAfter?: number
  limitProb?: number
  isFilled?: boolean
  isCancelled?: boolean
  createdTime?: number
  updatedTime?: number
}

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
    const [searchPolymarketMarkets, directPolymarketLinkMarkets, kalshiSearchMarkets, directKalshiMarkets, searchManifoldMarkets, directManifoldLinkMarkets] = await Promise.all([
      fetchPolymarketMarkets(searchQueries),
      fetchPolymarketMarketsFromLinks(marketCase.links),
      fetchKalshiMarkets(searchQueries),
      fetchKalshiMarketsFromLinks(marketCase.links),
      fetchManifoldMarkets(searchQueries),
      fetchManifoldMarketsFromLinks(marketCase.links),
    ])
    const directPolymarketKeys = new Set(directPolymarketLinkMarkets.map(getPolymarketKey).filter((key): key is string => Boolean(key)))
    const directManifoldKeys = new Set(directManifoldLinkMarkets.map(getManifoldKey).filter((key): key is string => Boolean(key)))
    const markets = dedupeByQuestion([...directPolymarketLinkMarkets, ...searchPolymarketMarkets], getPolymarketKey)
    const manifoldMarkets = dedupeByQuestion([...directManifoldLinkMarkets, ...searchManifoldMarkets], getManifoldKey)
    const kalshiMarkets = { markets: dedupeKalshiMarkets([...(directKalshiMarkets.markets ?? []), ...(kalshiSearchMarkets.markets ?? [])]) }
    const directPolymarketEventWide = isDirectPolymarketEventWideLink(marketCase.links) && directPolymarketLinkMarkets.length > 1
    const directManifoldEventWide = directManifoldLinkMarkets.some((market) => isManifoldMultiOutcomeMarket(market))
    const directManifoldNumeric = directManifoldLinkMarkets.some((market) => isManifoldNumericMarket(market))

    if (directPolymarketEventWide) {
      observations.push(
        `Direct Polymarket event-wide filing: the supplied link points to an event page with ${directPolymarketLinkMarkets.length} child contracts and no selected child market slug. Treat this as an event-wide ranking/hearing: compare outcomes and sibling pressure; do not call the case defective merely because no single filed contract was selected.`,
      )
    }

    if (directManifoldEventWide) {
      const outcomeCount = directManifoldLinkMarkets.find(isManifoldMultiOutcomeMarket)?.answers?.length ?? 0
      observations.push(
        `Direct Manifold event-wide filing: the supplied market is ${outcomeCount ? `a ${outcomeCount}-outcome` : 'a multi-outcome'} market. Treat the hearing as event-wide: compare listed answers, eliminate placeholders, and issue a ranked/no-edge forecast rather than forcing a binary Yes/No proxy.`,
      )
    }

    if (directManifoldNumeric) {
      const outcomeType = directManifoldLinkMarkets.find(isManifoldNumericMarket)?.outcomeType ?? 'numeric/distribution'
      observations.push(
        `Direct Manifold non-binary filing: the supplied market has outcome type ${outcomeType}. Treat this as a numeric/distribution forecast: estimate the value/range or leading interval(s), and do not force a Yes/No verdict unless the filed question is a separate binary threshold contract.`,
      )
    }

    const searchTerms = getSearchTerms(marketCase.question)
    const requiredTerms = getRequiredMarketTerms(marketCase.question, cryptoIds, stockSymbols, usdTarget)
    const relevantMarkets = markets
      .filter((market) => directPolymarketKeys.has(getPolymarketKey(market) ?? '') || (market.question && hasMarketRelevance(searchTerms, getPolymarketMarketText(market), requiredTerms)))
      .filter((market) => !isPlaceholderMarketText(getPolymarketMarketText(market)))
      .filter((market) => directPolymarketKeys.has(getPolymarketKey(market) ?? '') || !isUnrelatedConditionalMarket(getPolymarketMarketText(market), marketCase.question))
      .slice(0, directPolymarketKeys.size ? 12 : 5)

    const directPolymarketBooks = new Map<string, string>()
    for (const market of relevantMarkets.filter((market) => directPolymarketKeys.has(getPolymarketKey(market) ?? ''))) {
      const summary = await getPolymarketOrderBookSummary(market).catch(() => undefined)
      if (summary) directPolymarketBooks.set(getPolymarketKey(market) ?? market.question ?? '', summary)
    }

    for (const market of relevantMarkets) {
      const liquidity = market.liquidity ? Number(market.liquidity).toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'unknown'
      const sourceKind = directPolymarketKeys.has(getPolymarketKey(market) ?? '') ? 'direct linked market/event' : 'search match'
      const orderBookSummary = directPolymarketBooks.get(getPolymarketKey(market) ?? market.question ?? '') ?? formatPolymarketMarketMicrostructure(market)
      observations.push(`Polymarket ${sourceKind}: ${market.question} has about ${liquidity} liquidity.${formatPolymarketOutcomes(market)}${orderBookSummary ? ` ${orderBookSummary}` : ''}`)
      sources.push({
        title: market.question ?? 'Polymarket market',
        url: market.sourceUrl ?? (market.eventSlug && market.slug ? `https://polymarket.com/event/${market.eventSlug}/${market.slug}` : market.slug ? `https://polymarket.com/event/${market.slug}` : undefined),
        observedAt: market.updatedAt ?? market.endDate,
        value: [market.outcomePrices, orderBookSummary].filter(Boolean).join(' | '),
      })
    }

    const directPolymarketMarkets = !relevantMarkets.length && !directPolymarketLinkMarkets.length ? await fetchPolymarketEventPageFallbacks(marketCase.question) : []
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
      .filter((market) => !directPolymarketKeys.has(getPolymarketKey(market) ?? ''))
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

    const directKalshiTickers = new Set((directKalshiMarkets.markets ?? []).map((market) => market.ticker).filter(Boolean))
    const relevantKalshiMarkets = (kalshiMarkets.markets ?? [])
      .filter((market) => directKalshiTickers.has(market.ticker) || hasMarketRelevance(searchTerms, getKalshiMarketText(market), requiredTerms))
      .filter((market) => !isPlaceholderMarketText(getKalshiMarketText(market)))
      .slice(0, directKalshiTickers.size ? 12 : 5)

    for (const market of relevantKalshiMarkets) {
      const price = market.last_price_dollars ?? (typeof market.last_price === 'number' ? `${market.last_price} cents` : 'unknown price')
      const sourceKind = directKalshiTickers.has(market.ticker) ? 'direct linked market' : 'search match'
      const marketStructure = await getKalshiOrderBookSummary(market).catch(() => formatKalshiMarketMicrostructure(market))
      observations.push(`Kalshi ${sourceKind}: ${market.title ?? market.ticker ?? 'market'} last traded around ${price}.${marketStructure ? ` ${marketStructure}` : ''}`)
      sources.push({
        title: market.title ?? market.ticker ?? 'Kalshi market',
        url: market.ticker && market.event_ticker ? `https://kalshi.com/markets/${market.event_ticker.split('-')[0]?.toLowerCase()}/${market.event_ticker.toLowerCase()}` : 'https://kalshi.com/markets',
        observedAt: market.updated_time ?? market.close_time ?? market.expected_expiration_time,
        value: [price, marketStructure, market.rules_primary].filter(Boolean).join(' | '),
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
      .filter((market) => !directKalshiTickers.has(market.ticker))
      .filter((market) => hasAssetRelevance(getKalshiMarketText(market), cryptoIds, stockSymbols))
      .filter((market) => !hasMarketRelevance(searchTerms, getKalshiMarketText(market), requiredTerms))
      .filter((market) => !isUnrelatedConditionalMarket(getKalshiMarketText(market), marketCase.question))
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
      .filter((market) => directManifoldKeys.has(getManifoldKey(market) ?? '') || hasMarketRelevance(searchTerms, getManifoldMarketText(market), requiredTerms))
      .filter((market) => !isPlaceholderMarketText(getManifoldMarketText(market)))
      .filter((market) => !isUnrelatedConditionalMarket(market.question, marketCase.question))
      .sort((a, b) => getDirectMarketPriority(b, directManifoldKeys, getManifoldKey) - getDirectMarketPriority(a, directManifoldKeys, getManifoldKey)
        || getMarketScore(b, marketCase.question, usdTarget) - getMarketScore(a, marketCase.question, usdTarget))
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
      const sourceKind = directManifoldKeys.has(getManifoldKey(market) ?? '') ? 'direct linked market/event' : horizonLabel
      const activitySummary = await getManifoldActivitySummary(market).catch(() => formatManifoldMarketMicrostructure(market))
      observations.push(`Manifold (${sourceKind}): ${market.question ?? 'market'} implies about ${probability} with ${liquidity} liquidity.${formatManifoldAnswers(market)}${formatManifoldResolutionText(market)}${activitySummary ? ` ${activitySummary}` : ''}`)
      sources.push({
        title: market.question ?? 'Manifold market',
        url: market.sourceUrl ?? market.url ?? 'https://manifold.markets/',
        observedAt: formatManifoldTime(market.lastUpdatedTime) ?? (market.closeTime ? new Date(market.closeTime).toISOString() : fetchedAt),
        value: [probability, formatManifoldResolutionText(market).trim(), activitySummary].filter(Boolean).join(' | '),
      })
    }

    const relevantManifoldQuestions = new Set(relevantManifoldMarkets.map((market) => market.question))
    const broaderManifoldMarkets = manifoldMarkets
      .filter((market) => !market.isResolved)
      .filter((market) => !relevantManifoldQuestions.has(market.question))
      .filter((market) => !directManifoldKeys.has(getManifoldKey(market) ?? ''))
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

function isPlaceholderMarketText(value = '') {
  const normalized = normalizeSearchText(value)
  const placeholderPatterns = [
    /\bparty [a-z]\b/u,
    /\bcandidate [a-z]\b/u,
    /\boption [a-z]\b/u,
    /\boutcome [a-z]\b/u,
    /\bteam [a-z]\b/u,
    /\bplayer [a-z]\b/u,
  ]
  return placeholderPatterns.some((pattern) => pattern.test(normalized))
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

async function fetchPolymarketMarketsFromLinks(links?: string[]) {
  const polymarketLinks = (links ?? []).map(parsePolymarketUrl).filter((item): item is PolymarketUrlParts => Boolean(item?.eventSlug || item?.marketSlug))
  const results = await Promise.allSettled(polymarketLinks.map(fetchPolymarketMarketsFromUrlParts))
  return dedupeByQuestion(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])), getPolymarketKey)
}

type PolymarketUrlParts = {
  eventSlug?: string
  marketSlug?: string
  sourceUrl: string
}

function parsePolymarketUrl(value: string): PolymarketUrlParts | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (!url.hostname.replace(/^www\./, '').endsWith('polymarket.com')) return undefined
  const segments = url.pathname.split('/').filter(Boolean)
  const eventIndex = segments.indexOf('event')
  const eventSlug = eventIndex >= 0 ? segments[eventIndex + 1] : segments[0]
  const marketSlug = eventIndex >= 0 ? segments[eventIndex + 2] : segments.at(-1)
  if (!eventSlug && !marketSlug) return undefined
  return { eventSlug, marketSlug, sourceUrl: url.toString() }
}

function isDirectPolymarketEventWideLink(links?: string[]) {
  return (links ?? []).some((value) => {
    try {
      const url = new URL(value)
      if (!url.hostname.replace(/^www\./, '').endsWith('polymarket.com')) return false
      const segments = url.pathname.split('/').filter(Boolean)
      const eventIndex = segments.indexOf('event')
      return eventIndex >= 0 && Boolean(segments[eventIndex + 1]) && !segments[eventIndex + 2]
    } catch {
      return false
    }
  })
}

async function fetchPolymarketMarketsFromUrlParts(parts: PolymarketUrlParts): Promise<PolymarketMarket[]> {
  const marketResults = parts.marketSlug
    ? await fetchJson<PolymarketMarket[]>(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(parts.marketSlug)}`).catch(() => [])
    : []
  const directMarkets = normalizePolymarketMarkets(marketResults, parts)
  if (parts.marketSlug && directMarkets.length) return directMarkets

  if (!parts.eventSlug) return []
  const eventPayload = await fetchJson<unknown>(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(parts.eventSlug)}`).catch(() => undefined)
  const eventRecord = firstJsonRecord(eventPayload)
  const eventMarkets = collectJsonRecords(eventPayload)
    .filter((record) => record !== eventRecord)
    .filter((record) => typeof record.question === 'string' || typeof record.outcomePrices === 'string' || Array.isArray(record.outcomePrices))
    .map((record) => record as PolymarketMarket)
  const normalizedEventMarkets = normalizePolymarketMarkets(eventMarkets, parts, eventRecord)
  if (normalizedEventMarkets.length) return normalizedEventMarkets

  const singleSlugMarket = await fetchJson<PolymarketMarket[]>(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(parts.eventSlug)}`).catch(() => [])
  return normalizePolymarketMarkets(singleSlugMarket, { ...parts, eventSlug: undefined, marketSlug: parts.eventSlug })
}

function normalizePolymarketMarkets(markets: PolymarketMarket[] | undefined, parts: PolymarketUrlParts, eventRecord?: Record<string, unknown>) {
  return (markets ?? [])
    .map((market) => ({
      ...market,
      eventSlug: parts.eventSlug,
      sourceUrl: buildPolymarketSourceUrl(market, parts),
      description: market.description ?? stringFromRecord(eventRecord, 'description') ?? stringFromRecord(eventRecord, 'eventDescription'),
    }))
    .filter((market) => market.question || market.slug)
    .filter((market) => !isPlaceholderMarketText(getPolymarketMarketText(market)))
}

function buildPolymarketSourceUrl(market: PolymarketMarket, parts: PolymarketUrlParts) {
  if (!market.slug || !parts.marketSlug) return parts.sourceUrl
  const eventSlug = parts.eventSlug ?? market.eventSlug
  return eventSlug
    ? `https://polymarket.com/event/${eventSlug}/${market.slug}`
    : `https://polymarket.com/market/${market.slug}`
}

function getPolymarketKey(market: PolymarketMarket) {
  return market.slug ?? market.question
}

function getPolymarketMarketText(market: PolymarketMarket) {
  return [
    market.question,
    market.slug,
    market.eventSlug,
    market.description,
    market.rules,
    parseTextArray(market.outcomes).join(' '),
  ].filter(Boolean).join(' ')
}

function formatPolymarketOutcomes(market: PolymarketMarket) {
  const outcomes = parseTextArray(market.outcomes)
  const prices = parseTextArray(market.outcomePrices)
  if (!outcomes.length && !prices.length) return ''
  const pairs = outcomes.length
    ? outcomes.map((outcome, index) => {
        const price = prices[index]
        return price ? `${outcome} ${formatProbabilityText(price)}` : outcome
      })
    : prices.map(formatProbabilityText)
  const realPairs = pairs.filter((pair) => !isPlaceholderMarketText(pair))
  return realPairs.length ? ` Outcomes: ${realPairs.slice(0, 8).join(', ')}.` : ''
}

function formatPolymarketMarketMicrostructure(market: PolymarketMarket) {
  const parts = [
    typeof market.bestBid === 'number' ? `best bid ${formatProbabilityText(market.bestBid)}` : undefined,
    typeof market.bestAsk === 'number' ? `best ask ${formatProbabilityText(market.bestAsk)}` : undefined,
    typeof market.spread === 'number' ? `spread ${(market.spread * 100).toFixed(2)} points` : undefined,
    typeof market.lastTradePrice === 'number' ? `last trade ${formatProbabilityText(market.lastTradePrice)}` : undefined,
    typeof market.volume24hr === 'number' ? `24h volume $${market.volume24hr.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : undefined,
    typeof market.volume1wk === 'number' ? `1w volume $${market.volume1wk.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : undefined,
    market.updatedAt ? `updated ${market.updatedAt}` : undefined,
    market.acceptingOrders === false ? 'not accepting orders' : market.acceptingOrders === true ? 'accepting orders' : undefined,
  ].filter(Boolean)

  return parts.length ? `Order-book/microstructure: ${parts.join(', ')}.` : ''
}

async function getPolymarketOrderBookSummary(market: PolymarketMarket) {
  const tokenIds = parseTextArray(market.clobTokenIds)
  const outcomes = parseTextArray(market.outcomes)
  const yesIndex = Math.max(0, outcomes.findIndex((outcome) => /^yes$/i.test(outcome)))
  const yesTokenId = tokenIds[yesIndex] ?? tokenIds[0]
  if (!yesTokenId || market.enableOrderBook === false) return formatPolymarketMarketMicrostructure(market)

  const book = await fetchJson<PolymarketOrderBook>(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(yesTokenId)}`)
  const topBid = getTopBid(book)
  const topAsk = getTopAsk(book)
  const spread = typeof topBid?.price === 'number' && typeof topAsk?.price === 'number' ? topAsk.price - topBid.price : undefined
  const bidDepthOneCent = sumDepthNear(book.bids, topBid?.price, 'bid')
  const askDepthOneCent = sumDepthNear(book.asks, topAsk?.price, 'ask')
  const timestamp = book.timestamp && /^\d+$/.test(book.timestamp)
    ? new Date(Number(book.timestamp)).toISOString()
    : market.updatedAt
  const parts = [
    topBid ? `CLOB top bid ${formatProbabilityText(topBid.price)} for ${formatSize(topBid.size)} shares` : undefined,
    topAsk ? `top ask ${formatProbabilityText(topAsk.price)} for ${formatSize(topAsk.size)} shares` : undefined,
    typeof spread === 'number' && Number.isFinite(spread) ? `bid-ask spread ${(spread * 100).toFixed(2)} points` : undefined,
    typeof bidDepthOneCent === 'number' ? `bid depth within 1 point ${formatSize(bidDepthOneCent)} shares` : undefined,
    typeof askDepthOneCent === 'number' ? `ask depth within 1 point ${formatSize(askDepthOneCent)} shares` : undefined,
    typeof market.volume24hr === 'number' ? `24h volume $${market.volume24hr.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : undefined,
    typeof market.volume1wk === 'number' ? `1w volume $${market.volume1wk.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : undefined,
    timestamp ? `book/market timestamp ${timestamp}` : undefined,
  ].filter(Boolean)

  return parts.length ? `Order book: ${parts.join(', ')}.` : formatPolymarketMarketMicrostructure(market)
}

function getTopBid(book: PolymarketOrderBook) {
  return parseBookSide(book.bids).sort((left, right) => right.price - left.price)[0]
}

function getTopAsk(book: PolymarketOrderBook) {
  return parseBookSide(book.asks).sort((left, right) => left.price - right.price)[0]
}

function parseBookSide(side?: Array<{ price?: string; size?: string }>) {
  return (side ?? [])
    .map((level) => ({
      price: Number(level.price),
      size: Number(level.size),
    }))
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size))
}

function sumDepthNear(side: PolymarketOrderBook['bids'] | PolymarketOrderBook['asks'], topPrice: number | undefined, direction: 'bid' | 'ask') {
  if (typeof topPrice !== 'number') return undefined
  const levels = parseBookSide(side)
  const threshold = direction === 'bid' ? topPrice - 0.01 : topPrice + 0.01
  return levels
    .filter((level) => direction === 'bid' ? level.price >= threshold : level.price <= threshold)
    .reduce((sum, level) => sum + level.size, 0)
}

function formatSize(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: value >= 100 ? 0 : 2 })
}

function formatKalshiMarketMicrostructure(market: KalshiMarket) {
  const parts = [
    market.yes_bid_dollars ? `yes bid ${formatDollarProbability(market.yes_bid_dollars)}` : typeof market.yes_bid === 'number' ? `yes bid ${market.yes_bid}c` : undefined,
    market.yes_ask_dollars ? `yes ask ${formatDollarProbability(market.yes_ask_dollars)}` : typeof market.yes_ask === 'number' ? `yes ask ${market.yes_ask}c` : undefined,
    market.yes_bid_size_fp ? `bid size ${formatSize(Number(market.yes_bid_size_fp))} contracts` : undefined,
    market.yes_ask_size_fp ? `ask size ${formatSize(Number(market.yes_ask_size_fp))} contracts` : undefined,
    market.volume_24h_fp ? `24h volume ${formatSize(Number(market.volume_24h_fp))} contracts` : undefined,
    market.volume_fp ? `total volume ${formatSize(Number(market.volume_fp))} contracts` : undefined,
    market.open_interest_fp ? `open interest ${formatSize(Number(market.open_interest_fp))} contracts` : undefined,
    market.updated_time ? `updated ${market.updated_time}` : undefined,
    market.status ? `status ${market.status}` : undefined,
  ].filter(Boolean)

  const spread = getKalshiSpread(market)
  if (typeof spread === 'number') parts.splice(2, 0, `bid-ask spread ${(spread * 100).toFixed(1)} cents`)

  return parts.length ? `Order-book/microstructure: ${parts.join(', ')}.` : ''
}

async function getKalshiOrderBookSummary(market: KalshiMarket) {
  if (!market.ticker) return formatKalshiMarketMicrostructure(market)
  const book = await fetchJson<KalshiOrderBook>(`https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(market.ticker)}/orderbook`)
  const yesBids = parseKalshiBookSide(book.orderbook_fp?.yes_dollars)
  const noBids = parseKalshiBookSide(book.orderbook_fp?.no_dollars)
  const topYesBid = yesBids.sort((left, right) => right.price - left.price)[0]
  const topNoBid = noBids.sort((left, right) => right.price - left.price)[0]
  const impliedYesAsk = topNoBid ? 1 - topNoBid.price : parseDollarProbability(market.yes_ask_dollars)
  const yesBid = topYesBid?.price ?? parseDollarProbability(market.yes_bid_dollars)
  const spread = typeof yesBid === 'number' && typeof impliedYesAsk === 'number' ? impliedYesAsk - yesBid : getKalshiSpread(market)
  const bidDepth = sumKalshiDepthNear(yesBids, yesBid, 'bid')
  const askDepth = sumKalshiDepthNear(noBids, topNoBid?.price, 'no-bid-as-yes-ask')
  const parts = [
    typeof yesBid === 'number' ? `top yes bid ${formatProbabilityText(yesBid)}` : undefined,
    typeof impliedYesAsk === 'number' ? `implied yes ask ${formatProbabilityText(impliedYesAsk)}` : undefined,
    typeof spread === 'number' && Number.isFinite(spread) ? `bid-ask spread ${(spread * 100).toFixed(1)} cents` : undefined,
    typeof bidDepth === 'number' ? `yes bid depth within 1 cent ${formatSize(bidDepth)} contracts` : undefined,
    typeof askDepth === 'number' ? `yes ask depth within 1 cent ${formatSize(askDepth)} contracts` : undefined,
    market.volume_24h_fp ? `24h volume ${formatSize(Number(market.volume_24h_fp))} contracts` : undefined,
    market.volume_fp ? `total volume ${formatSize(Number(market.volume_fp))} contracts` : undefined,
    market.open_interest_fp ? `open interest ${formatSize(Number(market.open_interest_fp))} contracts` : undefined,
    market.updated_time ? `updated ${market.updated_time}` : undefined,
  ].filter(Boolean)

  return parts.length ? `Order book: ${parts.join(', ')}.` : formatKalshiMarketMicrostructure(market)
}

function parseKalshiBookSide(levels?: Array<[string, string]>) {
  return (levels ?? [])
    .map(([price, size]) => ({
      price: Number(price),
      size: Number(size),
    }))
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size))
}

function getKalshiSpread(market: KalshiMarket) {
  const bid = parseDollarProbability(market.yes_bid_dollars) ?? (typeof market.yes_bid === 'number' ? market.yes_bid / 100 : undefined)
  const ask = parseDollarProbability(market.yes_ask_dollars) ?? (typeof market.yes_ask === 'number' ? market.yes_ask / 100 : undefined)
  return typeof bid === 'number' && typeof ask === 'number' ? ask - bid : undefined
}

function parseDollarProbability(value?: string) {
  if (!value) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function formatDollarProbability(value: string) {
  const numeric = parseDollarProbability(value)
  return typeof numeric === 'number' ? formatProbabilityText(numeric) : value
}

function sumKalshiDepthNear(levels: Array<{ price: number; size: number }>, topPrice: number | undefined, direction: 'bid' | 'no-bid-as-yes-ask') {
  if (typeof topPrice !== 'number') return undefined
  const threshold = direction === 'bid' ? topPrice - 0.01 : topPrice - 0.01
  return levels
    .filter((level) => level.price >= threshold)
    .reduce((sum, level) => sum + level.size, 0)
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

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function collectJsonRecords(value: unknown, depth = 0): JsonRecord[] {
  if (!value || depth > 6) return []
  if (Array.isArray(value)) return value.flatMap((item) => collectJsonRecords(item, depth + 1))
  if (!isJsonRecord(value)) return []
  return [value, ...Object.values(value).flatMap((item) => collectJsonRecords(item, depth + 1))]
}

function firstJsonRecord(value: unknown): JsonRecord | undefined {
  if (Array.isArray(value)) return value.map(firstJsonRecord).find(Boolean)
  return isJsonRecord(value) ? value : undefined
}

function stringFromRecord(record: JsonRecord | undefined, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function formatProbabilityText(value: string | number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return numeric <= 1 ? `${Math.round(numeric * 100)}%` : `${Math.round(numeric)}%`
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

async function fetchKalshiMarketsFromLinks(links?: string[]) {
  const kalshiLinks = (links ?? []).map(parseKalshiUrl).filter((item): item is KalshiUrlParts => Boolean(item?.seriesTicker))
  const results = await Promise.allSettled(kalshiLinks.map(fetchKalshiMarketsFromUrlParts))
  const markets = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  return { markets: dedupeKalshiMarkets(markets) }
}

async function fetchKalshiMarketsFromUrlParts(parts: KalshiUrlParts): Promise<KalshiMarket[]> {
  const directMarket = parts.marketTicker
    ? await fetchJson<{ market?: KalshiMarket }>(`https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(parts.marketTicker)}`)
      .then((payload) => payload.market ? [payload.market] : [])
      .catch(() => [])
    : []
  if (directMarket.length) return directMarket

  const payload = await fetchJson<KalshiMarketsResponse>(
    `https://external-api.kalshi.com/trade-api/v2/markets?limit=100&series_ticker=${encodeURIComponent(parts.seriesTicker)}`,
  ).catch(() => ({ markets: [] }))
  const markets = payload.markets ?? []
  return parts.eventTicker ? markets.filter((market) => market.event_ticker === parts.eventTicker) : markets
}

type KalshiUrlParts = {
  seriesTicker: string
  eventTicker?: string
  marketTicker?: string
}

function parseKalshiUrl(value: string): KalshiUrlParts | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (!url.hostname.replace(/^www\./, '').endsWith('kalshi.com')) return undefined
  const segments = url.pathname.split('/').filter(Boolean)
  const marketIndex = segments.indexOf('markets')
  const seriesTicker = marketIndex >= 0 ? segments[marketIndex + 1]?.toUpperCase() : undefined
  if (!seriesTicker) return undefined
  const tailTicker = segments.at(-1)?.toUpperCase()
  return {
    seriesTicker,
    eventTicker: tailTicker && tailTicker !== seriesTicker ? tailTicker : undefined,
    marketTicker: tailTicker && tailTicker.split('-').length >= 3 ? tailTicker : undefined,
  }
}

function getKalshiMarketText(market: KalshiMarket) {
  return [
    market.title,
    market.subtitle,
    market.yes_sub_title,
    market.rules_primary,
    market.rules_secondary,
    market.ticker,
    market.event_ticker,
  ].filter(Boolean).join(' ')
}

async function fetchManifoldMarkets(queries: string[]) {
  const results = await Promise.allSettled(
    queries.map((search) =>
      fetchJson<ManifoldMarket[]>(`https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(search)}&limit=12`).catch(() => []),
    ),
  )

  return dedupeByQuestion(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])))
}

async function fetchManifoldMarketsFromLinks(links?: string[]) {
  const manifoldLinks = (links ?? []).map(parseManifoldUrl).filter((item): item is ManifoldUrlParts => Boolean(item?.slug))
  const results = await Promise.allSettled(manifoldLinks.map(fetchManifoldMarketFromUrlParts))
  return dedupeByQuestion(results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : [])), getManifoldKey)
}

type ManifoldUrlParts = {
  slug: string
  sourceUrl: string
}

function parseManifoldUrl(value: string): ManifoldUrlParts | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (!url.hostname.replace(/^www\./, '').endsWith('manifold.markets')) return undefined
  const segments = url.pathname.split('/').filter(Boolean)
  const slug = segments.at(-1)
  return slug ? { slug, sourceUrl: url.toString() } : undefined
}

async function fetchManifoldMarketFromUrlParts(parts: ManifoldUrlParts): Promise<ManifoldMarket | undefined> {
  const market = await fetchJson<ManifoldMarket>(`https://api.manifold.markets/v0/slug/${encodeURIComponent(parts.slug)}`).catch(() => undefined)
  if (!market?.question) return undefined
  return {
    ...market,
    slug: parts.slug,
    sourceUrl: parts.sourceUrl,
  }
}

function getManifoldKey(market: ManifoldMarket) {
  return market.url ?? market.slug ?? market.question
}

function getManifoldMarketText(market: ManifoldMarket) {
  return [
    market.question,
    market.slug,
    market.textDescription,
    extractRichText(market.description),
    market.answers?.map((answer) => answer.text ?? answer.name).filter(Boolean).join(' '),
  ].filter(Boolean).join(' ')
}

function isManifoldMultiOutcomeMarket(market: ManifoldMarket) {
  return market.outcomeType === 'MULTIPLE_CHOICE' || (market.answers?.length ?? 0) > 2
}

function isManifoldNumericMarket(market: ManifoldMarket) {
  return ['PSEUDO_NUMERIC', 'NUMERIC', 'DATE'].includes(market.outcomeType ?? '')
}

function formatManifoldMarketMicrostructure(market: ManifoldMarket) {
  const parts = [
    typeof market.volume24Hours === 'number' ? `24h volume ${formatSize(market.volume24Hours)} mana` : undefined,
    typeof market.volume === 'number' ? `total volume ${formatSize(market.volume)} mana` : undefined,
    typeof market.uniqueBettorCount === 'number' ? `${market.uniqueBettorCount} unique bettors` : undefined,
    market.lastBetTime ? `last bet ${formatManifoldTime(market.lastBetTime)}` : undefined,
    market.lastUpdatedTime ? `updated ${formatManifoldTime(market.lastUpdatedTime)}` : undefined,
    market.mechanism ? `mechanism ${market.mechanism}` : undefined,
    market.outcomeType ? `outcome type ${market.outcomeType}` : undefined,
    market.pool ? `pool ${formatManifoldPool(market.pool)}` : undefined,
  ].filter(Boolean)

  return parts.length ? `Activity/microstructure: ${parts.join(', ')}.` : ''
}

async function getManifoldActivitySummary(market: ManifoldMarket) {
  const base = formatManifoldMarketMicrostructure(market)
  if (!market.id) return base
  const bets = await fetchJson<ManifoldBet[]>(`https://api.manifold.markets/v0/bets?contractId=${encodeURIComponent(market.id)}&limit=5`).catch(() => [])
  const filled = bets.filter((bet) => bet.isFilled !== false && !bet.isCancelled)
  const latest = filled[0] ?? bets[0]
  const recentMove = latest && typeof latest.probBefore === 'number' && typeof latest.probAfter === 'number'
    ? `latest public bet moved probability ${formatProbabilityText(latest.probBefore)} -> ${formatProbabilityText(latest.probAfter)} on ${formatManifoldTime(latest.createdTime)}`
    : undefined
  const openOrders = bets.filter((bet) => bet.isFilled === false && !bet.isCancelled && typeof bet.limitProb === 'number')
    .slice(0, 3)
    .map((bet) => `${bet.outcome ?? 'order'} limit ${formatProbabilityText(bet.limitProb ?? 0)} amount ${formatSize(Math.abs(bet.orderAmount ?? bet.amount ?? 0))}`)
  const parts = [
    base.replace(/\.$/, ''),
    recentMove,
    openOrders.length ? `visible open/recent limit orders: ${openOrders.join('; ')}` : undefined,
  ].filter(Boolean)

  return parts.length ? `${parts.join('. ')}.` : ''
}

function formatManifoldPool(pool: Record<string, number>) {
  return Object.entries(pool)
    .map(([key, value]) => `${key} ${formatSize(value)}`)
    .slice(0, 4)
    .join(', ')
}

function formatManifoldTime(value?: number) {
  if (!value) return undefined
  const ms = value > 10_000_000_000 ? value : value * 1000
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

function formatManifoldAnswers(market: ManifoldMarket) {
  const answers = market.answers
    ?.map((answer) => {
      const title = answer.text ?? answer.name
      const probability = typeof answer.probability === 'number' ? `${Math.round(answer.probability * 100)}%` : undefined
      return title ? [title, probability].filter(Boolean).join(' ') : undefined
    })
    .filter((item): item is string => Boolean(item))
    .filter((item) => !isPlaceholderMarketText(item))
    .slice(0, 8)
  return answers?.length ? ` Outcomes: ${answers.join(', ')}.` : ''
}

function formatManifoldResolutionText(market: ManifoldMarket) {
  const text = compactOneLine(market.textDescription ?? extractRichText(market.description), 900)
  if (!text) return ''

  return ` Resolution/description from Manifold API: ${text}`
}

function extractRichText(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractRichText).filter(Boolean).join(' ')
  if (typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const ownText = typeof record.text === 'string' ? record.text : ''
  const children = extractRichText(record.content)
  return [ownText, children].filter(Boolean).join(' ')
}

function compactOneLine(value: string | undefined, maxLength: number) {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
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

function getDirectMarketPriority<T>(market: T, directKeys: Set<string>, getKey: (item: T) => string | undefined) {
  return directKeys.has(getKey(market) ?? '') ? 1 : 0
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
  const conditional = /\b(if|when|before|after|conditional|depends|given|provided|assuming)\b/.test(normalizedMarket)
  if (!conditional) return false

  const caseTerms = new Set(getSearchTerms(caseQuestion).map(normalizeSearchText))
  const marketTerms = getSearchTerms(marketQuestion)
    .map(normalizeSearchText)
    .filter((term) => term.length > 2)
  const genericTerms = new Set(['will', 'resolve', 'yes', 'market', 'question', 'before', 'after', 'when', 'if', 'end', 'year'])
  const extraTerms = marketTerms.filter((term) => !caseTerms.has(term) && !genericTerms.has(term))
  const sharedTerms = marketTerms.filter((term) => caseTerms.has(term))

  return sharedTerms.length >= 2 && extraTerms.length >= 1
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
