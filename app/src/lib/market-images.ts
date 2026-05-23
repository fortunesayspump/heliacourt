type JsonRecord = Record<string, unknown>
type MarketPreview = {
  title?: string
  image?: string
}

const marketImageTimeoutMs = Number(process.env.MARKET_IMAGE_TIMEOUT_MS ?? 2500)
const imageCache = new Map<string, Promise<string | undefined>>()
const previewCache = new Map<string, Promise<MarketPreview | undefined>>()

export async function resolveMarketImageUrl(links?: string[], title?: string): Promise<string | undefined> {
  return (await resolveMarketPreview(links, title))?.image
}

export async function resolveMarketPreview(links?: string[], title?: string): Promise<MarketPreview | undefined> {
  const target = links?.map(parseHttpUrl).find((url) => url && isSupportedMarketHost(url))
  if (!target) return undefined

  const cacheKey = `preview:${target.hostname}:${target.pathname}:${title ?? ''}`
  const existing = previewCache.get(cacheKey)
  if (existing) return await existing

  const promise = resolveMarketPreviewForUrl(target, title).catch(() => undefined)
  previewCache.set(cacheKey, promise)
  imageCache.set(cacheKey, promise.then((preview) => preview?.image))
  return await promise
}

async function resolveMarketPreviewForUrl(target: URL, title?: string): Promise<MarketPreview | undefined> {
  if (target.hostname.includes('polymarket.com')) {
    return await resolvePolymarketPreview(target)
  }
  if (target.hostname.includes('kalshi.com')) {
    return await resolveKalshiPreview(target, title)
  }
  if (target.hostname.includes('manifold.markets')) {
    return await resolveManifoldPreview(target, title)
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
    const preview = findPreview(exactMarket ?? eventData, target)
    if (preview?.image || preview?.title) return preview
  }

  const image = await readPageImage(target)
  return image ? { image } : undefined
}

async function resolveKalshiPreview(target: URL, title?: string) {
  const segments = target.pathname.split('/').filter(Boolean)
  const marketIndex = segments.indexOf('markets')
  const ticker = marketIndex >= 0 ? segments[marketIndex + 1] : undefined
  const search = title ?? target.pathname.split('-').join(' ')
  const candidates = [
    ticker ? `https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(ticker.toUpperCase())}` : '',
    search ? `https://external-api.kalshi.com/trade-api/v2/markets?limit=8&search=${encodeURIComponent(search)}` : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const preview = findPreview(await fetchJson(candidate), target)
    if (preview?.image || preview?.title) return preview
  }

  const image = await readPageImage(target)
  return image ? { image } : undefined
}

async function resolveManifoldPreview(target: URL, title?: string) {
  const segments = target.pathname.split('/').filter(Boolean)
  const slug = segments.at(-1)
  const candidates = [
    slug ? `https://api.manifold.markets/v0/slug/${encodeURIComponent(slug)}` : '',
    title ? `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(title)}&limit=8` : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const preview = findPreview(await fetchJson(candidate), target)
    if (preview?.image || preview?.title) return preview
  }

  const image = await readPageImage(target)
  return image ? { image } : undefined
}

async function fetchJson(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'HeliaCourtBot/1.0 (+https://heliacourt.xyz)',
      },
      signal: AbortSignal.timeout(marketImageTimeoutMs),
    })
    if (!response.ok) return undefined
    return await response.json() as unknown
  } catch {
    return undefined
  }
}

async function readPageImage(target: URL) {
  try {
    const response = await fetch(target, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'HeliaCourtBot/1.0 (+https://heliacourt.xyz)',
      },
      signal: AbortSignal.timeout(marketImageTimeoutMs),
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) return undefined
    const html = await response.text()
    return absolutizeUrl(readMeta(html, 'og:image') ?? readMeta(html, 'twitter:image'), target)
  } catch {
    return undefined
  }
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
  }
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
