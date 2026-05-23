import { NextResponse } from 'next/server'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET() {
  try {
    const response = await fetch(`${backendUrl}/x402/status`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ error: 'No x402 status returned.' }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      enabled: false,
      settlement: 'unavailable',
      error: error instanceof Error ? error.message : 'x402 status is unavailable.',
    }, { status: 502 })
  }
}
