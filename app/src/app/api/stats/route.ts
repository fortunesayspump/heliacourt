import { NextResponse } from 'next/server'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET() {
  try {
    const response = await fetch(`${backendUrl}/stats`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ error: 'No stats returned.' }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Stats are unavailable.',
    }, { status: 502 })
  }
}
