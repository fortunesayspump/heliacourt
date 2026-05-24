import { proxyBackendJson } from '../../../lib/backend-proxy'

export async function GET() {
  return proxyBackendJson('/ledger', {
    cache: 'no-store',
    jsonFallback: { rows: [] },
    unavailableMessage: 'Ledger data is unavailable.',
    unavailablePayload: { rows: [] },
    unavailableStatus: 200,
  })
}
