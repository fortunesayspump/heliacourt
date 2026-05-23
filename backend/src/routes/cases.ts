import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createPublicClient, formatUnits, http, parseEventLogs, parseUnits, verifyMessage } from 'viem'
import { z } from 'zod'
import { enqueueHearingJob, listHearingJobs, retryOnchainSettlement } from '../agents/hearing-jobs.js'
import { arcTestnet } from '../chains/arc-testnet.js'
import { env } from '../config/env.js'
import type { CaseType, CourtArtifact, MarketCase } from '../court/types.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { authChallenges, caseFollows, caseParticipants, onchainReceipts, users } from '../db/schema.js'

const createCaseSchema = z.object({
  id: z.string().trim().min(1).optional(),
  question: z.string().trim().min(1),
  context: z.string().trim().optional(),
  links: z.array(z.string().trim().url()).min(1),
  imageUrl: z.string().trim().url().optional(),
  type: z.enum(['crypto-market', 'prediction-market', 'macro', 'real-world-event']).optional(),
  parentCaseId: z.string().trim().min(1).optional(),
  filingKind: z.enum(['original', 'fresh-hearing', 'private-fork']).default('original'),
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
  }),
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
const addFundingReceiptSchema = z.object({
  wallet: walletSchema,
  chainId: z.string().trim().min(1),
  txHash: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)),
  amountUsdc: z.string().trim().min(1).optional(),
})
const CASE_READ_PURPOSE_PREFIX = 'case:read'
const CASE_FOLLOW_PURPOSE_PREFIX = 'case:follow'
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const usdcDecimals = 6
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(env.ARC_RPC_URL),
})
const caseEscrowFundingAbi = [
  {
    type: 'event',
    name: 'CaseOpened',
    inputs: [
      { name: 'caseId', type: 'uint256', indexed: true },
      { name: 'petitioner', type: 'address', indexed: true },
      { name: 'budget', type: 'uint96', indexed: false },
      { name: 'questionHash', type: 'bytes32', indexed: false },
      { name: 'metadataURI', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CaseFunded',
    inputs: [
      { name: 'caseId', type: 'uint256', indexed: true },
      { name: 'funder', type: 'address', indexed: true },
      { name: 'amount', type: 'uint96', indexed: false },
    ],
  },
] as const

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

    return await summarizeCaseDetail(job, result)
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
    return await summarizeCaseDetail(job, result)
  })

  app.post('/cases/:caseId/follow-challenge', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = caseAccessChallengeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid wallet' })

    const jobs = await listHearingJobs()
    const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)
    if (!job) return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    if (getCaseVisibility(job) === 'private') {
      const ownsCase = await isCaseParticipant({ caseId: job.marketCase.id, wallet })
      if (!ownsCase) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })
    }

    await ensureUser(wallet)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS)
    const nonce = randomUUID()
    const message = buildCaseFollowChallengeMessage({
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
        purpose: caseFollowPurpose(job.marketCase.id),
        expiresAt,
        createdAt: now,
      })

    const following = await isFollowingCase({ caseId: job.marketCase.id, wallet })

    return {
      wallet,
      caseId: job.marketCase.id,
      following,
      nonce,
      message,
      expiresAt: expiresAt.toISOString(),
    }
  })

  app.post('/cases/:caseId/follow', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = signedCaseAccessSchema.extend({ following: z.boolean().default(true) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid follow request',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const jobs = await listHearingJobs()
    const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)
    if (!job) return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    if (getCaseVisibility(job) === 'private') {
      const ownsCase = await isCaseParticipant({ caseId: job.marketCase.id, wallet })
      if (!ownsCase) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })
    }

    const authorized = await consumeCaseActionChallenge({
      wallet,
      caseId: job.marketCase.id,
      purpose: caseFollowPurpose(job.marketCase.id),
      message: parsed.data.auth.message,
      signature: parsed.data.auth.signature,
      missingError: 'case follow challenge was not found or was already used',
      expiredError: 'case follow challenge expired',
      invalidError: 'case follow signature did not match the connected wallet',
    })
    if (!authorized.ok) return reply.status(401).send({ error: authorized.error })

    await ensureUser(wallet)
    if (parsed.data.following) {
      await db!
        .insert(caseFollows)
        .values({
          id: `${job.marketCase.id}:${wallet}`,
          caseId: job.marketCase.id,
          wallet,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
    } else {
      await db!
        .delete(caseFollows)
        .where(and(
          eq(caseFollows.caseId, job.marketCase.id),
          eq(caseFollows.wallet, wallet),
        ))
    }

    return {
      caseId: job.marketCase.id,
      wallet,
      following: parsed.data.following,
    }
  })

  app.post('/cases/:caseId/funding', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = addFundingReceiptSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid funding receipt',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const jobs = await listHearingJobs()
    const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)
    if (!job) return reply.status(404).send({ error: 'case not found' })
    if (!job.marketCase.onchain) return reply.status(400).send({ error: 'case has no onchain escrow record' })
    if (String(env.ARC_CHAIN_ID) !== parsed.data.chainId || parsed.data.chainId !== job.marketCase.onchain.chainId) {
      return reply.status(400).send({ error: 'funding receipt chain does not match the case chain' })
    }

    const wallet = normalizeWallet(parsed.data.wallet)
    const verified = await verifyCaseFundingReceipt({
      txHash: parsed.data.txHash,
      wallet,
      onchainCaseId: job.marketCase.onchain.caseId,
      escrowAddress: job.marketCase.onchain.escrowAddress,
      expectedAmountUsdc: parsed.data.amountUsdc,
    }).catch((error) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : 'funding receipt verification failed',
    }))
    if (!verified.ok) return reply.status(400).send({ error: verified.error })

    const now = new Date()
    await ensureUser(wallet)
    await db!
      .insert(caseParticipants)
      .values({
        id: `${job.marketCase.id}:${wallet}:backer`,
        caseId: job.marketCase.id,
        wallet,
        role: 'backer',
        createdAt: now,
      })
      .onConflictDoNothing()

    const payload = {
      type: 'case-added-funding',
      wallet,
      amountUsdc: verified.amountUsdc,
      onchainCaseId: job.marketCase.onchain.caseId,
    }
    await db!
      .insert(onchainReceipts)
      .values({
        id: `${job.id}:case-added-funding:${parsed.data.txHash}`,
        caseId: job.marketCase.id,
        jobId: job.id,
        chainId: parsed.data.chainId,
        txHash: parsed.data.txHash,
        receiptType: 'case-added-funding',
        recordHash: null,
        payload,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: onchainReceipts.id,
        set: { payload },
      })

    return {
      caseId: job.marketCase.id,
      wallet,
      amountUsdc: verified.amountUsdc,
      txHash: parsed.data.txHash,
      role: 'backer',
    }
  })

  app.get('/ledger', async () => {
    const jobs = await listHearingJobs()
    const publicJobs = jobs.filter((job) => isPublicListCase(job))
    const fundingRows = await getAddedFundingLedgerRows(publicJobs)

    return {
      rows: [
        ...publicJobs.flatMap((job) => summarizeLedgerRows(job)),
        ...fundingRows,
      ],
    }
  })

  app.post('/cases/:caseId/settle', async (request, reply) => {
    const admin = authorizeAdminRequest(request.headers)
    if (!admin.ok) return reply.status(admin.status).send({ error: admin.error })

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
    const opened = await verifyCaseOpenedReceipt({
      txHash: data.onchain.txHash,
      chainId: data.onchain.chainId,
      escrowAddress: data.onchain.escrowAddress,
      onchainCaseId: data.onchain.caseId,
      budgetUsdc: data.onchain.budgetUsdc,
      questionHash: data.onchain.questionHash,
      filer: data.filer,
    }).catch((error) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : 'case opening receipt verification failed',
    }))
    if (!opened.ok) return reply.status(400).send({ error: opened.error })

    const marketCase: MarketCase = {
      id: data.id ?? createCaseId(data.question, data.onchain?.caseId, data.onchain?.txHash),
      question: data.question,
      context: [
        data.context || undefined,
        `Prediction market: ${predictionMarketLink}`,
      ].filter(Boolean).join('\n\n'),
      links: data.links.filter(Boolean),
      imageUrl: data.imageUrl,
      type: 'prediction-market' as CaseType,
      parentCaseId: data.parentCaseId,
      filingKind: data.parentCaseId ? data.filingKind : 'original',
      filer: data.filer,
      visibility: data.visibility,
      payerVisibility: data.payerVisibility,
      onchain: data.onchain,
      createdAt: new Date().toISOString(),
    }
    const job = await enqueueHearingJob(marketCase)
    if (isDatabaseConfigured) {
      await db!
        .insert(onchainReceipts)
        .values({
          id: `${job.id}:case-open:${data.onchain.txHash}`,
          caseId: marketCase.id,
          jobId: job.id,
          chainId: data.onchain.chainId,
          txHash: data.onchain.txHash,
          receiptType: 'case-open',
          recordHash: data.onchain.questionHash,
          payload: {
            type: 'case-open',
            wallet: opened.petitioner,
            amountUsdc: opened.budgetUsdc,
            onchainCaseId: data.onchain.caseId,
            metadataURI: opened.metadataURI,
          },
          createdAt: new Date(),
        })
        .onConflictDoNothing()
    }

    return reply.status(202).send({
      status: 'queued',
      case: summarizeCase(job),
      job,
    })
  })
}

