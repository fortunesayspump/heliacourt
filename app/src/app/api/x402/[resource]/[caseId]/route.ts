import { NextRequest, NextResponse } from 'next/server'

const allowedResources = new Set(['price', 'transcript', 'receipts', 'proof'])
const forwardedHeaders = ['accept-payment', 'payment-required', 'payment-response', 'x-payment-challenge']

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string; caseId: string }> },
) {
  const { resource, caseId } = await context.params
  if (!allowedResources.has(resource)) {
    return NextResponse.json({ error: 'Unsupported x402 resource.' }, { status: 404 })
  }

  const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')
  const headers = new Headers()
  const paymentSignature = request.headers.get('payment-signature')
  const legacyPayment = request.headers.get('x-payment')
  const challenge = request.headers.get('x-payment-challenge')

  if (paymentSignature) headers.set('payment-signature', paymentSignature)
  if (legacyPayment) headers.set('x-payment', legacyPayment)
  if (challenge) headers.set('x-payment-challenge', challenge)

  try {
    const response = await fetch(`${backendUrl}/x402/${resource}/${encodeURIComponent(caseId)}`, {
      cache: 'no-store',
      headers,
    })
    const body = await response.text()
    const nextHeaders = new Headers({
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    })

    for (const name of forwardedHeaders) {
      const value = response.headers.get(name)
      if (value) nextHeaders.set(name, value)
    }

    return new NextResponse(body, {
      status: response.status,
      headers: nextHeaders,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'x402 route unavailable.',
    }, { status: 502 })
  }
}
