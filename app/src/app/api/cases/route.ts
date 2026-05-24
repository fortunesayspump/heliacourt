import { proxyBackendJson, readJsonBody } from '../../../lib/backend-proxy'

export async function GET() {
  return proxyBackendJson('/cases', {
    cache: 'no-store',
    jsonFallback: { cases: [] },
    unavailableMessage: 'Case data is unavailable.',
    unavailablePayload: { cases: [] },
    unavailableStatus: 200,
  })
}

export async function POST(request: Request) {
  return proxyBackendJson('/cases', {
    method: 'POST',
    body: await readJsonBody(request),
    jsonFallback: { error: 'No case data returned.' },
    unavailableMessage: 'Case data is unavailable.',
  })
}
