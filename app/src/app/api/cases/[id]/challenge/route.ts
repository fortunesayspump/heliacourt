import { proxyBackendJson, readJsonBody } from '../../../../../lib/backend-proxy'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return proxyBackendJson(`/cases/${encodeURIComponent(id)}/challenge`, {
    method: 'POST',
    body: await readJsonBody(request),
    jsonFallback: { error: 'No challenge data returned.' },
    unavailableMessage: 'Challenge data is unavailable.',
  })
}
