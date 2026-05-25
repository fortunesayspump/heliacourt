type JsonRecord = Record<string, unknown>
export type MarketPreview = {
  title?: string
  image?: string
  description?: string
  rules?: string
  endDate?: string
  market?: 'Polymarket' | 'Kalshi' | 'Manifold'
  contracts?: MarketPreviewContract[]
  multipleContracts?: boolean
}

export type MarketPreviewContract = {
  title: string
  ticker?: string
  price?: string
  horizon?: string
  rules?: string
}

const marketImageTimeoutMs = Number(process.env.MARKET_IMAGE_TIMEOUT_MS ?? 8000)
const marketImageRetries = Number(process.env.MARKET_IMAGE_RETRIES ?? 2)
const marketPreviewCacheVersion = 'event-bundles-v5'
const imageCache = new Map<string, Promise<string | undefined>>()
const previewCache = new Map<string, Promise<MarketPreview | undefined>>()

export async function resolveMarketImageUrl(links?: string[], title?: string): Promise<string | undefined> {
  const marketPreview = await resolveMarketPreview(links, title)
  if (marketPreview?.image) return marketPreview.image
  const target = links?.map(parseHttpUrl).find((url) => url && isSupportedMarketHost(url))
  return target ? (await resolveOpenGraphPreview(target))?.image : undefined
}

export async function resolveOpenGraphPreview(url: string | URL): Promise<MarketPreview | undefined> {
  const target = typeof url === 'string' ? parseHttpUrl(url) : url
  if (!target) return undefined
  return await readPagePreview(target)
}

export async function resolveMarketPreview(links?: string[], title?: string): Promise<MarketPreview | undefined> {
  const target = links?.map(parseHttpUrl).find((url) => url && isSupportedMarketHost(url))
  if (!target) return undefined

  const cacheKey = `${marketPreviewCacheVersion}:preview:${target.hostname}:${target.pathname}:${title ?? ''}`
  const existing = previewCache.get(cacheKey)
  if (existing) return await existing

  const promise = resolveMarketPreviewForUrl(target, title).catch(() => undefined)
  previewCache.set(cacheKey, promise)
  imageCache.set(cacheKey, promise.then((preview) => preview?.image))
  return await promise
}

async function resolveMarketPreviewForUrl(target: URL, title?: string): Promise<MarketPreview | undefined> {
  if (target.hostname.includes('polymarket.com')) {
    return withMarket(await resolvePolymarketPreview(target), 'Polymarket')
  }
  if (target.hostname.includes('kalshi.com')) {
    return withMarket(await resolveKalshiPreview(target, title), 'Kalshi')
  }
  if (target.hostname.includes('manifold.markets')) {
    return withMarket(await resolveManifoldPreview(target, title), 'Manifold')
  }
  return undefined
}

async function resolvePolymarketPreview(target: URL) {
  const segments = target.pathname.split('/').filter(Boolean)
  const eventIndex = segments.indexOf('event')
  const eventSlug = eventIndex >= 0 ? segments[eventIndex + 1] : segments[0]
  const marketSlug = eventIndex >= 0 ? segments[eventIndex + 2] : segments.at(-1)

  if (marketSlug) {
    const marketPreview = findPreview(await fetchJson(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(marketSlug)}`), target)
    if (marketPreview?.image || marketPreview?.title) return marketPreview
  }

  if (eventSlug) {
    const eventData = await fetchJson(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug)}`)
    const exactMarket = marketSlug ? findRecordBySlug(eventData, marketSlug) : undefined
    if (!exactMarket) {
      const eventPreview = buildPolymarketEventPreview(eventData, target)
      if (eventPreview?.title) return eventPreview
    }
    const preview = findPreview(exactMarket ?? eventData, target)
    if (preview?.image || preview?.title) return preview
  }

  const image = await readPageImage(target)
  return image ? { image } : undefined
}