async function summarizeCaseDetail(
  job: Awaited<ReturnType<typeof listHearingJobs>>[number],
  result: { artifacts?: CourtArtifact[]; transcript?: unknown[]; recordHash?: string; partial?: boolean; onchainSettlement?: unknown } | undefined,
) {
  const extraReceipts = await getCaseRecordedReceipts(job.marketCase.id)
  const settlement = isSettlementObject(result?.onchainSettlement) ? result.onchainSettlement : undefined
  const onchainSettlement = extraReceipts.length
    ? {
        ...(settlement ?? {}),
        receipts: [
          ...(Array.isArray(settlement?.receipts) ? settlement.receipts : []),
          ...extraReceipts,
        ],
      }
    : result?.onchainSettlement

  return {
    case: summarizeCase(job),
    transcript: Array.isArray(result?.transcript) ? result.transcript : [],
    artifacts: Array.isArray(result?.artifacts) ? result.artifacts : [],
    recordHash: result?.recordHash,
    partial: Boolean(result?.partial),
    onchainSettlement,
  }
}

function isSettlementObject(value: unknown): value is { status?: string; receipts?: unknown[] } {
  return Boolean(value && typeof value === 'object')
}

async function getCaseRecordedReceipts(caseId: string) {
  if (!isDatabaseConfigured) return []

  const receipts = await db!
    .select()
    .from(onchainReceipts)
    .where(eq(onchainReceipts.caseId, caseId))

  return receipts
    .filter((receipt) => receipt.receiptType === 'case-added-funding')
    .map((receipt) => {
      const payload = receipt.payload as { amountUsdc?: string; wallet?: string } | null
      return {
        type: receipt.receiptType,
        txHash: receipt.txHash,
        chainId: receipt.chainId,
        caseId,
        amountUsdc: payload?.amountUsdc,
        wallet: payload?.wallet,
      }
    })
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

async function isFollowingCase({ caseId, wallet }: { caseId: string; wallet: string }) {
  if (!isDatabaseConfigured) return false
  const [follow] = await db!
    .select({ id: caseFollows.id })
    .from(caseFollows)
    .where(and(
      eq(caseFollows.caseId, caseId),
      eq(caseFollows.wallet, wallet),
    ))
    .limit(1)
  return Boolean(follow)
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

async function verifyCaseFundingReceipt({
  txHash,
  wallet,
  onchainCaseId,
  escrowAddress,
  expectedAmountUsdc,
}: {
  txHash: `0x${string}`
  wallet: string
  onchainCaseId: string
  escrowAddress: `0x${string}`
  expectedAmountUsdc?: string
}) {
  if (env.CASE_ESCROW_ADDRESS && normalizeWallet(escrowAddress) !== normalizeWallet(env.CASE_ESCROW_ADDRESS)) {
    return { ok: false as const, error: 'funding escrow address does not match backend escrow configuration' }
  }
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') return { ok: false as const, error: 'funding transaction did not succeed' }

  const logs = parseEventLogs({
    abi: caseEscrowFundingAbi,
    logs: receipt.logs.filter((log) => normalizeWallet(log.address) === normalizeWallet(escrowAddress)),
    eventName: 'CaseFunded',
  })
  const event = logs.find((log) => {
    const args = log.args
    return args.caseId?.toString() === onchainCaseId && args.funder?.toLowerCase() === wallet
  })
  if (!event) return { ok: false as const, error: 'CaseFunded event was not found for this wallet and case' }

  const amount = event.args.amount
  if (expectedAmountUsdc) {
    const expected = parseUnits(expectedAmountUsdc, usdcDecimals)
    if (amount !== expected) return { ok: false as const, error: 'funding amount does not match the transaction event' }
  }

  return {
    ok: true as const,
    amountUsdc: formatUnits(amount, usdcDecimals),
  }
}

async function verifyCaseOpenedReceipt({
  txHash,
  chainId,
  escrowAddress,
  onchainCaseId,
  budgetUsdc,
  questionHash,
  filer,
}: {
  txHash: `0x${string}`
  chainId: string
  escrowAddress: `0x${string}`
  onchainCaseId: string
  budgetUsdc: string
  questionHash: `0x${string}`
  filer?: `0x${string}`
}) {
  if (String(env.ARC_CHAIN_ID) !== chainId) return { ok: false as const, error: 'case opening chain does not match Arc chain configuration' }
  if (env.CASE_ESCROW_ADDRESS && normalizeWallet(escrowAddress) !== normalizeWallet(env.CASE_ESCROW_ADDRESS)) {
    return { ok: false as const, error: 'case opening escrow address does not match backend escrow configuration' }
  }

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') return { ok: false as const, error: 'case opening transaction did not succeed' }

  const logs = parseEventLogs({
    abi: caseEscrowFundingAbi,
    logs: receipt.logs.filter((log) => normalizeWallet(log.address) === normalizeWallet(escrowAddress)),
    eventName: 'CaseOpened',
  })
  const expectedBudget = parseUnits(budgetUsdc, usdcDecimals)
  const event = logs.find((log) => {
    const args = log.args
    return args.caseId?.toString() === onchainCaseId
      && args.budget === expectedBudget
      && normalizeWallet(args.questionHash ?? '') === normalizeWallet(questionHash)
      && (!filer || args.petitioner?.toLowerCase() === normalizeWallet(filer))
  })
  if (!event) return { ok: false as const, error: 'CaseOpened event was not found with the supplied case id, budget, question hash, and filer' }

  return {
    ok: true as const,
    petitioner: normalizeWallet(event.args.petitioner),
    budgetUsdc: formatUnits(event.args.budget, usdcDecimals),
    metadataURI: event.args.metadataURI,
  }
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
  return consumeCaseActionChallenge({
    wallet,
    caseId,
    purpose: caseReadPurpose(caseId),
    message,
    signature,
    missingError: 'case access challenge was not found or was already used',
    expiredError: 'case access challenge expired',
    invalidError: 'case access signature did not match the connected wallet',
  })
}

async function consumeCaseActionChallenge({
  wallet,
  purpose,
  message,
  signature,
  missingError,
  expiredError,
  invalidError,
}: {
  wallet: string
  caseId: string
  purpose: string
  message: string
  signature: `0x${string}`
  missingError: string
  expiredError: string
  invalidError: string
}) {
  const [challenge] = await db!
    .select()
    .from(authChallenges)
    .where(and(
      eq(authChallenges.wallet, wallet),
      eq(authChallenges.message, message),
      eq(authChallenges.purpose, purpose),
      isNull(authChallenges.consumedAt),
    ))
    .limit(1)

  if (!challenge) return { ok: false, error: missingError }
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: expiredError }

  const isValid = await verifyMessage({
    address: wallet as `0x${string}`,
    message,
    signature,
  }).catch(() => false)

  if (!isValid) return { ok: false, error: invalidError }

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

function buildCaseFollowChallengeMessage({
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
    'Helia Court follow case',
    '',
    `Origin: ${env.APP_ORIGIN}`,
    `Wallet: ${wallet}`,
    `Case: ${caseId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    '',
    'Sign this message to follow or unfollow this Helia Court case. This does not send a transaction or spend gas.',
  ].join('\n')
}

function caseReadPurpose(caseId: string) {
  return `${CASE_READ_PURPOSE_PREFIX}:${caseId}`
}

function caseFollowPurpose(caseId: string) {
  return `${CASE_FOLLOW_PURPOSE_PREFIX}:${caseId}`
}

function normalizeWallet(value: string) {
  return value.toLowerCase()
}

function authorizeAdminRequest(headers: Record<string, string | string[] | undefined>) {
  if (!env.HELIA_ADMIN_KEY) {
    return {
      ok: false as const,
      status: 503,
      error: 'admin settlement retry is disabled until HELIA_ADMIN_KEY is configured',
    }
  }

  const header = headers['x-helia-admin-key']
  const supplied = Array.isArray(header) ? header[0] : header
  if (supplied !== env.HELIA_ADMIN_KEY) {
    return {
      ok: false as const,
      status: 401,
      error: 'invalid admin key',
    }
  }

  return { ok: true as const }
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
    imageUrl: marketCase.imageUrl,
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
    parentCaseId: marketCase.parentCaseId,
    filingKind: marketCase.filingKind ?? 'original',
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
      totalBudgetUsdc?: string
      protocolFeeUsdc?: string
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
      amount: `${result?.onchainSettlement?.totalBudgetUsdc ?? marketCase.onchain.budgetUsdc} USDC`,
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
      amount: `${result.onchainSettlement.protocolFeeUsdc ?? formatProtocolFee(marketCase.onchain.budgetUsdc)} USDC`,
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

async function getAddedFundingLedgerRows(publicJobs: Awaited<ReturnType<typeof listHearingJobs>>) {
  if (!isDatabaseConfigured || !publicJobs.length) return []

  const byCase = new Map(publicJobs.map((job) => [job.marketCase.id, job]))
  const receipts = await db!
    .select()
    .from(onchainReceipts)
    .where(eq(onchainReceipts.receiptType, 'case-added-funding'))

  return receipts.flatMap((receipt) => {
    const job = byCase.get(receipt.caseId)
    if (!job) return []

    const payload = receipt.payload as { amountUsdc?: string; wallet?: string } | null
    return [{
      caseId: job.marketCase.id,
      title: job.marketCase.question,
      item: 'Added case funding',
      amount: payload?.amountUsdc ? `${payload.amountUsdc} USDC` : 'Recorded',
      status: 'Anchored',
      hash: receipt.txHash,
      updated: receipt.createdAt.toISOString(),
      chainId: receipt.chainId,
      txHash: receipt.txHash,
      receiptType: receipt.receiptType,
      wallet: payload?.wallet,
    }]
  })
}

function formatProtocolFee(budgetUsdc: string) {
  const budget = Number(budgetUsdc)
  if (!Number.isFinite(budget)) return '0.00'
  return (budget * (env.PROTOCOL_FEE_BPS / 10_000)).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function formatReceiptType(type: string, agentId?: string) {
  if (type === 'agent-payout') return agentId ? `Agent payout · ${agentId}` : 'Agent payout'
  if (type === 'case-added-funding') return 'Added case funding'
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
