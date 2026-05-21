import { NextResponse } from 'next/server'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET() {
  try {
    const response = await fetch(`${backendUrl}/cases`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ cases: [] }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      cases: [],
      error: error instanceof Error ? error.message : 'backend unavailable',
    })
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  try {
    const response = await fetch(`${backendUrl}/cases`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({
      error: 'backend returned a non-json response',
    }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'backend unavailable',
    }, { status: 502 })
  }
}