async function resolveKalshiPreview(target: URL, title?: string) {
  const segments = target.pathname.split('/').filter(Boolean)
  const marketIndex = segments.indexOf('markets')
  const seriesTicker = marketIndex >= 0 ? segments[marketIndex + 1]?.toUpperCase() : undefined
  const eventTicker = marketIndex >= 0 ? segments.at(-1)?.toUpperCase() : undefined
  const directMarketTicker = eventTicker && eventTicker !== seriesTicker && eventTicker.split('-').length >= 3 ? eventTicker : undefined

  if (directMarketTicker) {
    const directMarket = findPreview(await fetchJson(`https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(directMarketTicker)}`), target)
    if (directMarket?.title) return directMarket
  }

  if (seriesTicker) {
    const [seriesPayload, marketPayload] = await Promise.all([
      fetchJson(`https://external-api.kalshi.com/trade-api/v2/series/${encodeURIComponent(seriesTicker)}`),
      fetchJson(`https://external-api.kalshi.com/trade-api/v2/markets?limit=100&series_ticker=${encodeURIComponent(seriesTicker)}`),
    ])
    const markets = getKalshiMarkets(marketPayload)
    const eventMarkets = eventTicker ? markets.filter((market) => stringValue(market.event_ticker)?.toUpperCase() === eventTicker) : markets
    const selectedMarket = pickKalshiMarket(eventMarkets.length ? eventMarkets : markets, title)
    const preview = buildKalshiPreview(seriesPayload, selectedMarket, eventMarkets, Boolean(directMarketTicker))
    if (preview?.title) return preview
  }

  if (title) {
    const searchPayload = await fetchJson(`https://external-api.kalshi.com/trade-api/v2/markets?limit=8&search=${encodeURIComponent(title)}`)
    const searchMarket = pickKalshiMarket(getKalshiMarkets(searchPayload).filter((market) => kalshiTextMatchesTitle(market, title)), title)
    const preview = buildKalshiPreview(undefined, searchMarket, searchMarket ? [searchMarket] : [], true)
    if (preview?.title) return preview
  }

  return await readPagePreview(target)
}

async function resolveManifoldPreview(target: URL, title?: string) {
  const segments = target.pathname.split('/').filter(Boolean)
  const slug = segments.at(-1)
  const candidates = [
    slug ? `https://api.manifold.markets/v0/slug/${encodeURIComponent(slug)}` : '',
    title ? `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(title)}&limit=8` : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const payload = await fetchJson(candidate)
    const preview = withManifoldContracts(findPreview(payload, target), payload)
    if (preview?.image || preview?.title) return preview
  }

  const image = await readPageImage(target)
  return image ? { image } : undefined
}

async function fetchJson(url: string) {
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'HeliaCourtBot/1.0 (+https://heliacourt.xyz)',
      },
    })
    if (!response.ok) return undefined
    return await response.json() as unknown
  } catch {
    return undefined
  }
}

async function readPageImage(target: URL) {
  return (await readPagePreview(target))?.image
}

async function readPagePreview(target: URL) {
  try {
    const response = await fetchWithRetry(target, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'HeliaCourtBot/1.0 (+https://heliacourt.xyz)',
      },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) return undefined
    const html = await response.text()
    return {
      title: readMeta(html, 'og:title') ?? readMeta(html, 'twitter:title') ?? decodeHtml(readTitle(html)),
      description: readMeta(html, 'description') ?? readMeta(html, 'og:description') ?? readMeta(html, 'twitter:description'),
      image: absolutizeUrl(readMeta(html, 'og:image') ?? readMeta(html, 'twitter:image'), target),
    }
  } catch {
    return undefined
  }
}

async function fetchWithRetry(input: string | URL, init: RequestInit) {
  let lastError: unknown

  for (let attempt = 0; attempt <= marketImageRetries; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(marketImageTimeoutMs),
      })
      if (response.ok || response.status < 500 || attempt === marketImageRetries) return response
    } catch (error) {
      lastError = error
      if (attempt === marketImageRetries) throw error
    }

    await wait(180 * (attempt + 1))
  }

  throw lastError
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findImageUrl(value: unknown, base: URL, depth = 0): string | undefined {
  if (!value || depth > 5) return undefined

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = findImageUrl(item, base, depth + 1)
      if (image) return image
    }
    return undefined
  }

  if (typeof value !== 'object') return undefined

  const record = value as JsonRecord
  const preferredKeys = [
    'image',
    'imageUrl',
    'image_url',
    'icon',
    'iconUrl',
    'icon_url',
    'coverImage',
    'coverImageUrl',
    'thumbnail',
    'thumbnailUrl',
    'creatorAvatarUrl',
  ]

  for (const key of preferredKeys) {
    const image = typeof record[key] === 'string' ? absolutizeUrl(record[key], base) : undefined
    if (image) return image
  }

  for (const nested of Object.values(record)) {
    const image = findImageUrl(nested, base, depth + 1)
    if (image) return image
  }

  return undefined
}

