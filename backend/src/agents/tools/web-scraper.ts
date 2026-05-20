import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { Readability } from '@mozilla/readability'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'
import type { MarketCase, ToolEvidence } from '../../court/types'
import { getNewsEvidence } from './news'
import { getSearchTerms, normalizeSearchText } from './text'

const maxPages = readPositiveIntegerEnv('HELIA_SCRAPER_MAX_PAGES', 12)
const maxCrawlDepth = readPositiveIntegerEnv('HELIA_SCRAPER_MAX_CRAWL_DEPTH', 2)
const minUsefulTextLength = readPositiveIntegerEnv('HELIA_SCRAPER_MIN_TEXT_LENGTH', 900)
const followSuppliedLinks = process.env.HELIA_SCRAPER_FOLLOW_SUPPLIED_LINKS === 'true'
const maxObservationLength = 1_500
const scraperUserAgent = process.env.HELIA_SCRAPER_USER_AGENT
  ?? process.env.HELIA_HTTP_USER_AGENT
  ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const firecrawlApiUrl = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev/v1/scrape'
const localChromeExecutable = process.env.HELIA_CHROME_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

type ExtractionMode = 'public-endpoint' | 'static-readability' | 'static-cheerio' | 'browser-render' | 'firecrawl'

type ExtractedPage = {
  url: string
  finalUrl: string
  title: string
  description?: string
  author?: string
  publishedAt?: string
  siteName?: string
  text: string
  html?: string
  mode: ExtractionMode
  statusCode?: number
}

type ScrapeTarget = {
  url: string
  title?: string
  source: 'supplied' | 'search' | 'outbound'
  discoveredFrom?: string
  discoveryLabel?: string
  depth: number
}

type OutboundSourceLink = {
  url: string
  label: string
  score: number
}

