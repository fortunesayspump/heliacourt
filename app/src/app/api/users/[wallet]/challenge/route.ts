import { proxyBackendJson } from '../../../../../lib/backend-proxy'

export async function POST(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params

  return proxyBackendJson(`/users/${encodeURIComponent(wallet)}/challenge`, {
    method: 'POST',
    cache: 'no-store',
    jsonFallback: { error: 'No wallet data returned.' },
    unavailableMessage: 'Wallet data is unavailable.',
  })
}
