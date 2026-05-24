import { NextResponse } from 'next/server'

export const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

type ProxyOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  cache?: RequestCache
  jsonFallback: unknown
  unavailableMessage: string
  unavailablePayload?: Record<string, unknown>
  unavailableStatus?: number
}

export async function readJsonBody(request: Request) {
  return request.json().catch(() => ({}))
}

export async function proxyBackendJson(path: string, {
  method = 'GET',
  body,
  cache,
  jsonFallback,
  unavailableMessage,
  unavailablePayload,
  unavailableStatus = 502,
}: ProxyOptions) {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method,
      cache,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json().catch(() => jsonFallback)

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      ...unavailablePayload,
      error: error instanceof Error ? error.message : unavailableMessage,
    }, { status: unavailableStatus })
  }
}