export async function getWebPageScrapeEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const suppliedLinkText = marketCase.links?.join(' ') ?? ''
  const query = `${marketCase.question} ${marketCase.context ?? ''} ${suppliedLinkText} ${instruction}`.trim()
  const fetchedAt = new Date().toISOString()
  const suppliedUrls = extractUrls(query)
  const discoveredSources = suppliedUrls.length ? [] : await discoverScrapeSources(marketCase)
  const suppliedTargets: ScrapeTarget[] = suppliedUrls.map((url) => ({
    url,
    title: url,
    source: 'supplied',
    depth: 0,
  }))
  const variantTargets: ScrapeTarget[] = suppliedUrls
    .flatMap(expandUrlVariants)
    .filter((url) => !suppliedUrls.includes(url))
    .map((url) => ({
      url,
      title: url,
      source: 'supplied' as const,
      discoveryLabel: 'URL variant for blocked/redirect-prone host',
      depth: 0,
    }))
  const searchedTargets: ScrapeTarget[] = []
  for (const source of discoveredSources) {
    if (!source.url) continue
    searchedTargets.push({
      url: source.url,
      title: source.title,
      source: 'search',
      discoveryLabel: source.value,
      depth: 0,
    })
  }
  const initialTargets = dedupeTargets([...suppliedTargets, ...variantTargets, ...searchedTargets]).slice(0, maxPages)

  if (!initialTargets.length) {
    return {
      capability: 'web_page_scrape',
      provider: 'source-extractor',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['No URL was supplied or discovered from search results for scraping.'],
      sources: [],
    }
  }

  const terms = getSearchTerms(`${marketCase.question} ${marketCase.context ?? ''} ${suppliedLinkText}`)
  const queue = [...initialTargets]
  const visited = new Set<string>()
  const visitedFinalUrls = new Set<string>()
  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []
  const errors: string[] = []

  while (queue.length && visited.size < maxPages) {
    const target = queue.shift()
    if (!target || visited.has(target.url)) continue
    visited.add(target.url)

    const result = await extractPage(target.url, terms)

    if (!result.ok) {
      errors.push(result.error)
      if (isBlockedAccessError(result.error)) {
        const recoveryTargets = await discoverBlockedPageRecoveryTargets(target.url, marketCase)
        for (const recoveryTarget of recoveryTargets) {
          if (visited.size + queue.length >= maxPages) queue.pop()
          if (!visited.has(recoveryTarget.url) && !queue.some((queued) => queued.url === recoveryTarget.url)) {
            queue.push(recoveryTarget)
          }
        }
      }
      continue
    }

    const page = result.page
    if (visitedFinalUrls.has(page.finalUrl)) continue
    visitedFinalUrls.add(page.finalUrl)

    const discoveredSource = discoveredSources.find((source) => source.url === target.url)
    const textHash = createHash('sha256').update(page.text).digest('hex').slice(0, 16)
    const exactTerms = getExactResolutionTerms(`${marketCase.question} ${marketCase.context ?? ''}`)
    const snippets = [...extractApproximateTermSnippets(page.text, exactTerms), ...extractRelevantSnippets(page.text, terms)]
    const extractedClaims = extractClaims(page.text, terms)
    const sourceQuality = classifySourceQuality(page.finalUrl, page.siteName)
    const limitation = getLimitation(page, snippets)
    const outboundLinks = extractOutboundSourceUrls(page, terms)
    const sourceTrail = formatSourceTrail(target)

    observations.push(
      truncateObservation(
        [
          `Scraped ${page.title || page.finalUrl} from ${page.finalUrl} via ${page.mode}.`,
          `Source quality: ${sourceQuality}.`,
          `Source trail: ${sourceTrail}.`,
          page.publishedAt ? `Published/updated: ${page.publishedAt}.` : undefined,
          page.author ? `Author/source byline: ${page.author}.` : undefined,
          discoveredSource ? `Discovered from ${discoveredSource.title}.` : undefined,
          target.discoveryLabel && target.source === 'outbound' ? `Followed link labeled/contexted as: ${target.discoveryLabel}.` : undefined,
          page.description ? `Page description: ${page.description}.` : undefined,
          snippets.length ? `Relevant extracts: ${snippets.join(' / ')}` : undefined,
          extractedClaims.length ? `Extracted claims: ${extractedClaims.join(' / ')}` : undefined,
          outboundLinks.length ? `Follow-up source links found: ${outboundLinks.slice(0, 3).map((link) => `${link.label || link.url} -> ${link.url}`).join(' | ')}.` : undefined,
          `Content hash: ${textHash}.`,
          limitation,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    )

    sources.push({
      title: page.title || page.finalUrl,
      url: page.finalUrl,
      observedAt: page.publishedAt ?? fetchedAt,
      value: JSON.stringify({
        mode: page.mode,
        sourceQuality,
        contentHash: textHash,
        sourceTrail,
        discoverySource: target.source,
        discoveredFrom: target.discoveredFrom,
        discoveryLabel: target.discoveryLabel,
        crawlDepth: target.depth,
        extract: snippets[0] ?? extractedClaims[0] ?? page.description ?? 'scraped',
      }),
    })

    if (suppliedUrls.length && target.source === 'supplied' && !followSuppliedLinks) continue

    for (const outboundLink of outboundLinks) {
      if (target.depth >= maxCrawlDepth) continue
      if (visited.size + queue.length >= maxPages) queue.pop()
      if (!visited.has(outboundLink.url) && !queue.some((queued) => queued.url === outboundLink.url)) {
        const nextTarget = {
          url: outboundLink.url,
          title: outboundLink.label || outboundLink.url,
          source: 'outbound',
          discoveredFrom: page.finalUrl,
          discoveryLabel: outboundLink.label,
          depth: target.depth + 1,
        } satisfies ScrapeTarget

        if (getHostname(outboundLink.url) === getHostname(page.finalUrl)) {
          queue.unshift(nextTarget)
        } else {
          queue.push(nextTarget)
        }
      }
    }
  }

  return {
    capability: 'web_page_scrape',
    provider: getProviderLabel(),
    query,
    fetchedAt,
    status: observations.length ? 'ok' : 'error',
    observations,
    sources,
    error: observations.length ? undefined : errors.join('; ') || 'No pages could be scraped.',
  }
}

async function extractPage(url: string, terms: string[]): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  const endpointResult = await extractPublicEndpointPage(url)
  if (endpointResult.ok && isUsefulExtraction(endpointResult.page, terms)) return endpointResult
  if (endpointResult.ok && isEndpointFriendlyHost(url)) return endpointResult
  if (!endpointResult.ok && isTerminalPublicEndpointError(endpointResult.error)) return endpointResult

  const staticResult = await extractStaticPage(url)
  if (staticResult.ok && isAccessDeniedPage(staticResult.page)) return { ok: false, error: `${url}: blocked access page returned by ${staticResult.page.finalUrl}` }
  if (staticResult.ok && isEmptySocialShell(staticResult.page)) return { ok: false, error: `${url}: social page returned an empty challenge/shell page.` }
  if (staticResult.ok && isUsefulExtraction(staticResult.page, terms)) return staticResult

  const browserResult = await extractBrowserRenderedPage(url)
  if (browserResult.ok && isAccessDeniedPage(browserResult.page)) return { ok: false, error: `${url}: blocked access page returned by ${browserResult.page.finalUrl}` }
  if (browserResult.ok && isEmptySocialShell(browserResult.page)) return { ok: false, error: `${url}: rendered social page returned an empty challenge/shell page.` }
  if (browserResult.ok && isUsefulExtraction(browserResult.page, terms)) return browserResult

  const firecrawlResult = await extractFirecrawlPage(url)
  if (firecrawlResult.ok && isAccessDeniedPage(firecrawlResult.page)) return { ok: false, error: `${url}: blocked access page returned by ${firecrawlResult.page.finalUrl}` }
  if (firecrawlResult.ok && isEmptySocialShell(firecrawlResult.page)) return { ok: false, error: `${url}: Firecrawl social page returned an empty challenge/shell page.` }
  if (firecrawlResult.ok && isUsefulExtraction(firecrawlResult.page, terms)) return firecrawlResult

  if (endpointResult.ok) return endpointResult
  if (staticResult.ok && !isAccessDeniedPage(staticResult.page) && !isEmptySocialShell(staticResult.page)) return staticResult
  if (browserResult.ok && !isAccessDeniedPage(browserResult.page) && !isEmptySocialShell(browserResult.page)) return browserResult
  if (firecrawlResult.ok && !isAccessDeniedPage(firecrawlResult.page) && !isEmptySocialShell(firecrawlResult.page)) return firecrawlResult

  return { ok: false, error: [resultError(endpointResult), resultError(staticResult), resultError(browserResult), resultError(firecrawlResult)].filter(Boolean).join('; ') }
}

function resultError(result: { ok: true; page: ExtractedPage } | { ok: false; error: string }) {
  return result.ok ? undefined : result.error
}

function isTerminalPublicEndpointError(error: string) {
  return /TikTok oEmbed did not expose this video metadata/i.test(error)
}