function findPreview(value: unknown, base: URL): MarketPreview | undefined {
  const item = firstRecord(value)
  if (!item) return undefined
  return {
    title: findTitle(item),
    image: findImageUrl(item, base),
    description: findDescription(item),
    rules: findRules(item),
    endDate: findEndDate(item),
  }
}

function buildPolymarketEventPreview(value: unknown, base: URL): MarketPreview | undefined {
  const eventRecord = firstRecord(value)
  const contracts = collectRecords(value)
    .filter((record) => record !== eventRecord)
    .filter((record) => typeof record.question === 'string' || typeof record.outcomePrices === 'string' || Array.isArray(record.outcomePrices))
    .map(formatPolymarketContract)
    .filter((item): item is MarketPreviewContract => Boolean(item))
    .filter((item) => !isPlaceholderContractTitle(item.title))
    .filter(uniqueContract)
    .slice(0, 12)

  if (contracts.length <= 1) return undefined

  const horizons = uniqueStrings(contracts.map((item) => item.horizon).filter(Boolean) as string[])
  return {
    title: findTitle(eventRecord ?? {}) ?? deriveCommonQuestion(contracts) ?? contracts[0]?.title,
    image: findImageUrl(eventRecord, base) ?? findImageUrl(value, base),
    description: [
      findDescription(eventRecord ?? {}) ? `Description: ${findDescription(eventRecord ?? {})}` : undefined,
      `This Polymarket event contains ${contracts.length} tradable markets/outcomes. File it as one event-level case; the market list below is preserved for agent debate.`,
      `Event markets:\n${contracts.map((contract) => [contract.title, contract.price, contract.horizon ? `horizon ${contract.horizon}` : undefined].filter(Boolean).join(' - ')).join('\n')}`,
    ].filter(Boolean).join('\n\n'),
    endDate: horizons.length ? `Multiple Polymarket horizons: ${horizons.join('; ')}` : undefined,
    contracts,
    multipleContracts: true,
  }
}

function formatPolymarketContract(record: JsonRecord): MarketPreviewContract | undefined {
  const title = findTitle(record)
  if (!title) return undefined
  return {
    title,
    ticker: stringValue(record.slug) ?? stringValue(record.conditionId),
    price: formatOutcomePrices(record),
    horizon: formatMarketDate(stringValue(record.endDate) ?? stringValue(record.endDateIso) ?? stringValue(record.closedTime)),
    rules: findDescription(record) ?? findRules(record),
  }
}

function withManifoldContracts(preview: MarketPreview | undefined, value: unknown): MarketPreview | undefined {
  if (!preview || !isJsonRecord(value)) return preview
  const answers = Array.isArray(value.answers) ? value.answers.filter(isJsonRecord) : []
  const contracts = answers
    .map((answer): MarketPreviewContract | undefined => {
      const title = stringValue(answer.text) ?? stringValue(answer.name) ?? stringValue(answer.number) ?? (typeof answer.number === 'number' ? String(answer.number) : undefined)
      if (!title) return undefined
      const probability = typeof answer.probability === 'number' ? `${Math.round(answer.probability * 100)}%` : undefined
      return {
        title,
        ticker: stringValue(answer.id),
        price: probability,
        horizon: formatMarketDate(value.closeTime ?? value.close_time),
      }
    })
    .filter((item): item is MarketPreviewContract => Boolean(item))
    .filter((item) => !isPlaceholderContractTitle(item.title))
    .filter(uniqueContract)

  if (contracts.length <= 1) return preview
  return {
    ...preview,
    description: [
      preview.description,
      `This Manifold market contains ${contracts.length} answer outcomes. File it as one event-level case; the answer list below is preserved for agent debate.`,
    ].filter(Boolean).join('\n\n'),
    contracts,
    multipleContracts: true,
  }
}

function collectRecords(value: unknown, depth = 0): JsonRecord[] {
  if (!value || depth > 6) return []
  if (Array.isArray(value)) return value.flatMap((item) => collectRecords(item, depth + 1))
  if (!isJsonRecord(value)) return []
  return [value, ...Object.values(value).flatMap((item) => collectRecords(item, depth + 1))]
}

function getKalshiMarkets(value: unknown) {
  if (!value || typeof value !== 'object') return []
  const record = value as JsonRecord
  return Array.isArray(record.markets) ? record.markets.filter(isJsonRecord) : []
}

