import { NextResponse } from 'next/server'
import { proxyBackendJson } from '../../../../../lib/backend-proxy'

type HearingJobRequest = {
  id?: string
  question?: string
  context?: string
  links?: string[]
  imageUrl?: string
  type?: 'crypto-market' | 'prediction-market' | 'macro' | 'real-world-event'
  filer?: `0x${string}`
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as HearingJobRequest
  const question = body.question?.trim()

  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  return proxyBackendJson('/agents/hearing/jobs', {
    method: 'POST',
    body: {
      id: body.id?.trim(),
      question,
      context: body.context?.trim() || undefined,
      links: body.links?.map((link) => link.trim()).filter(Boolean),
      imageUrl: body.imageUrl?.trim() || undefined,
      type: body.type ?? 'prediction-market',
      filer: body.filer,
    },
    jsonFallback: { error: 'No hearing job data returned.' },
    unavailableMessage: 'Hearing job data is unavailable.',
  })
}
