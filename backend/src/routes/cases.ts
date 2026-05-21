import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { enqueueHearingJob, listHearingJobs } from '../agents/hearing-jobs.js'
import type { CaseType, CourtArtifact, MarketCase } from '../court/types.js'

const createCaseSchema = z.object({
  id: z.string().trim().min(1).optional(),
  question: z.string().trim().min(1),
  context: z.string().trim().optional(),
  links: z.array(z.string().trim().url()).optional(),
  type: z.enum(['crypto-market', 'prediction-market', 'macro', 'real-world-event']).optional(),
  filer: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)).optional(),
  onchain: z.object({
    chainId: z.string().trim().min(1),
    escrowAddress: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)),
    caseId: z.string().trim().min(1),
    txHash: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)),
    budgetUsdc: z.string().trim().min(1),
    questionHash: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)),
    metadataURI: z.string().trim().optional(),
  }).optional(),
})

export async function caseRoutes(app: FastifyInstance) {
  app.get('/cases', async () => {
    const jobs = await listHearingJobs()

    return {
      cases: jobs.map((job) => summarizeCase(job)),
    }
  })

  app.get('/cases/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string }
    const jobs = await listHearingJobs()
    const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)

    if (!job) {
      return reply.status(404).send({ error: 'case not found' })
    }

    const result = job.result as { artifacts?: CourtArtifact[]; transcript?: unknown[]; recordHash?: string; partial?: boolean; onchainSettlement?: unknown } | undefined

    return {
      case: summarizeCase(job),
      transcript: Array.isArray(result?.transcript) ? result.transcript : [],
      artifacts: Array.isArray(result?.artifacts) ? result.artifacts : [],
      recordHash: result?.recordHash,
      partial: Boolean(result?.partial),
      onchainSettlement: result?.onchainSettlement,
    }
  })

  app.get('/ledger', async () => {
    const jobs = await listHearingJobs()

    return {
      rows: jobs
        .flatMap((job) => summarizeLedgerRows(job)),
    }
  })

  app.post('/cases', async (request, reply) => {
    const parsed = createCaseSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid case filing',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const data = parsed.data
    const marketCase: MarketCase = {
      id: data.id ?? createCaseId(data.question, data.onchain?.caseId),
      question: data.question,
      context: data.context || undefined,
      links: data.links?.filter(Boolean),
      type: (data.type ?? 'prediction-market') as CaseType,
      filer: data.filer,
      onchain: data.onchain,
      createdAt: new Date().toISOString(),
    }
    const job = await enqueueHearingJob(marketCase)

    return reply.status(202).send({
      status: 'queued',
      case: summarizeCase(job),
      job,
    })
  })
}

function summarizeCase(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  const result = job.result as { marketCase?: MarketCase; artifacts?: CourtArtifact[]; recordHash?: string; partial?: boolean; onchainSettlement?: { status?: string; totalPayoutUsdc?: string; capped?: boolean } } | undefined
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
    onchain: marketCase.onchain,
    onchainSettlement: result?.onchainSettlement
      ? {
          status: result.onchainSettlement.status,
          totalPayoutUsdc: result.onchainSettlement.totalPayoutUsdc,
          capped: result.onchainSettlement.capped,
        }
      : undefined,
  }
}

function createCaseId(question: string, onchainCaseId?: string) {
  if (onchainCaseId) return `arc-${onchainCaseId}`

  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

  return `${slug || 'case'}-${Date.now()}`
}

function summarizeLedgerRows(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  const result = job.result as {
    marketCase?: MarketCase
    artifacts?: CourtArtifact[]
    recordHash?: string
    partial?: boolean
    onchainSettlement?: {
      status?: string
      reason?: string
      receipts?: Array<{
        type: string
        txHash: string
        chainId: string
        caseId: string
        recordHash?: string
        amountUsdc?: string
        agentId?: string
        wallet?: string
      }>
    }
  } | undefined
  const marketCase = result?.marketCase ?? job.marketCase
  const settlement = findLastArtifact(result?.artifacts, (artifact) => artifact.agentId === 'settlement-clerk')
  const verdict = findLastArtifact(result?.artifacts, (artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')
  const rows = []

  if (marketCase.onchain) {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: 'Case funding',
      amount: `${marketCase.onchain.budgetUsdc} USDC`,
      status: job.status === 'failed' ? 'Funded' : 'Opened',
      hash: marketCase.onchain.txHash,
      updated: job.updatedAt,
      chainId: marketCase.onchain.chainId,
      txHash: marketCase.onchain.txHash,
      receiptType: 'case-funding',
    })
  }

  for (const receipt of result?.onchainSettlement?.receipts ?? []) {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: formatReceiptType(receipt.type, receipt.agentId),
      amount: receipt.amountUsdc ? `${receipt.amountUsdc} USDC` : receipt.type === 'case-close' ? 'Closed' : 'Recorded',
      status: 'Anchored',
      hash: receipt.txHash,
      updated: job.updatedAt,
      chainId: receipt.chainId,
      txHash: receipt.txHash,
      receiptType: receipt.type,
      agentId: receipt.agentId,
      wallet: receipt.wallet,
    })
  }

  if (rows.length) return rows
  if (!result?.recordHash && !settlement && !verdict) return []

  return [{
    caseId: marketCase.id,
    title: marketCase.question,
    item: settlement ? 'Settlement plan' : 'Verdict record',
    amount: settlement?.costUsd ? `${settlement.costUsd.toFixed(2)} USDC` : 'Pending',
    status: result?.recordHash ? 'Recorded' : job.status,
    hash: result?.recordHash,
    updated: job.updatedAt,
    receiptType: settlement ? 'settlement-plan' : 'verdict-record',
  }]
}

function formatReceiptType(type: string, agentId?: string) {
  if (type === 'agent-payout') return agentId ? `Agent payout · ${agentId}` : 'Agent payout'
  if (type === 'case-event') return 'Hearing record'
  if (type === 'case-close') return 'Escrow close'
  return type
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
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
