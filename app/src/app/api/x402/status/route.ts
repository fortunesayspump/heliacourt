import { proxyBackendJson } from '../../../../lib/backend-proxy'

export async function GET() {
  return proxyBackendJson('/x402/status', {
    cache: 'no-store',
    jsonFallback: { error: 'No x402 status returned.' },
    unavailableMessage: 'x402 status is unavailable.',
    unavailablePayload: {
      enabled: false,
      settlement: 'unavailable',
    },
  })
}
