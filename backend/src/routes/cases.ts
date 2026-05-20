import type { FastifyInstance } from 'fastify'
import { listHearingJobs } from '../agents/hearing-jobs.js'
import type { CourtArtifact, MarketCase } from '../court/types.js'

export async function caseRoutes(app: FastifyInstance) {
  app.get('/cases', async () => {
    const jobs = await listHearingJobs()

    return {
      cases: jobs.map((job) => summarizeCase(job)),
    }
  })

  app.get('/ledger', async () => {
    const jobs = await listHearingJobs()

    return {
      rows: jobs
        .map((job) => summarizeLedgerRow(job))
        .filter((row): row is NonNullable<ReturnType<typeof summarizeLedgerRow>> => Boolean(row)),
    }
  })

  app.post('/cases', async () => ({
    status: 'draft',
    message: 'Case creation endpoint reserved for escrow and Arc receipt wiring.',
  }))
}

function summarizeCase(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  const result = job.result as { marketCase?: MarketCase; artifacts?: CourtArtifact[]; recordHash?: string; partial?: boolean } | undefined
  const marketCase = result?.marketCase ?? job.marketCase
  const verdict = findLastArtifact(result?.artifacts, (artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')
  const status = job.status === 'completed'
    ? 'Verdict'
    : job.status === 'running'
      ? 'Hearing'
      : job.status === 'queued'
        ? 'Queued'
        : 'Failed'

  return {
    id: marketCase.id,
    jobId: job.id,
    title: marketCase.question,
    status,
    market: marketCase.type,
    updated: job.updatedAt,
    createdAt: job.createdAt,
    resolution: marketCase.context,
    verdict: verdict?.summary ?? (job.status === 'failed' ? job.error : 'Hearing pending'),
    confidence: verdict?.confidence,
    receipt: result?.recordHash,
    probability: extractProbability(verdict),
    horizon: extractHorizon(marketCase),
    witnesses: result?.artifacts
      ? Array.from(new Set(result.artifacts.filter((artifact) => artifact.type === 'witness-testimony').map((artifact) => artifact.agentId)))
      : [],
  }
}

function summarizeLedgerRow(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  const result = job.result as { marketCase?: MarketCase; artifacts?: CourtArtifact[]; recordHash?: string; partial?: boolean } | undefined
  const marketCase = result?.marketCase ?? job.marketCase
  const settlement = findLastArtifact(result?.artifacts, (artifact) => artifact.agentId === 'settlement-clerk')
  const verdict = findLastArtifact(result?.artifacts, (artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')

  if (!result?.recordHash && !settlement && !verdict) return undefined

  return {
    caseId: marketCase.id,
    title: marketCase.question,
    item: settlement ? 'Settlement receipt' : 'Verdict record',
    amount: settlement?.costUsd ? `${settlement.costUsd.toFixed(2)} USDC` : 'Pending',
    status: result?.recordHash ? 'Recorded' : job.status,
    hash: result?.recordHash,
    updated: job.updatedAt,
  }
}

function extractProbability(verdict: CourtArtifact | undefined) {
  const text = `${verdict?.summary ?? ''} ${verdict?.transcriptMessage ?? ''}`
  const range = text.match(/\b(\d{1,2}(?:\.\d+)?)\s*-\s*(\d{1,2}(?:\.\d+)?)\s*%/)
  if (range) return `${range[1]}-${range[2]}%`
  const tail = text.match(/\b(\d{1,2}(?:\.\d+)?)\s*%\s+(?:tail|yes|chance|probability)\b/i)
  return tail ? `${tail[1]}%` : undefined
}

function findLastArtifact(artifacts: CourtArtifact[] | undefined, predicate: (artifact: CourtArtifact) => boolean) {
  if (!artifacts?.length) return undefined

  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    if (predicate(artifacts[index])) return artifacts[index]
  }

  return undefined
}

function extractHorizon(marketCase: MarketCase) {
  const text = `${marketCase.question} ${marketCase.context ?? ''}`
  const date = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/i)
  if (date) return date[0]
  const relative = text.match(/\b\d+\s*(?:hours?|days?|weeks?|months?)\b/i)
  return relative?.[0] ?? 'Open'
}
