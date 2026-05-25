import { NextResponse } from 'next/server'
import { proxyBackendJson } from '../../../../lib/backend-proxy'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.searchParams.toString()

  return proxyBackendJson(`/reputation/meta${query ? `?${query}` : ''}`, {
    jsonFallback: { error: 'No reputation metadata returned.' },
    unavailableMessage: 'Reputation metadata is unavailable.',
  })
}