async function extractPublicEndpointPage(url: string): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()

    if (host === 'instagram.com') {
      const handle = getInstagramHandle(parsed)
      if (handle) return await extractInstagramProfileEndpoint(url, handle)
    }

    if (host === 'x.com' || host === 'twitter.com') {
      const handle = getXHandle(parsed)
      if (handle) return await extractXProfileEndpoint(url, handle)
    }

    if (host === 'youtube.com' || host === 'youtu.be' || host === 'tiktok.com') {
      const oembed = await extractOembedEndpoint(url, host).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : 'oEmbed failed' }))
      if (oembed.ok) return oembed
      if (host === 'tiktok.com' && /\/video\/\d+/i.test(parsed.pathname)) {
        return { ok: false, error: `${url}: TikTok oEmbed did not expose this video metadata (${oembed.error}).` }
      }
    }

    return { ok: false, error: `${url}: no public endpoint adapter matched.` }
  } catch (error) {
    return { ok: false, error: `${url}: ${error instanceof Error ? error.message : 'public endpoint extraction failed'}` }
  }
}

async function extractInstagramProfileEndpoint(originalUrl: string, handle: string): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  const endpoint = new URL('https://www.instagram.com/api/v1/users/web_profile_info/')
  endpoint.searchParams.set('username', handle)
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(6_000),
    headers: {
      accept: 'application/json,text/plain,*/*',
      referer: `https://www.instagram.com/${handle}/`,
      'x-ig-app-id': '936619743392459',
      'user-agent': scraperUserAgent,
    },
  })
  const payload = await response.json() as InstagramWebProfileResponse
  if (!response.ok) return { ok: false, error: `${originalUrl}: Instagram profile endpoint returned HTTP ${response.status}` }
  const user = payload.data?.user
  if (!user) return { ok: false, error: `${originalUrl}: Instagram profile endpoint returned no user data.` }

  const counts = [
    typeof user.edge_followed_by?.count === 'number' ? `${user.edge_followed_by.count} followers` : undefined,
    typeof user.edge_follow?.count === 'number' ? `${user.edge_follow.count} following` : undefined,
    typeof user.edge_owner_to_timeline_media?.count === 'number' ? `${user.edge_owner_to_timeline_media.count} posts` : undefined,
  ].filter(Boolean).join(', ')
  const title = `${user.full_name || user.username || handle} (@${user.username || handle}) Instagram profile`
  const text = normalizeWhitespace([
    title,
    user.biography,
    counts,
    user.is_verified ? 'verified account' : undefined,
    user.is_private ? 'private account' : 'public account',
    `Public endpoint: ${endpoint.toString()}`,
  ].filter(Boolean).join('. '))

  return {
    ok: true,
    page: {
      url: originalUrl,
      finalUrl: `https://www.instagram.com/${handle}/`,
      title,
      description: counts || user.biography,
      siteName: 'Instagram',
      text,
      mode: 'public-endpoint',
      statusCode: response.status,
    },
  }
}

async function extractXProfileEndpoint(originalUrl: string, handle: string): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  const bearer = '***REMOVED***'
  const queryId = process.env.HELIA_X_USER_BY_SCREEN_NAME_QUERY_ID ?? 'IGgvgiOx4QZndDHuD3x9TQ'
  const guestToken = await activateXGuestTokenForScraper(bearer)
  const endpoint = new URL(`https://x.com/i/api/graphql/${queryId}/UserByScreenName`)
  endpoint.searchParams.set('variables', JSON.stringify({ screen_name: handle }))
  endpoint.searchParams.set('features', JSON.stringify({
    hidden_profile_subscriptions_enabled: true,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    verified_phone_label_enabled: true,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    subscriptions_feature_can_gift_premium: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
  }))
  endpoint.searchParams.set('fieldToggles', JSON.stringify({ withPayments: true, withAuxiliaryUserLabels: true }))
  const response = await fetchWithRetry(endpoint, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${bearer}`,
      'x-guest-token': guestToken,
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      accept: '*/*',
      referer: `https://x.com/${handle}`,
      'user-agent': scraperUserAgent,
    },
  }, 2)
  const payload = await response.json() as XUserByScreenNameResponse
  if (!response.ok) return { ok: false, error: `${originalUrl}: X profile endpoint returned HTTP ${response.status}` }
  const result = payload.data?.user?.result
  if (!result?.legacy) return { ok: false, error: `${originalUrl}: X profile endpoint returned no legacy profile data.` }

  const counts = [
    typeof result.legacy.followers_count === 'number' ? `${result.legacy.followers_count} followers` : undefined,
    typeof result.legacy.friends_count === 'number' ? `${result.legacy.friends_count} following` : undefined,
    typeof result.legacy.statuses_count === 'number' ? `${result.legacy.statuses_count} posts` : undefined,
    typeof result.legacy.media_count === 'number' ? `${result.legacy.media_count} media` : undefined,
  ].filter(Boolean).join(', ')
  const screenName = result.core?.screen_name ?? handle
  const title = `${result.core?.name || screenName} (@${screenName}) X profile`
  const text = normalizeWhitespace([
    title,
    result.legacy.description,
    counts,
    result.is_blue_verified ? 'verified account' : undefined,
    `Public endpoint: ${endpoint.origin}${endpoint.pathname}`,
  ].filter(Boolean).join('. '))

  return {
    ok: true,
    page: {
      url: originalUrl,
      finalUrl: `https://x.com/${screenName}`,
      title,
      description: counts || result.legacy.description,
      siteName: 'X',
      text,
      mode: 'public-endpoint',
      statusCode: response.status,
    },
  }
}

