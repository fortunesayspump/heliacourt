import { proxyBackendJson, readJsonBody } from '../../../lib/backend-proxy'
import { getBackendCases } from '../../../lib/backend-data'

export async function GET() {
  return Response.json({ cases: await getBackendCases() })
}

export async function POST(request: Request) {
  return proxyBackendJson('/cases', {
    method: 'POST',
    body: await readJsonBody(request),
    jsonFallback: { error: 'No case data returned.' },
    unavailableMessage: 'Case data is unavailable.',
  })
}
