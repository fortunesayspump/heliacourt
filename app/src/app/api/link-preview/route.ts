import { NextResponse } from 'next/server'
import { resolveMarketPreview } from '../../../lib/market-images'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const rawUrl = params.get('url')
  if (!rawUrl) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return NextResponse.json({ error: 'unsupported url protocol' }, { status: 400 })
  }

  try {
    const marketPreview = await resolveMarketPreview([target.toString()], params.get('title') ?? undefined)
    if (marketPreview?.image || marketPreview?.title) {
      return NextResponse.json({
        url: target.toString(),
        host: target.hostname.replace(/^www\./, ''),
        title: marketPreview.title,
        image: marketPreview.image,
      })
    }

    const response = await fetch(target, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'HeliaCourtBot/1.0 (+https://heliacourt.xyz)',
      },
      signal: AbortSignal.timeout(5000),
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) {
      return NextResponse.json({ url: target.toString(), host: target.hostname.replace(/^www\./, '') })
    }

    const html = await response.text()
    const title = readMeta(html, 'og:title') ?? readTitle(html)
    const description = readMeta(html, 'og:description') ?? readMeta(html, 'description')
    const image = absolutizeUrl(readMeta(html, 'og:image') ?? readMeta(html, 'twitter:image'), target)

    return NextResponse.json({
      url: target.toString(),
      host: target.hostname.replace(/^www\./, ''),
      title,
      description,
      image,
    })
  } catch {
    return NextResponse.json({ url: target.toString(), host: target.hostname.replace(/^www\./, '') })
  }
}

function readMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const propertyPattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
  const contentFirstPattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  return decodeHtml(propertyPattern.exec(html)?.[1] ?? contentFirstPattern.exec(html)?.[1])
}

function readTitle(html: string) {
  return decodeHtml(/<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1])
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

function absolutizeUrl(value: string | undefined, base: URL) {
  if (!value) return undefined
  try {
    return new URL(value, base).toString()
  } catch {
    return undefined
  }
}
