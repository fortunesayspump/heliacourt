import { NextResponse } from 'next/server'
import { resolveMarketImageUrl } from '../../../lib/market-images'

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

  const image = await resolveMarketImageUrl([target.toString()], params.get('title') ?? undefined)
  return NextResponse.json({
    url: target.toString(),
    host: target.hostname.replace(/^www\./, ''),
    image,
  })
}
