import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server'
import {
  CIRCLE_BATCHING_NAME,
  CIRCLE_BATCHING_VERSION,
  GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
} from '@circle-fin/x402-batching'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { desc, eq, sql } from 'drizzle-orm'
import { listHearingJobs } from '../agents/hearings/index.js'
import { env } from '../config/env.js'
import type { CourtArtifact, CourtTranscriptTurn } from '../court/types.js'
import { db } from '../db/client.js'
import { x402Receipts } from '../db/schema.js'

const arcUsdcAddress = '0x3600000000000000000000000000000000000000'
const gatewayWalletTestnet = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
const maxTimeoutSeconds = GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS
const facilitatorMaxConcurrency = 1
const facilitatorMaxAttempts = 6
const facilitatorRetryBaseMs = 800

type Challenge = {
  nonce: string
  resource: string
  amount: string
  expiresAt: number
}

type PaidEvidence = {
  payer?: string
  txHash?: string
  amountMicroUsdc: number
  network?: string
}

type X402PaymentRequirements = {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra?: Record<string, unknown>
}

let paymentRequirementsCache: X402PaymentRequirements | undefined
let paymentRequirementsCacheExpiresAt = 0
let facilitatorInFlight = 0
const facilitatorQueue: Array<() => void> = []

export async function x402Routes(app: FastifyInstance) {
  app.get('/x402/status', async () => ({
    enabled: Boolean(getReceiverAddress()),
    settlement: env.HELIA_X402_FACILITATOR_URL ? 'facilitator-configured' : 'challenge-only',
    network: `eip155:${env.ARC_CHAIN_ID}`,
    amountMicroUsdc: env.HELIA_X402_PRICE_MICRO_USDC,
    receiver: getReceiverAddress() ?? null,
    resources: [
      '/x402/price/:caseId',
      '/x402/transcript/:caseId',
      '/x402/receipts/:caseId',
      '/x402/proof/:caseId',
    ],
  }))

  app.get('/x402/price/:caseId', async (request, reply) => {
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    await recordX402Receipt(job.marketCase.id, request.url, paid)
    const result = getResult(job)
    const verdict = findVerdict(result?.artifacts)

    return {
      paid,
      caseId: job.marketCase.id,
      question: job.marketCase.question,
      status: formatJobStatus(job.status),
      verdict: verdict?.summary ?? null,
      confidence: verdict?.confidence ?? null,
      recordHash: result?.recordHash ?? null,
      href: `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/cases/${encodeURIComponent(job.marketCase.id)}`,
    }
  })

  app.get('/x402/transcript/:caseId', async (request, reply) => {
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    await recordX402Receipt(job.marketCase.id, request.url, paid)
    const result = getResult(job)

    return {
      paid,
      caseId: job.marketCase.id,
      turns: (result?.transcript ?? []).slice(-50),
    }
  })

  app.get('/x402/receipts/:caseId', async (request, reply) => {
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    await recordX402Receipt(job.marketCase.id, request.url, paid)
    const result = getResult(job)

    return {
      paid,
      caseId: job.marketCase.id,
      receipts: result?.onchainSettlement?.receipts ?? [],
    }
  })

  app.get('/x402/proof/:caseId', async (request, reply) => {
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    await recordX402Receipt(job.marketCase.id, request.url, paid)
    const result = getResult(job)
    const receipts = result?.onchainSettlement?.receipts ?? []

    return {
      paid,
      caseId: job.marketCase.id,
      question: job.marketCase.question,
      marketUrl: job.marketCase.links?.[0] ?? null,
      recordHash: result?.recordHash ?? null,
      transcriptTurns: result?.transcript?.length ?? 0,
      artifacts: result?.artifacts?.length ?? 0,
      receipts,
      proofUrl: `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/proof/${encodeURIComponent(job.marketCase.id)}`,
    }
  })

  app.get('/x402/activity', async (request) => {
    const caseId = typeof (request.query as { caseId?: unknown }).caseId === 'string'
      ? (request.query as { caseId: string }).caseId
      : undefined
    return getX402Activity(caseId)
  })
}