async function extractOembedEndpoint(originalUrl: string, host: string): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  const endpoint = host === 'tiktok.com'
    ? new URL('https://www.tiktok.com/oembed')
    : new URL('https://www.youtube.com/oembed')
  endpoint.searchParams.set('url', originalUrl)
  if (host !== 'tiktok.com') endpoint.searchParams.set('format', 'json')

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(6_000),
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': scraperUserAgent,
    },
  })
  const payload = await response.json() as OembedResponse
  if (!response.ok) return { ok: false, error: `${originalUrl}: oEmbed endpoint returned HTTP ${response.status}` }

  const text = normalizeWhitespace([
    payload.title,
    payload.author_name ? `Author: ${payload.author_name}` : undefined,
    payload.provider_name ? `Provider: ${payload.provider_name}` : undefined,
    payload.type ? `Type: ${payload.type}` : undefined,
    payload.thumbnail_url ? 'Thumbnail available from provider metadata' : undefined,
  ].filter(Boolean).join('. '))

  return {
    ok: true,
    page: {
      url: originalUrl,
      finalUrl: originalUrl,
      title: payload.title || originalUrl,
      author: payload.author_name,
      siteName: payload.provider_name,
      text,
      mode: 'public-endpoint',
      statusCode: response.status,
    },
  }
}

async function extractStaticPage(url: string): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'upgrade-insecure-requests': '1',
        'user-agent': scraperUserAgent,
      },
    })

    if (!response.ok) {
      return { ok: false, error: `${url} returned HTTP ${response.status}` }
    }

    const contentType = response.headers.get('content-type') ?? ''
    const raw = await response.text()
    const finalUrl = response.url || url

    if (!contentType.includes('html')) {
      if (/^(image|video|audio)\//i.test(contentType)) {
        return { ok: false, error: `${url}: skipped binary media response (${contentType})` }
      }
      const text = normalizeWhitespace(raw)
      return {
        ok: true,
        page: {
          url,
          finalUrl,
          title: finalUrl,
          text,
          mode: 'static-cheerio',
          statusCode: response.status,
        },
      }
    }

    const metadata = extractCheerioMetadata(raw, finalUrl)
    const readable = extractReadableArticle(raw, finalUrl)
    const text = readable?.text || metadata.text

    return {
      ok: true,
      page: {
        url,
        finalUrl,
        title: readable?.title || metadata.title || finalUrl,
        description: metadata.description,
        author: readable?.byline || metadata.author,
        publishedAt: metadata.publishedAt,
        siteName: metadata.siteName,
        text,
        html: raw,
        mode: readable?.text ? 'static-readability' : 'static-cheerio',
        statusCode: response.status,
      },
    }
  } catch (error) {
    return { ok: false, error: `${url}: ${error instanceof Error ? error.message : 'static scrape failed'}` }
  }
}

async function extractBrowserRenderedPage(url: string): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  const browserWsEndpoint = process.env.BROWSERLESS_WS_ENDPOINT ?? process.env.PLAYWRIGHT_WS_ENDPOINT
  if (!browserWsEndpoint && !existsSync(localChromeExecutable)) {
    return { ok: false, error: 'browser-render skipped: set BROWSERLESS_WS_ENDPOINT/PLAYWRIGHT_WS_ENDPOINT or HELIA_CHROME_EXECUTABLE_PATH to enable rendered scraping.' }
  }

  let browser: any
  let page: any

  try {
    const { chromium } = await import('playwright-core')
    browser = browserWsEndpoint
      ? await chromium.connect(browserWsEndpoint)
      : await chromium.launch({
          executablePath: localChromeExecutable,
          headless: true,
        })
    page = await browser.newPage({
      userAgent: scraperUserAgent,
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1',
      },
    })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 })
    const title = await page.title()
    const html = await page.content()
    const text = normalizeWhitespace(await page.locator('body').innerText({ timeout: 5_000 }).catch(() => htmlToText(html)))
    const finalUrl = page.url()

    const metadata = extractCheerioMetadata(html, finalUrl)
    return {
      ok: true,
      page: {
        url,
        finalUrl,
        title: title || metadata.title || finalUrl,
        description: metadata.description,
        author: metadata.author,
        publishedAt: metadata.publishedAt,
        siteName: metadata.siteName,
        text,
        html,
        mode: 'browser-render',
      },
    }
  } catch (error) {
    return { ok: false, error: `${url}: ${error instanceof Error ? error.message : 'browser render failed'}` }
  } finally {
    await page?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}

async function extractFirecrawlPage(url: string): Promise<{ ok: true; page: ExtractedPage } | { ok: false; error: string }> {
  if (!process.env.FIRECRAWL_API_KEY) return { ok: false, error: 'firecrawl skipped: FIRECRAWL_API_KEY is not set.' }

  try {
    const response = await fetch(firecrawlApiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        timeout: 20_000,
      }),
    })
    const payload = await response.json() as {
      success?: boolean
      data?: {
        markdown?: string
        html?: string
        metadata?: Record<string, string>
      }
      error?: string
    }

    if (!response.ok || !payload.success || !payload.data) {
      return { ok: false, error: `${url}: Firecrawl failed${payload.error ? ` (${payload.error})` : ''}` }
    }

    const metadata = payload.data.metadata ?? {}
    const finalUrl = metadata.sourceURL ?? url
    const text = normalizeWhitespace(payload.data.markdown ?? htmlToText(payload.data.html ?? ''))

    return {
      ok: true,
      page: {
        url,
        finalUrl,
        title: metadata.title ?? finalUrl,
        description: metadata.description,
        author: metadata.author,
        publishedAt: metadata.publishedTime ?? metadata.modifiedTime,
        siteName: metadata.ogSiteName,
        text,
        html: payload.data.html,
        mode: 'firecrawl',
      },
    }
  } catch (error) {
    return { ok: false, error: `${url}: ${error instanceof Error ? error.message : 'Firecrawl scrape failed'}` }
  }
}