function buildKalshiPreview(seriesPayload: unknown, market: JsonRecord | undefined, eventMarkets: JsonRecord[], exactMarket: boolean): MarketPreview | undefined {
  const series = isJsonRecord((seriesPayload as JsonRecord | undefined)?.series) ? (seriesPayload as JsonRecord).series as JsonRecord : undefined
  const ambiguousEvent = !exactMarket && eventMarkets.length > 1
  const marketRules = [stringValue(market?.rules_primary), stringValue(market?.rules_secondary)].filter(Boolean).join('\n\n') || undefined
  const contracts = (eventMarkets.length ? eventMarkets : market ? [market] : [])
    .map(formatKalshiContract)
    .filter((item): item is MarketPreviewContract => Boolean(item))
    .filter((item) => !isPlaceholderContractTitle(item.title))
  const relatedMarkets = contracts
    .map((item) => [item.title, item.price ? `last ${item.price}` : undefined, item.horizon ? `horizon ${item.horizon}` : undefined].filter(Boolean).join(' - '))
    .filter(Boolean)
    .slice(0, 6)
  const relatedHorizons = contracts
    .map((item) => item.horizon)
    .filter((value, index, values): value is string => Boolean(value && values.indexOf(value) === index))
    .slice(0, 6)

  const description = [
    stringValue(series?.title) ? `Series: ${stringValue(series?.title)}` : undefined,
    stringValue(series?.category) ? `Category: ${stringValue(series?.category)}` : undefined,
    ambiguousEvent ? `This Kalshi event contains ${contracts.length} tradable contracts. File it as one event-level case; the contract horizons are preserved below.` : undefined,
    relatedMarkets.length ? `Event contracts:\n${relatedMarkets.join('\n')}` : undefined,
  ].filter(Boolean).join('\n\n') || undefined
  const previewTitle = ambiguousEvent ? deriveKalshiEventQuestion(contracts) ?? stringValue(series?.title) : stringValue(market?.title) ?? stringValue(series?.title)
  const category = stringValue(series?.category)

  return {
    title: previewTitle,
    description,
    rules: ambiguousEvent ? undefined : marketRules,
    endDate: ambiguousEvent
      ? relatedHorizons.length ? `Multiple Kalshi contract horizons: ${relatedHorizons.join('; ')}` : undefined
      : stringValue(market?.close_time) ?? stringValue(market?.expected_expiration_time) ?? stringValue(series?.last_updated_ts),
    image: findImageUrl(seriesPayload, new URL('https://kalshi.com')) ?? findImageUrl(market, new URL('https://kalshi.com')) ?? buildKalshiCardImage({
      title: previewTitle ?? stringValue(series?.title) ?? 'Kalshi market',
      category,
      contracts,
    }),
    contracts: contracts.length ? contracts : undefined,
    multipleContracts: ambiguousEvent,
  }
}

function buildKalshiCardImage({ title, category, contracts }: { title: string; category?: string; contracts: MarketPreviewContract[] }) {
  const subtitle = category ? `${category} event` : 'Kalshi event'
  const contractLine = contracts.length > 1
    ? `${contracts.length} contracts preserved`
    : contracts[0]?.price ? `Last ${contracts[0].price}` : 'Market details preserved'
  const safeTitle = escapeSvg(truncateForSvg(title, 92))
  const safeSubtitle = escapeSvg(subtitle)
  const safeContractLine = escapeSvg(contractLine)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${safeTitle}"><rect width="1200" height="630" fill="#151515"/><rect x="54" y="54" width="1092" height="522" rx="34" fill="#f4f0e6"/><rect x="86" y="86" width="1028" height="458" rx="26" fill="#ffffff"/><circle cx="158" cy="148" r="28" fill="#1f5f4a"/><path d="M146 147h24M158 135v25M149 159c10 9 22 9 32 0" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none"/><text x="210" y="158" fill="#1d211f" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">Kalshi</text><text x="88" y="255" fill="#6f6a60" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="2">${safeSubtitle.toUpperCase()}</text><foreignObject x="86" y="284" width="1010" height="164"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; color: #161616; font-size: 56px; line-height: 1.08; font-weight: 800; letter-spacing: 0; overflow: hidden;">${safeTitle}</div></foreignObject><rect x="88" y="474" width="420" height="46" rx="23" fill="#e7f2ea"/><text x="116" y="506" fill="#1f5f4a" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700">${safeContractLine}</text><text x="886" y="506" fill="#6f6a60" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">helia court</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function truncateForSvg(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatKalshiContract(value: JsonRecord): MarketPreviewContract | undefined {
  const title = stringValue(value.title) ?? stringValue(value.yes_sub_title) ?? stringValue(value.ticker)
  if (!title) return undefined
  const horizon = formatKalshiHorizon(stringValue(value.close_time) ?? stringValue(value.expected_expiration_time))
  const rules = [stringValue(value.rules_primary), stringValue(value.rules_secondary)].filter(Boolean).join('\n\n') || undefined
  return {
    title,
    ticker: stringValue(value.ticker),
    price: stringValue(value.last_price_dollars) ?? stringValue(value.yes_bid_dollars),
    horizon,
    rules,
  }
}

