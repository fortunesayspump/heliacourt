import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MarketCase, ToolEvidence } from '../../court/types'
import { getNewsEvidence } from './news'

const maxVisualTargets = readPositiveIntegerEnv('HELIA_VISUAL_MAX_TARGETS', 4)
const screenshotViewportWidth = readPositiveIntegerEnv('HELIA_SCREENSHOT_WIDTH', 1365)
const screenshotViewportHeight = readPositiveIntegerEnv('HELIA_SCREENSHOT_HEIGHT', 900)
const localOcrTimeoutMs = readPositiveIntegerEnv('HELIA_OCR_TIMEOUT_MS', 8_000)
const visualModel = process.env.HELIA_VISION_MODEL ?? process.env.OPENROUTER_VISION_MODEL
const screenshotUserAgent = process.env.HELIA_SCRAPER_USER_AGENT
  ?? process.env.HELIA_HTTP_USER_AGENT
  ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const localChromeExecutable = process.env.HELIA_CHROME_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

type VisualTarget = {
  url: string
  title: string
  kind: 'image-url' | 'page-screenshot'
}

type VisualImage = {
  target: VisualTarget
  imageUrl: string
  imageBuffer?: Buffer
  visibleText?: string
  observedAt?: string
}

type OpenRouterVisionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

export async function getVisualPageEvidence(marketCase: MarketCase): Promise<ToolEvidence> {
  const fetchedAt = new Date().toISOString()
  const query = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''}`.trim()
  const targets = await discoverVisualTargets(marketCase)

  if (!targets.length) {
    return {
      capability: 'visual_page_analysis',
      provider: 'vision-source-discovery',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['No image URL or screenshot-worthy page was supplied or discovered.'],
      sources: [],
    }
  }

  const images: VisualImage[] = []
  const errors: string[] = []

  for (const target of targets.slice(0, maxVisualTargets)) {
    if (target.kind === 'image-url') {
      const fetchedImage = await fetchImage(target.url)
      if (fetchedImage.ok) {
        images.push({ target, imageUrl: target.url, imageBuffer: fetchedImage.buffer, observedAt: fetchedAt })
      } else {
        errors.push(fetchedImage.error)
      }
      continue
    }

    const screenshot = await screenshotPage(target.url)
    if (screenshot.ok) {
      images.push({ target, imageUrl: screenshot.dataUri, imageBuffer: screenshot.buffer, visibleText: screenshot.visibleText, observedAt: fetchedAt })
    } else {
      errors.push(screenshot.error)
    }
  }

  if (!images.length) {
    return {
      capability: 'visual_page_analysis',
      provider: getVisualProviderLabel(),
      query,
      fetchedAt,
      status: 'error',
      observations: errors.length ? errors : ['No visual target could be prepared for model analysis.'],
      sources: targets.map((target) => ({ title: target.title, url: target.url, value: target.kind })),
      error: errors.join('; ') || undefined,
    }
  }

  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []

  for (const image of images) {
    const localOcr = await readImageTextLocally(image)
    const modelAnalysis = canAnalyzeImagesWithModel() ? await analyzeImage(image, marketCase) : undefined
    const analysisText = [
      image.visibleText ? `Rendered page text reads: ${truncateText(image.visibleText, 1800)}` : undefined,
      localOcr.ok && localOcr.text ? `Local OCR reads: ${localOcr.text}` : undefined,
      modelAnalysis?.ok ? `Vision model reads: ${modelAnalysis.text}` : undefined,
    ].filter(Boolean).join(' ')

    if (analysisText) {
      observations.push(`Visual analysis of ${image.target.title}: ${analysisText}`)
      sources.push({
        title: image.target.title,
        url: image.target.url,
        observedAt: image.observedAt,
        value: JSON.stringify({
          kind: image.target.kind,
          model: canAnalyzeImagesWithModel() ? visualModel : undefined,
          localOcr: localOcr.ok ? localOcr.text : undefined,
          renderedText: image.visibleText ? truncateText(image.visibleText, 1200) : undefined,
          analysis: analysisText,
        }),
      })
    } else {
      if (!localOcr.ok) errors.push(localOcr.error)
      if (modelAnalysis && !modelAnalysis.ok) errors.push(modelAnalysis.error)
      if (!canAnalyzeImagesWithModel()) errors.push('Vision-model analysis skipped; configure OPENROUTER_API_KEY and an OpenRouter vision model in HELIA_VISION_MODEL, or enable local OCR.')
    }
  }

  return {
    capability: 'visual_page_analysis',
    provider: getVisualProviderLabel(),
    query,
    fetchedAt,
    status: observations.length ? 'ok' : 'error',
    observations: observations.length ? observations : ['No visual analysis could be completed.'],
    sources,
    error: errors.length ? errors.join('; ') : undefined,
  }
}

async function discoverVisualTargets(marketCase: MarketCase): Promise<VisualTarget[]> {
  const suppliedUrls = extractUrls(`${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''}`)
  const suppliedTargets = suppliedUrls.map((url) => ({
    url,
    title: url,
    kind: isImageUrl(url) ? 'image-url' as const : 'page-screenshot' as const,
  }))
  const usableSuppliedTargets = dedupeTargets(suppliedTargets)
    .filter((target) => target.kind === 'image-url' || canScreenshotLocally())
    .sort((left, right) => scoreVisualTarget(right) - scoreVisualTarget(left))

  if (usableSuppliedTargets.length) {
    return usableSuppliedTargets.slice(0, maxVisualTargets)
  }

  const newsEvidence = await getNewsEvidence(marketCase).catch(() => undefined)
  const discoveredTargets = (newsEvidence?.sources ?? [])
    .filter((source) => source.url)
    .map((source) => ({
      url: source.url!,
      title: source.title,
      kind: isImageUrl(source.url!) ? 'image-url' as const : 'page-screenshot' as const,
    }))

  return dedupeTargets([...suppliedTargets, ...discoveredTargets])
    .filter((target) => target.kind === 'image-url' || canScreenshotLocally())
    .sort((left, right) => scoreVisualTarget(right) - scoreVisualTarget(left))
    .slice(0, maxVisualTargets)
}

function scoreVisualTarget(target: VisualTarget) {
  const haystack = `${target.title} ${target.url}`.toLowerCase()
  let score = target.kind === 'image-url' ? 8 : 0

  if (/\b(screenshot|image|photo|picture|chart|graph|map|video|watch|visual|tweet|post|market card|odds)\b/i.test(haystack)) score += 8
  if (/\b(official|whitehouse|fifa|youtube|vimeo|x\.com|twitter|instagram|tiktok|threads|facebook|polymarket|kalshi)\b/i.test(haystack)) score += 4
  if (/\b(analytics|price|terms|privacy|login|signup)\b/i.test(haystack)) score -= 4

  return score
}

async function screenshotPage(url: string): Promise<{ ok: true; dataUri: string; buffer: Buffer; visibleText?: string } | { ok: false; error: string }> {
  const browserWsEndpoint = process.env.BROWSERLESS_WS_ENDPOINT ?? process.env.PLAYWRIGHT_WS_ENDPOINT

  let browser: Awaited<ReturnType<(typeof import('playwright-core'))['chromium']['launch']>> | undefined
  let context: Awaited<ReturnType<NonNullable<typeof browser>['newContext']>> | undefined
  let page: Awaited<ReturnType<NonNullable<typeof context>['newPage']>> | undefined
  let userDataDir: string | undefined

  try {
    const { chromium } = await import('playwright-core')
    if (browserWsEndpoint) {
      browser = await chromium.connect(browserWsEndpoint)
      context = await browser.newContext({
        viewport: { width: screenshotViewportWidth, height: screenshotViewportHeight },
        userAgent: screenshotUserAgent,
      })
    } else {
      userDataDir = await mkdtemp(join(tmpdir(), 'helia-court-shot-'))
      context = await chromium.launchPersistentContext(userDataDir, {
          executablePath: localChromeExecutable,
          headless: true,
          viewport: { width: screenshotViewportWidth, height: screenshotViewportHeight },
          userAgent: screenshotUserAgent,
          args: ['--disable-gpu', '--disable-dev-shm-usage'],
        })
    }
    page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
    const visibleText = await page.locator('body').innerText({ timeout: 3_000 })
      .then((text) => text.replace(/\s+/g, ' ').trim())
      .catch(() => undefined)
    const screenshot = await page.screenshot({ type: 'png', fullPage: false })

    return { ok: true, dataUri: `data:image/png;base64,${screenshot.toString('base64')}`, buffer: screenshot, visibleText }
  } catch (error) {
    return { ok: false, error: `${url}: ${error instanceof Error ? error.message : 'screenshot failed'}` }
  } finally {
    await page?.close().catch(() => undefined)
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    if (userDataDir) await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function fetchImage(url: string): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.7',
        'user-agent': screenshotUserAgent,
      },
    })
    if (!response.ok) return { ok: false, error: `${url}: image fetch returned HTTP ${response.status}` }
    const arrayBuffer = await response.arrayBuffer()
    return { ok: true, buffer: Buffer.from(arrayBuffer) }
  } catch (error) {
    return { ok: false, error: `${url}: ${error instanceof Error ? error.message : 'image fetch failed'}` }
  }
}

async function readImageTextLocally(image: VisualImage): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (process.env.HELIA_ENABLE_LOCAL_OCR !== 'true') {
    return { ok: false, error: `${image.target.url}: local OCR is disabled; use vision-model analysis or enable HELIA_ENABLE_LOCAL_OCR=true with cached OCR assets.` }
  }
  if (!image.imageBuffer) return { ok: false, error: `${image.target.url}: no image buffer was available for OCR.` }

  try {
    const tesseract = await import('tesseract.js')
    const tesseractRuntime = (tesseract.default ?? tesseract) as {
      createWorker?: (language?: string, oem?: number, options?: { cachePath?: string }) => Promise<{
        recognize: (image: Buffer) => Promise<{ data?: { text?: string } }>
        terminate: () => Promise<unknown>
      }>
    }
    const createWorker = tesseractRuntime.createWorker
    if (typeof createWorker !== 'function') {
      return { ok: false, error: `${image.target.url}: local OCR runtime did not expose createWorker().` }
    }
    const worker = await createWorker('eng', 1, {
      cachePath: process.env.HELIA_OCR_CACHE_PATH ?? join(tmpdir(), 'helia-court-ocr-cache'),
    })
    try {
      const result = await withTimeout(worker.recognize(image.imageBuffer), localOcrTimeoutMs, `${image.target.url}: local OCR timed out after ${localOcrTimeoutMs}ms.`)
      const text = result.data?.text?.replace(/\s+/g, ' ').trim() ?? ''
      return text ? { ok: true, text } : { ok: false, error: `${image.target.url}: local OCR found no readable text.` }
    } finally {
      await worker.terminate().catch(() => undefined)
    }
  } catch (error) {
    return { ok: false, error: `${image.target.url}: ${error instanceof Error ? error.message : 'local OCR failed'}` }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function analyzeImage(image: VisualImage, marketCase: MarketCase): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
  if (!visualModel) return { ok: false, error: 'No vision model configured.' }
  const prompt = [
    'You are Eikon, a courtroom visual evidence witness.',
    'Read only what is visible in the image or page screenshot.',
    'Extract visible text, numbers, labels, chart axes, odds, timestamps, logos, and source identity.',
    'State what the visual does not prove. Do not infer hidden facts.',
    `Case question: ${marketCase.question}`,
    marketCase.context ? `Case context: ${marketCase.context}` : undefined,
    `Visual target: ${image.target.url}`,
  ].filter(Boolean).join('\n')

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(readPositiveIntegerEnv('HELIA_VISION_TIMEOUT_MS', 45_000)),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
        'X-Title': process.env.OPENROUTER_APP_NAME ?? 'Helia Court',
      },
      body: JSON.stringify({
        model: visualModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: image.imageUrl } },
            ],
          },
        ],
        temperature: 0,
      }),
    })
    const payload = (await response.json()) as OpenRouterVisionResponse
    if (!response.ok) return { ok: false, error: payload.error?.message ?? `Vision request failed with HTTP ${response.status}` }
    const text = payload.choices?.[0]?.message?.content?.replace(/\s+/g, ' ').trim()
    return text ? { ok: true, text } : { ok: false, error: 'Vision model returned no text.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Vision analysis failed.' }
  }
}

function extractUrls(value: string) {
  return [...value.matchAll(/https?:\/\/[^\s)\]}"'<>]+/gi)]
    .map((match) => match[0].replace(/[.,;:]+$/g, ''))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function isImageUrl(url: string) {
  return /(?:\.|\/)(png|jpe?g|gif|webp)(?:$|[/?#])/i.test(url)
}

function canScreenshotLocally() {
  return Boolean(process.env.BROWSERLESS_WS_ENDPOINT ?? process.env.PLAYWRIGHT_WS_ENDPOINT) || existsSync(localChromeExecutable)
}

function getVisualProviderLabel() {
  const providers = ['local-ocr']
  if (canScreenshotLocally()) providers.push('local-screenshot')
  if (canAnalyzeImagesWithModel()) providers.push('openrouter-vision')
  return providers.join('+')
}

function canAnalyzeImagesWithModel() {
  return Boolean(process.env.OPENROUTER_API_KEY && visualModel && visualModel.includes('/'))
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function dedupeTargets(targets: VisualTarget[]) {
  const seen = new Set<string>()
  const output: VisualTarget[] = []

  for (const target of targets) {
    if (seen.has(target.url)) continue
    seen.add(target.url)
    output.push(target)
  }

  return output
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}