function extractUrls(value: string) {
  return [...value.matchAll(/https?:\/\/[^\s)\]}"'<>]+/gi)]
    .map((match) => match[0].replace(/[.,;:]+$/g, ''))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function getInstagramHandle(url: URL) {
  const part = url.pathname.split('/').filter(Boolean)[0]
  if (!part || /^(p|reel|reels|stories|explore|accounts|direct|about|developer|api)$/i.test(part)) return undefined
  return part.replace(/^@/, '')
}

function getXHandle(url: URL) {
  const part = url.pathname.split('/').filter(Boolean)[0]
  if (!part || /^(home|search|share|i|intent|login|privacy|tos|settings|notifications|messages)$/i.test(part)) return undefined
  return part.replace(/^@/, '')
}

async function activateXGuestTokenForScraper(bearer: string) {
  let lastError: string | undefined
  for (const endpoint of ['https://api.x.com/1.1/guest/activate.json', 'https://api.twitter.com/1.1/guest/activate.json']) {
    try {
      const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
          'user-agent': scraperUserAgent,
        },
      }, 2)
      const payload = await response.json() as { guest_token?: string }
      if (response.ok && payload.guest_token) return payload.guest_token
      lastError = `${endpoint} returned HTTP ${response.status}`
    } catch (error) {
      lastError = `${endpoint}: ${error instanceof Error ? error.message : 'guest activation failed'}`
    }
  }

  throw new Error(lastError ?? 'X guest activation failed')
}

async function fetchWithRetry(url: string | URL, init: RequestInit, attempts: number) {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }

  throw lastError
}

async function discoverScrapeSources(marketCase: MarketCase) {
  const caseText = `${marketCase.question} ${marketCase.context ?? ''}`
  const newsEvidence = await getNewsEvidence(marketCase).catch(() => undefined)

  return (newsEvidence?.sources ?? [])
    .filter((source) => source.url && isScrapableUrl(source.url))
    .filter((source) => scoreScrapeSource(source, caseText) > 0)
    .sort((left, right) => scoreScrapeSource(right, caseText) - scoreScrapeSource(left, caseText))
    .slice(0, maxPages)
}

async function discoverOfficialHostSources(marketCase: MarketCase, suppliedUrls: string[]) {
  const hosts = suppliedUrls
    .map(getHostname)
    .filter(isString)
    .filter((host, index, hosts) => hosts.indexOf(host) === index)
    .slice(0, 4)

  if (!hosts.length) return []

  const caseText = `${marketCase.question} ${marketCase.context ?? ''}`
  const terms = getSearchTerms(caseText).slice(0, 10).join(' ')
  const searches = await Promise.allSettled(hosts.map(async (host) => {
    const evidence = await getNewsEvidence({
      ...marketCase,
      question: `${marketCase.question} site:${host} ${terms}`,
      context: marketCase.context,
    })

    return evidence.sources
      .filter((source) => source.url && isScrapableUrl(source.url) && getHostname(source.url) === host)
      .filter((source) => scoreScrapeSource(source, caseText) > 0)
      .map((source) => ({
        ...source,
        value: source.value ? `official-host-search:${source.value}` : 'official-host-search',
      }))
  }))

  return searches.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function discoverBlockedPageRecoveryTargets(blockedUrl: string, marketCase: MarketCase): Promise<ScrapeTarget[]> {
  const host = getHostname(blockedUrl)
  if (!host) return []

  const caseText = `${marketCase.question} ${marketCase.context ?? ''}`
  const terms = getSearchTerms(caseText).slice(0, 10).join(' ')
  const evidence = await getNewsEvidence({
    ...marketCase,
    question: `${marketCase.question} site:${host} ${terms}`,
    context: `${marketCase.context ?? ''} Official-source recovery search for ${blockedUrl}.`,
  }).catch(() => undefined)

  return (evidence?.sources ?? [])
    .filter((source) => source.url && isScrapableUrl(source.url) && getHostname(source.url) === host)
    .filter((source) => scoreScrapeSource(source, caseText) > 0)
    .slice(0, 6)
    .map((source) => ({
      url: source.url as string,
      title: source.title,
      source: 'search',
      discoveryLabel: `blocked-page recovery from ${host}`,
      discoveredFrom: blockedUrl,
      depth: 0,
    }))
}

function expandUrlVariants(url: string) {
  if (isEndpointFriendlyHost(url)) return []
  const variants = new Set<string>()

  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') {
      const http = new URL(parsed)
      http.protocol = 'http:'
      variants.add(http.toString())
    } else if (parsed.protocol === 'http:') {
      const https = new URL(parsed)
      https.protocol = 'https:'
      variants.add(https.toString())
    }

    const withoutWww = parsed.hostname.replace(/^www\./i, '')
    if (withoutWww !== parsed.hostname) {
      const alt = new URL(parsed)
      alt.hostname = withoutWww
      variants.add(alt.toString())
    } else {
      const alt = new URL(parsed)
      alt.hostname = `www.${parsed.hostname}`
      variants.add(alt.toString())
    }
  } catch {
    return []
  }

  return [...variants].filter(isScrapableUrl)
}

function isEndpointFriendlyHost(url: string) {
  const host = getHostname(url)
  return Boolean(host && /^(x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be)$/.test(host))
}

