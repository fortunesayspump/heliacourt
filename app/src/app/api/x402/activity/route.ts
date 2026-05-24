import { proxyBackendJson } from '../../../../lib/backend-proxy'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const caseId = url.searchParams.get('caseId')
  const path = caseId ? `/x402/activity?caseId=${encodeURIComponent(caseId)}` : '/x402/activity'

  return proxyBackendJson(path, {
    cache: 'no-store',
    jsonFallback: { error: 'No x402 activity returned.' },
    unavailableMessage: 'x402 activity is unavailable.',
    unavailablePayload: {
      totalPaidReads: 0,
      totalUsdc: '0',
      averageUsdc: '0',
      distinctPayers: 0,
      distinctCases: 0,
      latest: null,
      recent: [],
    },
  })
}
