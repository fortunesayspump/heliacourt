import { proxyBackendJson, readJsonBody } from '../../../../../lib/backend-proxy'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return proxyBackendJson(`/cases/${encodeURIComponent(id)}/follow-challenge`, {
    method: 'POST',
    body: await readJsonBody(request),
    jsonFallback: { error: 'No follow data returned.' },
    unavailableMessage: 'Follow data is unavailable.',
  })
}