function formatKalshiHorizon(value?: string) {
  return formatMarketDate(value)
}

function formatMarketDate(value?: unknown) {
  if (!value) return undefined
  const rawValue = typeof value === 'string' || typeof value === 'number' ? value : String(value)
  const numericValue = Number(rawValue)
  const dateValue = Number.isFinite(numericValue) && String(rawValue).trim() !== ''
    ? numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000
    : rawValue
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return String(rawValue)
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(date)
}

function deriveKalshiEventQuestion(contracts: MarketPreviewContract[]) {
  const titles = contracts.map((item) => item.title).filter(Boolean)
  if (!titles.length) return undefined
  const stripped = titles
    .map((title) => title.replace(/\s+by\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\??$/i, '?'))
    .map((title) => title.replace(/\s+before\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\??$/i, '?'))
  const [first] = stripped
  return first && stripped.every((title) => title === first) ? first : undefined
}

function deriveCommonQuestion(contracts: MarketPreviewContract[]) {
  const titles = contracts.map((item) => item.title)
  const stripped = titles
    .map((title) => title.replace(/\s+by\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\??$/i, '?'))
    .map((title) => title.replace(/\s+(?:yes|no)\s*$/i, '').trim())
  const [first] = stripped
  return first && stripped.every((title) => title === first) ? first : undefined
}

