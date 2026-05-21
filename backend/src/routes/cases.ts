import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { verifyMessage } from 'viem'
import { z } from 'zod'
import { enqueueHearingJob, listHearingJobs, retryOnchainSettlement } from '../agents/hearing-jobs.js'
import { env } from '../config/env.js'
import type { CaseType, CourtArtifact, MarketCase } from '../court/types.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { authChallenges, caseParticipants, users } from '../db/schema.js'

const createCaseSchema = z.object({
  id: z.string().trim().min(1).optional(),
  question: z.string().trim().min(1),
  context: z.string().trim().optional(),
  links: z.array(z.string().trim().url()).min(1),
  type: z.enum(['crypto-market', 'prediction-market', 'macro', 'real-world-event']).optional(),
  filer: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)).optional(),
  visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
  payerVisibility: z.enum(['public', 'private']).default('private'),
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
const walletSchema = z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value))
const signedCaseAccessSchema = z.object({
  wallet: walletSchema,
  auth: z.object({
    message: z.string().min(1),
    signature: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)),
  }),
})
const caseAccessChallengeSchema = z.object({
  wallet: walletSchema,
})
const CASE_READ_PURPOSE_PREFIX = 'case:read'
const CHALLENGE_TTL_MS = 5 * 60 * 1000

