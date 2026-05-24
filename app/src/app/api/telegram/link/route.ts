import { proxyBackendJson, readJsonBody } from '../../../../lib/backend-proxy'

export async function POST(request: Request) {
  return proxyBackendJson('/telegram/link', {
    method: 'POST',
    body: await readJsonBody(request),
    jsonFallback: { error: 'No Telegram link data returned.' },
    unavailableMessage: 'Telegram link is unavailable.',
  })
}
