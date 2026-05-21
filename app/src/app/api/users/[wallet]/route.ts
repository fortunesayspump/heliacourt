import { NextResponse } from 'next/server'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params

  try {
    const response = await fetch(`${backendUrl}/users/${encodeURIComponent(wallet)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ error: 'backend returned a non-json response' }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'backend unavailable',
    }, { status: 502 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params
  const body = await request.json().catch(() => ({}))

  try {
    const response = await fetch(`${backendUrl}/users/${encodeURIComponent(wallet)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({ error: 'backend returned a non-json response' }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'backend unavailable',
    }, { status: 502 })
  }
}
