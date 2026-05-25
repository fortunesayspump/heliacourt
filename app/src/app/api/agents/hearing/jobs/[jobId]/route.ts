import { NextResponse } from 'next/server'
import { proxyBackendJson } from '../../../../../../lib/backend-proxy'

type RouteContext = {
  params: Promise<{ jobId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const cleanJobId = jobId.trim()

  if (!cleanJobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  return proxyBackendJson(`/agents/hearing/jobs/${encodeURIComponent(cleanJobId)}`, {
    jsonFallback: { error: 'No hearing job data returned.' },
    unavailableMessage: 'Hearing job data is unavailable.',
  })
}
