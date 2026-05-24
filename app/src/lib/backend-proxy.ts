import { NextResponse } from 'next/server'
import { backendUrl } from './backend-url'

export { backendUrl }

type ProxyOptions = {
  method?: 'GET' | 'POST' | 'PUT'
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

export async function fetchBackendJson(path: string, {
  method = 'GET',
  body,
  cache,
  jsonFallback,
}: ProxyOptions) {
  const response = await fetch(`${backendUrl}${path}`, {
    method,
    cache,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => jsonFallback)

  return { response, payload }
}

export async function proxyBackendJson(path: string, options: ProxyOptions) {
  try {
    const { response, payload } = await fetchBackendJson(path, options)

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      ...options.unavailablePayload,
      error: error instanceof Error ? error.message : options.unavailableMessage,
    }, { status: options.unavailableStatus ?? 502 })
  }
}