async function requireX402Payment(request: FastifyRequest, reply: FastifyReply): Promise<PaidEvidence | undefined> {
  const receiver = getReceiverAddress()
  if (!receiver) {
    reply.status(503).send({ error: 'x402 receiver is not configured' })
    return undefined
  }

  const paymentHeader = getPaymentHeader(request)
  if (!paymentHeader || Array.isArray(paymentHeader)) {
    await sendChallenge(request, reply, receiver)
    return undefined
  }

  const challengeToken = request.headers['x-payment-challenge']
  const payment = parsePayment(paymentHeader)
  if (!payment) {
    await sendChallenge(request, reply, receiver, 'payment payload could not be decoded')
    return undefined
  }

  const requirements = await getPaymentRequirements(receiver, payment.accepted?.network)
  if (!requirements) {
    reply.status(503).send({ error: 'x402 payment requirements are unavailable' })
    return undefined
  }

  const hasChallenge = typeof challengeToken === 'string'
  const challenge = hasChallenge ? verifyChallenge(challengeToken, payment) : undefined
  const usesCircleAcceptedRequirements = isPaymentRequirements(payment.accepted)
  if (!usesCircleAcceptedRequirements && !challenge) {
    await sendChallenge(request, reply, receiver, 'payment challenge invalid or expired')
    return undefined
  }

  const amount = Number(payment.accepted?.amount ?? payment.amount ?? payment.value ?? payment.payload?.value ?? 0)
  if (!Number.isFinite(amount) || amount < env.HELIA_X402_PRICE_MICRO_USDC) {
    await sendChallenge(request, reply, receiver, 'insufficient x402 payment amount')
    return undefined
  }

  if (!env.HELIA_X402_FACILITATOR_URL) {
    reply.status(503).send({
      error: 'x402 facilitator is not configured',
      hint: 'Set HELIA_X402_FACILITATOR_URL to enable real payment settlement.',
    })
    return undefined
  }

  const settled = await settlePayment(payment, requirements)
  if (!settled.ok) {
    reply.status(402).send({ error: settled.error })
    return undefined
  }

  const paymentResponse = Buffer.from(JSON.stringify({
    success: true,
    transaction: settled.txHash,
    network: requirements.network,
    payer: settled.payer,
  })).toString('base64')
  reply.header('PAYMENT-RESPONSE', paymentResponse).header('payment-response', paymentResponse)

  return {
    payer: settled.payer,
    txHash: settled.txHash,
    amountMicroUsdc: amount,
    network: requirements.network,
  }
}

async function sendChallenge(request: FastifyRequest, reply: FastifyReply, receiver: `0x${string}`, detail?: string) {
  const resource = new URL(request.url, env.HELIA_PUBLIC_APP_URL).pathname
  const challenge = issueChallenge(resource)
  const requirements = await getPaymentRequirements(receiver)
  const body = {
    x402Version: 2,
    resource: {
      url: resource,
      description: 'Helia Court paid proof API',
      mimeType: 'application/json',
    },
    accepts: requirements ? [{ ...requirements, nonce: challenge.nonce }] : [],
  }
  const bodyJson = JSON.stringify(body)
  reply
    .status(402)
    .header('PAYMENT-REQUIRED', Buffer.from(bodyJson).toString('base64'))
    .header('payment-required', Buffer.from(bodyJson).toString('base64'))
    .header('accept-payment', bodyJson)
    .header('x-payment-challenge', signChallenge(challenge))
    .header('cache-control', 'no-store')
    .send(detail ? { ...body, detail } : body)
}

function issueChallenge(resource: string): Challenge {
  return {
    nonce: `0x${randomBytes(32).toString('hex')}`,
    resource,
    amount: String(env.HELIA_X402_PRICE_MICRO_USDC),
    expiresAt: Math.floor(Date.now() / 1000) + maxTimeoutSeconds,
  }
}

function signChallenge(challenge: Challenge) {
  const body = Buffer.from(JSON.stringify(challenge))
  const mac = createHmac('sha256', getSigningSecret()).update(body).digest()
  return Buffer.concat([body, mac]).toString('base64url')
}

function verifyChallenge(token: string, payment: Record<string, any> | undefined) {
  if (!payment) return undefined
  const raw = Buffer.from(token, 'base64url')
  if (raw.length <= 32) return undefined
  const body = raw.subarray(0, -32)
  const mac = raw.subarray(-32)
  const expected = createHmac('sha256', getSigningSecret()).update(body).digest()
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return undefined

  const challenge = JSON.parse(body.toString('utf8')) as Challenge
  const nonce = payment.nonce ?? payment.payload?.nonce
  const resource = payment.resource ?? payment.payload?.resource
  if (challenge.expiresAt < Math.floor(Date.now() / 1000)) return undefined
  if (challenge.nonce !== nonce || challenge.resource !== resource) return undefined
  return challenge
}

function parsePayment(raw: string) {
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as Record<string, any>
  } catch {
    try {
      return JSON.parse(raw) as Record<string, any>
    } catch {
      return undefined
    }
  }
}

