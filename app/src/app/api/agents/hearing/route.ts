import { NextResponse } from 'next/server'

type HearingRequest = {
  id?: string
  question?: string
  context?: string
  links?: string[]
  type?: 'crypto-market' | 'prediction-market' | 'macro' | 'real-world-event'
  filer?: `0x${string}`
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as HearingRequest
  const question = body.question?.trim()

  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000'
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/agents/hearing`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: body.id?.trim(),
      question,
      context: body.context?.trim() || undefined,
      links: body.links?.map((link) => link.trim()).filter(Boolean),
      type: body.type ?? 'prediction-market',
      filer: body.filer,
    }),
  })

  const payload = await response.json().catch(() => ({
    error: 'No hearing data returned.',
  }))

  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status })
  }

  return NextResponse.json(payload)
}
