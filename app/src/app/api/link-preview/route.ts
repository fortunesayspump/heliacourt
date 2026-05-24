import { NextResponse } from 'next/server'
import { resolveMarketPreview, resolveOpenGraphPreview } from '../../../lib/market-images'

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
    const ogPreview = await resolveOpenGraphPreview(target)
    if (ogPreview?.image || ogPreview?.title) {
      return NextResponse.json({
        url: target.toString(),
        host: target.hostname.replace(/^www\./, ''),
        title: ogPreview.title,
        description: ogPreview.description,
        image: ogPreview.image,
      })
    }

    const marketPreview = await resolveMarketPreview([target.toString()], params.get('title') ?? undefined)
    return NextResponse.json({
      url: target.toString(),
      host: target.hostname.replace(/^www\./, ''),
      title: marketPreview?.title,
      description: marketPreview?.description,
      image: marketPreview?.image,
    })
  } catch {
    return NextResponse.json({ url: target.toString(), host: target.hostname.replace(/^www\./, '') })
  }
}
