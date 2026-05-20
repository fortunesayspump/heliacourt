import { NextResponse } from 'next/server'

export async function GET() {
  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000'

  try {
    const response = await fetch(`${backendUrl.replace(/\/$/, '')}/cases`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ cases: [] }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      cases: [],
      error: error instanceof Error ? error.message : 'backend unavailable',
    })
  }
}
