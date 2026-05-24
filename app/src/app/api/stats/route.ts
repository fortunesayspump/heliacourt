import { proxyBackendJson } from '../../../lib/backend-proxy'

export async function GET() {
  return proxyBackendJson('/stats', {
    cache: 'no-store',
    jsonFallback: { error: 'No stats returned.' },
    unavailableMessage: 'Stats are unavailable.',
  })
}
