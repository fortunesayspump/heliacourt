import { proxyBackendJson } from '../../../../lib/backend-proxy'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return proxyBackendJson(`/cases/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    jsonFallback: { error: 'No case data returned.' },
    unavailableMessage: 'Case data is unavailable.',
  })
}
