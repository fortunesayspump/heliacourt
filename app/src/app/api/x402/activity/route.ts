import { NextResponse } from 'next/server'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET(request: Request) {
  const url = new URL(request.url)
  const caseId = url.searchParams.get('caseId')
  const path = caseId ? `/x402/activity?caseId=${encodeURIComponent(caseId)}` : '/x402/activity'

  try {
    const response = await fetch(`${backendUrl}${path}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ error: 'No x402 activity returned.' }))
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      totalPaidReads: 0,
      totalUsdc: '0',
      averageUsdc: '0',
      distinctPayers: 0,
      distinctCases: 0,
      latest: null,
      recent: [],
      error: error instanceof Error ? error.message : 'x402 activity is unavailable.',
    }, { status: 502 })
  }
}
