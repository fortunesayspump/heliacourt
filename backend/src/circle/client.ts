import { env } from '../config/env.js'

type CircleRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
}

export async function circleRequest<T>({ method = 'GET', path, body }: CircleRequestOptions): Promise<T> {
  if (!env.CIRCLE_API_KEY) {
    throw new Error('CIRCLE_API_KEY is not configured')
  }

  const response = await fetch(new URL(path, env.CIRCLE_API_BASE_URL), {
    method,
    headers: {
      Authorization: `Bearer ${env.CIRCLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Circle API ${response.status}: ${detail}`)
  }

  return response.json() as Promise<T>
}