function getHostname(url?: string) {
  if (!url) return undefined

  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return undefined
  }
}

function scoreScrapeSource(source: ToolEvidence['sources'][number], caseText: string) {
  const haystack = `${source.title} ${source.url ?? ''} ${source.value ?? ''}`.toLowerCase()
  const terms = getSearchTerms(caseText)
  const termHits = terms.filter((term) => haystack.includes(term.toLowerCase())).length
  let score = termHits

  if (/\b(transcript|captions?|subtitles?|quote|remarks|interview)\b/i.test(haystack)) score += 12
  if (/\b(official|video|audio|watch|youtube|vimeo|whitehouse|archive|factbase|rev|c-span|fox)\b/i.test(haystack)) score += 10
  if (/\b(polymarket|kalshi|predictmarketcap|startuphub|analytics|price|odds|volume)\b/i.test(haystack)) score -= 12

  return score
}

function isScrapableUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) return false
    if (/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(parsed.hostname) && /^\/i\/flow\/login/i.test(parsed.pathname)) return false
    if (/(^|\.)tiktokcdn\.com$|(^|\.)ttwstatic\.com$|(^|\.)cdninstagram\.com$|(^|\.)twimg\.com$/i.test(parsed.hostname)) return false
    if (/\.(pdf|png|jpe?g|gif|svg|webp|mp4|zip)$/i.test(parsed.pathname)) return false
    return true
  } catch {
    return false
  }
}

function dedupeTargets(targets: ScrapeTarget[]) {
  const seen = new Set<string>()
  const output: ScrapeTarget[] = []

  for (const target of targets) {
    if (seen.has(target.url)) continue
    seen.add(target.url)
    output.push(target)
  }

  return output
}

function isScrapeTarget(value: ScrapeTarget | undefined): value is ScrapeTarget {
  return Boolean(value?.url)
}

function extractOutboundSourceUrls(page: ExtractedPage, terms: string[]): OutboundSourceLink[] {
  const candidates: OutboundSourceLink[] = []
  const pageHost = getHostname(page.finalUrl)

  if (page.html) {
    const $ = cheerio.load(page.html)
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (!href) return
      const url = safeAbsoluteUrl(href, page.finalUrl)
      if (!url || !isScrapableUrl(url)) return

      const label = normalizeWhitespace($(element).text())
      if (isLikelyUtilityUrl(url, label)) return
      candidates.push({ url, label: label || url, score: scoreOutboundSource(`${label} ${url}`, terms, pageHost) })
    })
  }

  for (const item of extractUrlsWithContext(page.text)) {
    if (!isScrapableUrl(item.url)) continue
    if (isLikelyUtilityUrl(item.url, item.context)) continue
    candidates.push({ url: item.url, label: item.context || item.url, score: scoreOutboundSource(item.context, terms, pageHost) })
  }

  return candidates
    .filter((candidate) => candidate.score >= 5 && hasStrongTermHit(candidate.label, terms))
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, values) => values.findIndex((value) => value.url === candidate.url) === index)
    .slice(0, 8)
}

function formatSourceTrail(target: ScrapeTarget) {
  if (target.source === 'supplied') return 'supplied by case/user'
  if (target.source === 'search') return `discovered by web search${target.discoveryLabel ? ` (${target.discoveryLabel})` : ''}`
  return `followed from ${target.discoveredFrom ?? 'prior page'}${target.discoveryLabel ? ` via "${target.discoveryLabel}"` : ''}`
}

function extractUrlsWithContext(value: string) {
  return [...value.matchAll(/https?:\/\/[^\s)\]}"'<>]+/gi)].map((match) => {
    const start = Math.max(0, (match.index ?? 0) - 100)
    const end = Math.min(value.length, (match.index ?? 0) + match[0].length + 100)

    return {
      url: match[0].replace(/[.,;:]+$/g, ''),
      context: normalizeWhitespace(value.slice(start, end)),
    }
  })
}

function safeAbsoluteUrl(href: string, base: string) {
  try {
    return new URL(href, base).toString()
  } catch {
    return undefined
  }
}

function scoreOutboundSource(value: string, terms: string[], sourceHost?: string) {
  const haystack = normalizeSearchText(value)
  const termHits = terms.filter((term) => term.length > 2 && haystack.includes(normalizeSearchText(term))).length
  let score = termHits

  const targetHost = extractFirstUrl(value)
  if (sourceHost && targetHost && sourceHost === getHostname(targetHost)) score += 2
  if (/\b(transcript|analysis|source|official|video|audio|archive|captions?|subtitles?|factbase|rev|news|press|release|releases|library|documents?|uap|ufo|report)\b/i.test(value)) score += 8
  if (/\b(aaro|dod|defense|whitehouse|archives|foia|reading room|documents?)\b/i.test(value)) score += 8
  if (/^\s*.{1,2}\s*https?:/i.test(value)) score -= 5
  if (/\b(login|signup|share|privacy|terms|advertise|mailto|javascript|flow\/login)\b/i.test(value)) score -= 10
  if (/\b(polymarket|kalshi|price|odds|volume|analytics)\b/i.test(value)) score -= 3

  return score
}

function hasStrongTermHit(value: string, terms: string[]) {
  const haystack = normalizeSearchText(value)
  const lowValueTerms = new Set([
    'will',
    'what',
    'when',
    'this',
    'that',
    'market',
    'resolve',
    'resolves',
    'yes',
    'otherwise',
    'specified',
    'primary',
    'resolution',
    'source',
    'official',
    'credible',
    'reporting',
    'used',
    'date',
    'timeframe',
    'question',
    'context',
  ])

  return terms.some((term) => {
    const normalized = normalizeSearchText(term)
    return normalized.length >= 4
      && !/^\d+$/.test(normalized)
      && !lowValueTerms.has(normalized)
      && haystack.includes(normalized)
  })
}