async function settlePayment(payment: Record<string, any>, requirements: X402PaymentRequirements): Promise<{ ok: true; payer?: string; txHash?: string } | { ok: false; error: string }> {
  return withFacilitatorSlot(async () => {
    let lastError = 'x402 facilitator settlement failed'
    for (let attempt = 1; attempt <= facilitatorMaxAttempts; attempt += 1) {
      try {
        const facilitator = createFacilitatorClient()
        const verify = await facilitator.verify(payment as any, requirements)
        if (!verify.isValid) {
          const reason = verify.invalidReason ?? 'x402 payment verification failed'
          if (!isRetryableFacilitatorError(reason) || attempt === facilitatorMaxAttempts) {
            return { ok: false, error: reason }
          }
          lastError = reason
          await sleep(facilitatorRetryDelay(attempt))
          continue
        }

        const settled = await facilitator.settle(payment as any, requirements)
        if (!settled.success) {
          const reason = settled.errorReason ?? 'x402 payment settlement failed'
          if (!isRetryableFacilitatorError(reason) || attempt === facilitatorMaxAttempts) {
            return { ok: false, error: reason }
          }
          lastError = reason
          await sleep(facilitatorRetryDelay(attempt))
          continue
        }

        return {
          ok: true,
          payer: settled.payer ?? verify.payer,
          txHash: settled.transaction,
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'x402 facilitator settlement failed'
        if (!isRetryableFacilitatorError(lastError) || attempt === facilitatorMaxAttempts) {
          return { ok: false, error: lastError }
        }
        await sleep(facilitatorRetryDelay(attempt))
      }
    }

    return { ok: false, error: lastError }
  })
}

async function withFacilitatorSlot<T>(work: () => Promise<T>): Promise<T> {
  if (facilitatorInFlight >= facilitatorMaxConcurrency) {
    await new Promise<void>((resolve) => facilitatorQueue.push(resolve))
  }
  facilitatorInFlight += 1
  try {
    return await work()
  } finally {
    facilitatorInFlight = Math.max(0, facilitatorInFlight - 1)
    facilitatorQueue.shift()?.()
  }
}

function facilitatorRetryDelay(attempt: number) {
  return facilitatorRetryBaseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 120)
}

