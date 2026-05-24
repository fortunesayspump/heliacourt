import { proxyBackendJson, readJsonBody } from '../../../../lib/backend-proxy'

export async function POST(request: Request) {
  return proxyBackendJson('/telegram/link-challenge', {
    method: 'POST',
    body: await readJsonBody(request),
    jsonFallback: { error: 'No Telegram link challenge data returned.' },
    unavailableMessage: 'Telegram link challenge is unavailable.',
  })
}
