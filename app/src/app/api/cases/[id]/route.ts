import { NextResponse } from 'next/server'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const response = await fetch(`${backendUrl}/cases/${encodeURIComponent(id)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({
      error: 'No case data returned.',
    }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Case data is unavailable.',
    }, { status: 502 })
  }
}