function isRetryableFacilitatorError(value: string) {
  return /timeout|timed out|temporar|rate|429|5\\d\\d|html|unexpected token|fetch failed|network|econnreset|gateway/i.test(value)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getPublicJob(caseId: string, reply: FastifyReply) {
  const jobs = await listHearingJobs()
  const job = jobs.find((item) => item.marketCase.id === caseId || item.caseId === caseId || item.id === caseId)
  if (!job || (job.marketCase.visibility ?? 'public') !== 'public') {
    reply.status(404).send({ error: 'case not found' })
    return undefined
  }
  return job
}

function getResult(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  return job.result as {
    recordHash?: string
    artifacts?: CourtArtifact[]
    transcript?: CourtTranscriptTurn[]
    onchainSettlement?: {
      receipts?: unknown[]
    }
  } | undefined
}

async function recordX402Receipt(caseId: string, resource: string, paid: PaidEvidence) {
  if (!db || !paid.txHash) return
  try {
    await db.insert(x402Receipts).values({
      id: randomUUID(),
      caseId,
      payer: paid.payer?.toLowerCase(),
      transactionId: paid.txHash,
      amountMicroUsdc: String(paid.amountMicroUsdc),
      network: paid.network ?? `eip155:${env.ARC_CHAIN_ID}`,
      resource,
      createdAt: new Date(),
    }).onConflictDoNothing()
  } catch (error) {
    console.warn('[x402] failed to record receipt', error)
  }
}

async function getX402Activity(caseId?: string) {
  if (!db) {
    return emptyX402Activity(caseId)
  }

  try {
    const rows = caseId
      ? await db.select().from(x402Receipts).where(eq(x402Receipts.caseId, caseId)).orderBy(desc(x402Receipts.createdAt)).limit(50)
      : await db.select().from(x402Receipts).orderBy(desc(x402Receipts.createdAt)).limit(250)
    const [summary] = caseId
      ? await db
        .select({
          totalPaidReads: sql<number>`count(*)::int`,
          totalMicroUsdc: sql<string>`coalesce(sum((${x402Receipts.amountMicroUsdc})::numeric), 0)::text`,
          distinctPayers: sql<number>`count(distinct ${x402Receipts.payer})::int`,
          distinctCases: sql<number>`count(distinct ${x402Receipts.caseId})::int`,
        })
        .from(x402Receipts)
        .where(eq(x402Receipts.caseId, caseId))
      : await db
        .select({
          totalPaidReads: sql<number>`count(*)::int`,
          totalMicroUsdc: sql<string>`coalesce(sum((${x402Receipts.amountMicroUsdc})::numeric), 0)::text`,
          distinctPayers: sql<number>`count(distinct ${x402Receipts.payer})::int`,
          distinctCases: sql<number>`count(distinct ${x402Receipts.caseId})::int`,
        })
        .from(x402Receipts)
    const totalPaidReads = Number(summary?.totalPaidReads ?? 0)
    const totalMicroUsdc = Number(summary?.totalMicroUsdc ?? 0)
    const distinctPayers = Number(summary?.distinctPayers ?? 0)
    const distinctCases = Number(summary?.distinctCases ?? 0)
    const averageMicroUsdc = totalPaidReads ? totalMicroUsdc / totalPaidReads : 0

    return {
      caseId: caseId ?? null,
      totalPaidReads,
      totalMicroUsdc,
      totalUsdc: formatMicroUsdc(totalMicroUsdc),
      averageMicroUsdc,
      averageUsdc: formatMicroUsdc(averageMicroUsdc),
      distinctPayers,
      distinctCases,
      latest: rows[0] ? serializeX402Receipt(rows[0]) : null,
      recent: rows.slice(0, 12).map(serializeX402Receipt),
    }
  } catch (error) {
    return { ...emptyX402Activity(caseId), error: error instanceof Error ? error.message : 'x402 activity unavailable' }
  }
}

function emptyX402Activity(caseId?: string) {
  return {
    caseId: caseId ?? null,
    totalPaidReads: 0,
    totalMicroUsdc: 0,
    totalUsdc: '0',
    averageMicroUsdc: 0,
    averageUsdc: '0',
    distinctPayers: 0,
    distinctCases: 0,
    latest: null,
    recent: [],
  }
}

function serializeX402Receipt(row: typeof x402Receipts.$inferSelect) {
  return {
    caseId: row.caseId,
    payer: row.payer,
    transactionId: row.transactionId,
    amountMicroUsdc: Number(row.amountMicroUsdc || 0),
    amountUsdc: formatMicroUsdc(Number(row.amountMicroUsdc || 0)),
    network: row.network,
    resource: row.resource,
    createdAt: row.createdAt.toISOString(),
  }
}

function formatMicroUsdc(value: number) {
  return (value / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function findVerdict(artifacts?: CourtArtifact[]) {
  return artifacts?.filter((artifact) => artifact.type === 'verdict').at(-1)
}

function formatJobStatus(value: string) {
  if (value === 'completed') return 'Verdict'
  if (value === 'running') return 'Hearing'
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

function getReceiverAddress(): `0x${string}` | undefined {
  const value = env.HELIA_X402_RECEIVER_ADDRESS ?? env.HELIA_PROTOCOL_AGENT_PAYOUT_WALLET ?? env.TREASURY_ADDRESS
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value as `0x${string}` : undefined
}

function getSigningSecret() {
  return env.HELIA_X402_SIGNING_SECRET ?? 'helia-court-local-x402-signing-secret'
}

function getPaymentHeader(request: FastifyRequest) {
  return request.headers['payment-signature'] ?? request.headers['x-payment']
}

async function getPaymentRequirements(receiver: `0x${string}`, requestedNetwork?: string): Promise<X402PaymentRequirements | undefined> {
  const network = requestedNetwork ?? `eip155:${env.ARC_CHAIN_ID}`
  if (paymentRequirementsCache && paymentRequirementsCache.network === network && paymentRequirementsCacheExpiresAt > Date.now()) {
    return paymentRequirementsCache
  }

  let verifyingContract = gatewayWalletTestnet
  if (env.HELIA_X402_FACILITATOR_URL) {
    try {
      const supported = await createFacilitatorClient().getSupported()
      const kind = supported.kinds.find((item) => item.scheme === 'exact' && item.network === network && item.extra?.verifyingContract)
      if (typeof kind?.extra?.verifyingContract === 'string') {
        verifyingContract = kind.extra.verifyingContract
      }
    } catch {
      verifyingContract = gatewayWalletTestnet
    }
  }

  paymentRequirementsCache = {
    scheme: 'exact',
    network,
    asset: arcUsdcAddress,
    amount: String(env.HELIA_X402_PRICE_MICRO_USDC),
    payTo: receiver,
    maxTimeoutSeconds,
    extra: {
      name: CIRCLE_BATCHING_NAME,
      version: CIRCLE_BATCHING_VERSION,
      verifyingContract,
    },
  }
  paymentRequirementsCacheExpiresAt = Date.now() + 5 * 60 * 1000
  return paymentRequirementsCache
}

function createFacilitatorClient() {
  return new BatchFacilitatorClient({
    url: env.HELIA_X402_FACILITATOR_URL,
    createAuthHeaders: env.CIRCLE_API_KEY ? async () => ({
      verify: { authorization: `Bearer ${env.CIRCLE_API_KEY}` },
      settle: { authorization: `Bearer ${env.CIRCLE_API_KEY}` },
      supported: { authorization: `Bearer ${env.CIRCLE_API_KEY}` },
    }) : undefined,
  })
}

function isPaymentRequirements(value: unknown): value is X402PaymentRequirements {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.scheme === 'exact'
    && typeof record.network === 'string'
    && typeof record.asset === 'string'
    && typeof record.amount === 'string'
    && typeof record.payTo === 'string'
  )
}