function formatOutcomePrices(record: JsonRecord) {
  const outcomes = parseJsonArray(record.outcomes).map(String)
  const prices = parseJsonArray(record.outcomePrices)
  if (!prices.length) return stringValue(record.lastTradePrice) ?? stringValue(record.bestBid) ?? stringValue(record.bestAsk)
  return prices
    .map((price, index) => {
      const numericPrice = typeof price === 'number' ? price : Number(price)
      const formattedPrice = Number.isFinite(numericPrice) ? `${Math.round(numericPrice * 100)}%` : String(price)
      return outcomes[index] ? `${outcomes[index]} ${formattedPrice}` : formattedPrice
    })
    .join(', ')
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function uniqueContract(contract: MarketPreviewContract, index: number, contracts: MarketPreviewContract[]) {
  const key = `${contract.ticker ?? ''}:${contract.title}`
  return contracts.findIndex((item) => `${item.ticker ?? ''}:${item.title}` === key) === index
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function isPlaceholderContractTitle(title: string) {
  const normalized = normalizeWords(title)
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

function pickKalshiMarket(markets: JsonRecord[], title?: string) {
  if (!markets.length) return undefined
  const query = title ? normalizeWords(title) : ''
  return [...markets].sort((left, right) => {
    const scoreLeft = scoreKalshiMarket(left, query)
    const scoreRight = scoreKalshiMarket(right, query)
    if (scoreRight !== scoreLeft) return scoreRight - scoreLeft
    return String(right.close_time ?? '').localeCompare(String(left.close_time ?? ''))
  })[0]
}

function scoreKalshiMarket(market: JsonRecord, query: string) {
  const text = normalizeWords(`${stringValue(market.title) ?? ''} ${stringValue(market.yes_sub_title) ?? ''} ${stringValue(market.rules_primary) ?? ''}`)
  const terms = query.split(' ').filter((term) => term.length >= 4)
  const overlap = terms.filter((term) => text.includes(term)).length
  const priceBonus = stringValue(market.last_price_dollars) ? 2 : 0
  const statusBonus = stringValue(market.status) === 'active' ? 1 : 0
  return overlap * 5 + priceBonus + statusBonus
}

function kalshiTextMatchesTitle(market: JsonRecord, title: string) {
  const queryTerms = normalizeWords(title).split(' ').filter((term) => term.length >= 4)
  if (!queryTerms.length) return false
  const text = normalizeWords(`${stringValue(market.title) ?? ''} ${stringValue(market.subtitle) ?? ''} ${stringValue(market.rules_primary) ?? ''}`)
  const overlap = queryTerms.filter((term) => text.includes(term)).length
  return overlap >= Math.min(3, queryTerms.length)
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function firstRecord(value: unknown): JsonRecord | undefined {
  if (Array.isArray(value)) return value.map(firstRecord).find(Boolean)
  if (!value || typeof value !== 'object') return undefined

  const record = value as JsonRecord
  if (findTitle(record) || findImageUrl(record, new URL('https://example.com'))) return record

  for (const nested of Object.values(record)) {
    const match = firstRecord(nested)
    if (match) return match
  }
  return record
}

function findRecordBySlug(value: unknown, slug: string): JsonRecord | undefined {
  return findRecordBySlugMode(value, slug, 'exact') ?? findRecordBySlugMode(value, slug, 'loose')
}

function findRecordBySlugMode(value: unknown, slug: string, mode: 'exact' | 'loose'): JsonRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRecordBySlugMode(item, slug, mode)
      if (match) return match
    }
    return undefined
  }
  if (!value || typeof value !== 'object') return undefined

  const record = value as JsonRecord
  for (const nested of Object.values(record)) {
    const match = findRecordBySlugMode(nested, slug, mode)
    if (match) return match
  }
  if (typeof record.slug === 'string' && slugsMatch(record.slug, slug, mode)) return record
  return undefined
}

function slugsMatch(left: string, right: string, mode: 'exact' | 'loose') {
  if (left === right) return true
  const clean = (value: string) => value.replace(/^(?:(?:will|when)-)+/i, '').replace(/-/g, ' ')
  if (clean(left) === clean(right)) return true
  return mode === 'loose' && (clean(left).includes(clean(right)) || clean(right).includes(clean(left)))
}

function findTitle(record: JsonRecord) {
  for (const key of ['question', 'title', 'name', 'subtitle']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function findDescription(record: JsonRecord) {
  return findString(record, [
    'description',
    'textDescription',
    'longDescription',
    'eventDescription',
    'short_description',
    'subtitle',
  ])
}

function findRules(record: JsonRecord) {
  return findString(record, [
    'rules',
    'resolutionRules',
    'resolution_rules',
    'rulesPrimary',
    'rules_primary',
    'rules_secondary',
    'resolutionSource',
    'resolution_source',
  ])
}

function findEndDate(record: JsonRecord) {
  return findDateString(record, [
    'endDate',
    'end_date',
    'closeTime',
    'close_time',
    'expectedExpirationTime',
    'expected_expiration_time',
    'expirationTime',
    'expiration_time',
    'latest_expiration_time',
  ])
}

function findDateString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number') {
      const timestamp = value > 1_000_000_000_000 ? value : value * 1000
      const date = new Date(timestamp)
      if (!Number.isNaN(date.getTime())) return date.toISOString()
    }
    const text = stringifyMarketText(value)
    if (text) return text
  }
  return undefined
}

function findString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    const text = stringifyMarketText(value)
    if (text) return text
  }
  return undefined
}

function stringifyMarketText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object') return undefined

  const record = value as JsonRecord
  if (typeof record.text === 'string' && record.text.trim()) return record.text.trim()
  if (Array.isArray(record.content)) {
    return record.content
      .map(stringifyMarketText)
      .filter(Boolean)
      .join('\n')
      .trim() || undefined
  }
  return undefined
}

function withMarket(preview: MarketPreview | undefined, market: MarketPreview['market']) {
  return preview ? { ...preview, market } : undefined
}

function parseHttpUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url : undefined
  } catch {
    return undefined
  }
}

function isSupportedMarketHost(url: URL) {
  return ['polymarket.com', 'kalshi.com', 'manifold.markets'].some((host) => url.hostname.includes(host))
}

function readMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const propertyPattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
  const contentFirstPattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  return decodeHtml(propertyPattern.exec(html)?.[1] ?? contentFirstPattern.exec(html)?.[1])
}

function readTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
}

function decodeHtml(value?: string) {
  return value
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function absolutizeUrl(value: unknown, base: URL) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const image = new URL(value, base)
    if (!['http:', 'https:'].includes(image.protocol)) return undefined
    return image.toString()
  } catch {
    return undefined
  }
}