export async function caseRoutes(app: FastifyInstance) {
  app.get('/cases', async () => {
    const jobs = await listHearingJobs()

    return {
      cases: jobs
        .filter((job) => isPublicListCase(job))
        .map((job) => summarizeCase(job)),
    }
  })

  app.get('/cases/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string }
    const jobs = await listHearingJobs()
    const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)

    if (!job) {
      return reply.status(404).send({ error: 'case not found' })
    }

    if (getCaseVisibility(job) === 'private') {
      return reply.status(404).send({ error: 'case not found' })
    }

    const result = job.result as { artifacts?: CourtArtifact[]; transcript?: unknown[]; recordHash?: string; partial?: boolean; onchainSettlement?: unknown } | undefined

    return summarizeCaseDetail(job, result)
  })

  app.post('/cases/:caseId/challenge', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = caseAccessChallengeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid wallet' })

    const jobs = await listHearingJobs()
    const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)
    if (!job || getCaseVisibility(job) !== 'private') return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    const ownsCase = await isCaseParticipant({ caseId: job.marketCase.id, wallet })
    if (!ownsCase) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })

    await ensureUser(wallet)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS)
    const nonce = randomUUID()
    const message = buildCaseReadChallengeMessage({
      wallet,
      caseId: job.marketCase.id,
      nonce,
      issuedAt: now,
      expiresAt,
    })

    await db!
      .insert(authChallenges)
      .values({
        id: randomUUID(),
        wallet,
        nonce,
        message,
        purpose: caseReadPurpose(job.marketCase.id),
        expiresAt,
        createdAt: now,
      })

    return {
      wallet,
      caseId: job.marketCase.id,
      nonce,
      message,
      expiresAt: expiresAt.toISOString(),
    }
  })

  app.post('/cases/:caseId/private', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = signedCaseAccessSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid private case access request',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const jobs = await listHearingJobs()
    const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)
    if (!job || getCaseVisibility(job) !== 'private') return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    const ownsCase = await isCaseParticipant({ caseId: job.marketCase.id, wallet })
    if (!ownsCase) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })

    const authorized = await consumeCaseReadChallenge({
      wallet,
      caseId: job.marketCase.id,
      message: parsed.data.auth.message,
      signature: parsed.data.auth.signature,
    })
    if (!authorized.ok) return reply.status(401).send({ error: authorized.error })

    const result = job.result as { artifacts?: CourtArtifact[]; transcript?: unknown[]; recordHash?: string; partial?: boolean; onchainSettlement?: unknown } | undefined
    return summarizeCaseDetail(job, result)
  })

  app.get('/ledger', async () => {
    const jobs = await listHearingJobs()

    return {
      rows: jobs
        .filter((job) => isPublicListCase(job))
        .flatMap((job) => summarizeLedgerRows(job)),
    }
  })

  app.post('/cases/:caseId/settle', async (request, reply) => {
    const { caseId } = request.params as { caseId: string }

    try {
      const job = await retryOnchainSettlement(caseId)
      if (!job) return reply.status(404).send({ error: 'case not found' })

      const result = job.result as { onchainSettlement?: unknown } | undefined
      return {
        status: 'settlement-retried',
        case: summarizeCase(job),
        onchainSettlement: result?.onchainSettlement,
      }
    } catch (error) {
      return reply.status(409).send({
        error: error instanceof Error ? error.message : 'settlement retry failed',
      })
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
    const predictionMarketLink = data.links.find(isSupportedPredictionMarketLink)
    if (!predictionMarketLink) {
      return reply.status(400).send({
        error: 'prediction market link required',
        supportedMarkets: supportedPredictionMarketHosts,
      })
    }
    if (data.visibility === 'private' && !data.filer) {
      return reply.status(400).send({
        error: 'private cases require a filer wallet',
      })
    }

    const marketCase: MarketCase = {
      id: data.id ?? createCaseId(data.question, data.onchain?.caseId, data.onchain?.txHash),
      question: data.question,
      context: [
        data.context || undefined,
        `Prediction market: ${predictionMarketLink}`,
      ].filter(Boolean).join('\n\n'),
      links: data.links.filter(Boolean),
      type: 'prediction-market' as CaseType,
      filer: data.filer,
      visibility: data.visibility,
      payerVisibility: data.payerVisibility,
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

function summarizeCaseDetail(
  job: Awaited<ReturnType<typeof listHearingJobs>>[number],
  result: { artifacts?: CourtArtifact[]; transcript?: unknown[]; recordHash?: string; partial?: boolean; onchainSettlement?: unknown } | undefined,
) {
  return {
    case: summarizeCase(job),
    transcript: Array.isArray(result?.transcript) ? result.transcript : [],
    artifacts: Array.isArray(result?.artifacts) ? result.artifacts : [],
    recordHash: result?.recordHash,
    partial: Boolean(result?.partial),
    onchainSettlement: result?.onchainSettlement,
  }
}

function isPublicListCase(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  return getCaseVisibility(job) === 'public'
}

function getCaseVisibility(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  const result = job.result as { marketCase?: MarketCase } | undefined
  const marketCase = result?.marketCase ?? job.marketCase
  return marketCase.visibility ?? 'public'
}

async function isCaseParticipant({ caseId, wallet }: { caseId: string; wallet: string }) {
  if (!isDatabaseConfigured) return false
  const [participant] = await db!
    .select({ id: caseParticipants.id })
    .from(caseParticipants)
    .where(and(
      eq(caseParticipants.caseId, caseId),
      eq(caseParticipants.wallet, wallet),
    ))
    .limit(1)
  return Boolean(participant)
}

async function ensureUser(wallet: string) {
  const now = new Date()
  await db!
    .insert(users)
    .values({
      wallet,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: users.wallet,
      set: {
        lastSeenAt: now,
      },
    })
}

async function consumeCaseReadChallenge({
  wallet,
  caseId,
  message,
  signature,
}: {
  wallet: string
  caseId: string
  message: string
  signature: `0x${string}`
}) {
  const [challenge] = await db!
    .select()
    .from(authChallenges)
    .where(and(
      eq(authChallenges.wallet, wallet),
      eq(authChallenges.message, message),
      eq(authChallenges.purpose, caseReadPurpose(caseId)),
      isNull(authChallenges.consumedAt),
    ))
    .limit(1)

  if (!challenge) return { ok: false, error: 'case access challenge was not found or was already used' }
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: 'case access challenge expired' }

  const isValid = await verifyMessage({
    address: wallet as `0x${string}`,
    message,
    signature,
  }).catch(() => false)

  if (!isValid) return { ok: false, error: 'case access signature did not match the connected wallet' }

  await db!
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(authChallenges.id, challenge.id))

  return { ok: true }
}

function buildCaseReadChallengeMessage({
  wallet,
  caseId,
  nonce,
  issuedAt,
  expiresAt,
}: {
  wallet: string
  caseId: string
  nonce: string
  issuedAt: Date
  expiresAt: Date
}) {
  return [
    'Helia Court private case access',
    '',
    `Origin: ${env.APP_ORIGIN}`,
    `Wallet: ${wallet}`,
    `Case: ${caseId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    '',
    'Sign this message to unlock a private Helia Court case you are authorized to read. This does not send a transaction or spend gas.',
  ].join('\n')
}

function caseReadPurpose(caseId: string) {
  return `${CASE_READ_PURPOSE_PREFIX}:${caseId}`
}

function normalizeWallet(value: string) {
  return value.toLowerCase()
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
    links: marketCase.links ?? [],
    updated: job.updatedAt,
    createdAt: job.createdAt,
    resolution: marketCase.context,
    verdict: verdict?.summary ?? (job.status === 'failed' ? job.error : 'Hearing pending'),
    confidence: verdict?.confidence,
    receipt: result?.recordHash,
    probability: extractProbability(verdict),
    horizon: extractHorizon(marketCase),
    visibility: marketCase.visibility ?? 'public',
    payerVisibility: marketCase.payerVisibility ?? 'private',
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

const supportedPredictionMarketHosts = ['polymarket.com', 'kalshi.com', 'manifold.markets']

function isSupportedPredictionMarketLink(link: string) {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '').toLowerCase()
    return supportedPredictionMarketHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

function createCaseId(question: string, onchainCaseId?: string, txHash?: string) {
  if (txHash) return txHash
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
      totalPayoutUsdc?: string
      capped?: boolean
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

  if (result?.onchainSettlement?.totalPayoutUsdc) {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: 'Agent payouts',
      amount: `${result.onchainSettlement.totalPayoutUsdc} USDC`,
      status: result.onchainSettlement.status === 'recorded' ? 'Recorded' : 'Pending',
      hash: result.recordHash,
      updated: job.updatedAt,
      chainId: marketCase.onchain?.chainId,
      receiptType: 'agent-payout-summary',
    })
  }

  if (marketCase.onchain && result?.onchainSettlement?.status === 'recorded') {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: 'Protocol fee',
      amount: `${formatProtocolFee(marketCase.onchain.budgetUsdc)} USDC`,
      status: 'Recorded',
      hash: result.onchainSettlement.receipts?.find((receipt) => receipt.type === 'case-close')?.txHash,
      updated: job.updatedAt,
      chainId: marketCase.onchain.chainId,
      receiptType: 'protocol-fee',
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

function formatProtocolFee(budgetUsdc: string) {
  const budget = Number(budgetUsdc)
  if (!Number.isFinite(budget)) return '0.00'
  return (budget * 0.05).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
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