function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s)\]}"'<>]+/i)?.[0]
}

function isLikelyUtilityUrl(url: string, label = '') {
  const haystack = `${url} ${label}`.toLowerCase()

  return /\b(login|signup|sign-in|share|sharearticle|privacy|terms|advertise|subscribe|newsletter|mailto|javascript:|facebook\.com|linkedin\.com|twitter\.com|x\.com|instagram\.com|threads\.net|bsky\.app|bluesky)\b/.test(haystack)
    || /\/(login|signup|privacy|terms|share)(\/|$)/i.test(url)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function extractReadableArticle(html: string, url: string) {
  try {
    const dom = new JSDOM(stripNonContentMarkup(html), { url })
    const article = new Readability(dom.window.document).parse()
    if (!article?.textContent) return undefined

    return {
      title: normalizeWhitespace(article.title ?? ''),
      byline: normalizeWhitespace(article.byline ?? ''),
      text: normalizeWhitespace(article.content ? htmlContentToReadableText(article.content) : article.textContent),
    }
  } catch {
    return undefined
  }
}

function stripNonContentMarkup(html: string) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '')
}

function extractCheerioMetadata(html: string, url: string) {
  const $ = cheerio.load(html)
  const title = normalizeWhitespace($('meta[property="og:title"]').attr('content') ?? $('title').first().text() ?? '')
  const description = normalizeWhitespace(
    $('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '',
  )
  const author = normalizeWhitespace(
    $('meta[name="author"]').attr('content') ?? $('meta[property="article:author"]').attr('content') ?? $('[rel="author"]').first().text() ?? '',
  )
  const publishedAt = normalizeWhitespace(
    $('meta[property="article:published_time"]').attr('content')
      ?? $('meta[name="date"]').attr('content')
      ?? $('time[datetime]').first().attr('datetime')
      ?? '',
  )
  const siteName = normalizeWhitespace($('meta[property="og:site_name"]').attr('content') ?? new URL(url).hostname)

  $('script, style, noscript, svg').remove()
  const articleText = normalizeWhitespace($('article').first().text())
  const mainText = normalizeWhitespace($('main').first().text())
  const bodyText = normalizeWhitespace($('body').text())

  return {
    title,
    description,
    author,
    publishedAt,
    siteName,
    text: articleText || mainText || bodyText,
  }
}

function isUsefulExtraction(page: ExtractedPage, terms: string[]) {
  if (page.text.length >= minUsefulTextLength && hasTermHit(page.text, terms)) return true
  if (page.description && hasTermHit(page.description, terms)) return true
  return page.text.length >= 2_500
}

function isAccessDeniedPage(page: ExtractedPage) {
  const text = `${page.title} ${page.description ?? ''} ${page.text}`.toLowerCase()

  return /\baccess denied\b/.test(text)
    || /you don't have permission to access/.test(text)
    || /errors\.edgesuite\.net/.test(text)
    || /\bakamai(?:ghost)?\b/.test(text)
    || /\brequest blocked\b/.test(text)
    || /\bforbidden\b/.test(text) && page.text.length < 1_200
}

function isEmptySocialShell(page: ExtractedPage) {
  const host = getHostname(page.finalUrl || page.url)
  if (!host || !/^(x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be)$/.test(host)) return false

  const text = normalizeWhitespace(page.text)
  if (text.length > 80) return false
  const title = normalizeWhitespace(page.title).toLowerCase()
  return !text || title === 'tiktok - make your day' || title === 'x' || title === 'instagram'
}

function isBlockedAccessError(error: string) {
  return /blocked access|access denied|HTTP 403|forbidden|akamai|edgesuite/i.test(error)
}

function hasTermHit(text: string, terms: string[]) {
  const normalized = normalizeSearchText(text)
  return terms.some((term) => term.length > 3 && normalized.includes(normalizeSearchText(term)))
}

function extractRelevantSnippets(text: string, terms: string[]) {
  return rankTextSegments(text, terms).slice(0, 4)
}

function getExactResolutionTerms(value: string) {
  return [...value.matchAll(/["“”']([^"“”']{3,80})["“”']/g)]
    .map((match) => match[1].trim())
    .filter((term) => !/^https?:\/\//i.test(term))
    .slice(0, 5)
}

function extractApproximateTermSnippets(text: string, exactTerms: string[]) {
  if (!exactTerms.length) return []

  const snippets: string[] = []

  for (const segment of buildTextSegments(text)) {
    const words = normalizeSearchText(segment).split(/\s+/).filter(Boolean)
    const matchedTerm = exactTerms.find((term) => {
      const normalizedTerm = normalizeSearchText(term)
      if (!normalizedTerm) return false

      return words.some((word) => {
        if (word.length < 4) return false
        const comparableWords = [word, word.replace(/'s$/i, '').replace(/s$/i, '')].filter(Boolean)
        const prefix = normalizedTerm.slice(0, Math.min(3, normalizedTerm.length))
        const threshold = Math.max(2, Math.ceil(normalizedTerm.length * 0.2))
        return comparableWords.some((candidate) => candidate.startsWith(prefix) && levenshteinDistance(candidate, normalizedTerm) <= threshold)
      })
    })

    if (!matchedTerm) continue
    snippets.push(`Approximate match for "${matchedTerm}": ${segment.length <= 520 ? segment : `${segment.slice(0, 519).trim()}…`}`)
    if (snippets.length >= 3) break
  }

  return snippets
}

function extractClaims(text: string, terms: string[]) {
  return rankTextSegments(text, terms, 40, 320).slice(0, 4)
}

function rankTextSegments(text: string, terms: string[], minLength = 80, maxLength = 520) {
  const termSet = terms.filter((term) => term.length > 3).slice(0, 14).map(normalizeSearchText)
  if (!termSet.length) return []

  const segments = buildTextSegments(text)
  const scored = segments
    .map((segment) => {
      const normalized = normalizeSearchText(segment)
      const termHits = termSet.filter((term) => normalized.includes(term)).length
      const dateOrNumberHits = (segment.match(/\b(20\d{2}|\d+%|\d+\.\d+|\d+\s?(?:caps|goals|appearances|matches))/gi) ?? []).length
      const sourceCueHits = (normalized.match(/\b(fifa|brazil|world cup|squad|roster|national team|played|appeared|called|eligible|current team)\b/g) ?? []).length
      const junkPenalty = /\b(first or maternal family name|generational suffix|citation needed|jump up|career statistics|filmography|television|docuseries)\b/i.test(segment) ? 5 : 0
      return { segment, score: termHits * 3 + sourceCueHits + Math.min(dateOrNumberHits, 2) - junkPenalty }
    })
    .filter((item) => item.score > 0 && item.segment.length >= minLength)
    .sort((a, b) => b.score - a.score)

  const output: string[] = []
  for (const item of scored) {
    const segment = item.segment.length <= maxLength ? item.segment : `${item.segment.slice(0, maxLength - 1).trim()}…`
    if (!output.some((existing) => normalizeSearchText(existing).includes(normalizeSearchText(segment.slice(0, 80))))) {
      output.push(segment)
    }
    if (output.length >= 6) break
  }

  return output
}

function buildTextSegments(text: string) {
  const sentenceSegments = text
    .split(/(?<=[.!?])\s+/)
    .map(normalizeWhitespace)
    .filter((sentence) => sentence.length >= 40)

  const windowSegments: string[] = []
  const words = text.split(/\s+/).filter(Boolean)
  for (let index = 0; index < words.length; index += 55) {
    windowSegments.push(normalizeWhitespace(words.slice(index, index + 80).join(' ')))
  }

  return [...sentenceSegments, ...windowSegments].filter(Boolean)
}

function classifySourceQuality(url: string, siteName = '') {
  const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  const site = siteName.toLowerCase()

  if (/(fifa\.com|thefa\.com|cbf\.com\.br|nba\.com|nfl\.com|mlb\.com|nhl\.com|sec\.gov|federalreserve\.gov|bls\.gov|bea\.gov|cftc\.gov|eia\.gov)/i.test(host)) {
    return 'primary'
  }
  if (/(reuters|apnews|associated press|bbc|espn|the athletic|sky sports|guardian|financial times|bloomberg|cnbc)/i.test(`${host} ${site}`)) {
    return 'credible-media'
  }
  if (/(wikipedia|wikidata|crossref|github)/i.test(`${host} ${site}`)) {
    return 'reference'
  }

  return 'unclassified'
}

function getLimitation(page: ExtractedPage, snippets: string[]) {
  if (!snippets.length) return 'Does not prove: the page did not expose a case-specific passage matching the market terms.'
  return 'Does not prove: extracted text supports only the quoted page content; it does not by itself resolve a future market outcome.'
}

function getProviderLabel() {
  const providers = ['public-endpoint', 'static-readability', 'static-cheerio']
  if (process.env.BROWSERLESS_WS_ENDPOINT || process.env.PLAYWRIGHT_WS_ENDPOINT || existsSync(localChromeExecutable)) providers.push('browser-render')
  if (process.env.FIRECRAWL_API_KEY) providers.push('firecrawl')
  return providers.join('+')
}

function htmlToText(html: string) {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let i = 0; i < left.length; i += 1) {
    const current = [i + 1]
    for (let j = 0; j < right.length; j += 1) {
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + (left[i] === right[j] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length] ?? 0
}

function htmlContentToReadableText(html: string) {
  const $ = cheerio.load(html)
  $('script, style, noscript, svg, table, sup, .reference').remove()
  const blocks = $('p, li, h2, h3')
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter((value) => value.length > 30)

  return blocks.length ? blocks.join(' ') : htmlToText(html)
}

function truncateObservation(value: string) {
  return value.length <= maxObservationLength ? value : `${value.slice(0, maxObservationLength - 1).trim()}…`
}

function normalizeWhitespace(value = '') {
  return value.replace(/\s+/g, ' ').trim()
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

type InstagramWebProfileResponse = {
  data?: {
    user?: {
      username?: string
      full_name?: string
      biography?: string
      is_verified?: boolean
      is_private?: boolean
      edge_followed_by?: { count?: number }
      edge_follow?: { count?: number }
      edge_owner_to_timeline_media?: { count?: number }
    }
  }
}

type XUserByScreenNameResponse = {
  data?: {
    user?: {
      result?: {
        core?: {
          name?: string
          screen_name?: string
          created_at?: string
        }
        is_blue_verified?: boolean
        legacy?: {
          description?: string
          followers_count?: number
          friends_count?: number
          statuses_count?: number
          listed_count?: number
          media_count?: number
          favourites_count?: number
        }
      }
    }
  }
}

type OembedResponse = {
  title?: string
  author_name?: string
  provider_name?: string
  type?: string
  thumbnail_url?: string
}
