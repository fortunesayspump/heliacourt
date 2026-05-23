import { NextResponse } from 'next/server'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  try {
    const response = await fetch(`${backendUrl}/cases/${encodeURIComponent(id)}/challenge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({ error: 'No challenge data returned.' }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Challenge data is unavailable.',
    }, { status: 502 })
  }
}
