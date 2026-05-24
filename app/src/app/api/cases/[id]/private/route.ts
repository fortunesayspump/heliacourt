import { proxyBackendJson, readJsonBody } from '../../../../../lib/backend-proxy'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return proxyBackendJson(`/cases/${encodeURIComponent(id)}/private`, {
    method: 'POST',
    body: await readJsonBody(request),
    jsonFallback: { error: 'No private case data returned.' },
    unavailableMessage: 'Private case data is unavailable.',
  })
}
