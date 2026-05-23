import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { listHearingJobs } from '../agents/hearing-jobs.js'
import { env } from '../config/env.js'
import type { CourtArtifact, CourtTranscriptTurn } from '../court/types.js'

const arcUsdcAddress = '0x3600000000000000000000000000000000000000'
const gatewayWalletTestnet = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
const maxTimeoutSeconds = 7 * 24 * 60 * 60 + 100

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
}

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
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
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
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
    const result = getResult(job)

    return {
      paid,
      caseId: job.marketCase.id,
      turns: (result?.transcript ?? []).slice(-50),
    }
  })

  app.get('/x402/receipts/:caseId', async (request, reply) => {
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
    const result = getResult(job)

    return {
      paid,
      caseId: job.marketCase.id,
      receipts: result?.onchainSettlement?.receipts ?? [],
    }
  })

  app.get('/x402/proof/:caseId', async (request, reply) => {
    const paid = await requireX402Payment(request, reply)
    if (!paid) return reply
    const job = await getPublicJob((request.params as { caseId: string }).caseId, reply)
    if (!job) return reply
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
}

async function requireX402Payment(request: FastifyRequest, reply: FastifyReply): Promise<PaidEvidence | undefined> {
  const receiver = getReceiverAddress()
  if (!receiver) {
    reply.status(503).send({ error: 'x402 receiver is not configured' })
    return undefined
  }

  const paymentHeader = request.headers['x-payment']
  if (!paymentHeader || Array.isArray(paymentHeader)) {
    sendChallenge(request, reply, receiver)
    return undefined
  }

  const challengeToken = request.headers['x-payment-challenge']
  if (!challengeToken || Array.isArray(challengeToken)) {
    sendChallenge(request, reply, receiver, 'x-payment-challenge header required')
    return undefined
  }

  const payment = parsePayment(paymentHeader)
  const challenge = verifyChallenge(challengeToken, payment)
  if (!payment || !challenge) {
    sendChallenge(request, reply, receiver, 'payment challenge invalid or expired')
    return undefined
  }

  const amount = Number(payment.amount ?? payment.value ?? payment.payload?.value ?? 0)
  if (!Number.isFinite(amount) || amount < env.HELIA_X402_PRICE_MICRO_USDC) {
    sendChallenge(request, reply, receiver, 'insufficient x402 payment amount')
    return undefined
  }

  if (!env.HELIA_X402_FACILITATOR_URL) {
    reply.status(503).send({
      error: 'x402 facilitator is not configured',
      hint: 'Set HELIA_X402_FACILITATOR_URL to enable real payment settlement.',
    })
    return undefined
  }

  const settled = await settlePayment(payment, receiver)
  if (!settled.ok) {
    reply.status(402).send({ error: settled.error })
    return undefined
  }

  return {
    payer: settled.payer,
    txHash: settled.txHash,
    amountMicroUsdc: amount,
  }
}

function sendChallenge(request: FastifyRequest, reply: FastifyReply, receiver: `0x${string}`, detail?: string) {
  const resource = new URL(request.url, env.HELIA_PUBLIC_APP_URL).pathname
  const challenge = issueChallenge(resource)
  const body = {
    x402Version: 2,
    resource: {
      url: resource,
      description: 'Helia Court paid proof API',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: `eip155:${env.ARC_CHAIN_ID}`,
        asset: arcUsdcAddress,
        amount: String(env.HELIA_X402_PRICE_MICRO_USDC),
        maxTimeoutSeconds,
        payTo: receiver,
        nonce: challenge.nonce,
        extra: {
          name: 'GatewayWalletBatched',
          version: '1',
          verifyingContract: gatewayWalletTestnet,
        },
      },
    ],
  }
  const bodyJson = JSON.stringify(body)
  reply
    .status(402)
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
    return undefined
  }
}

async function settlePayment(payment: Record<string, any>, receiver: `0x${string}`): Promise<{ ok: true; payer?: string; txHash?: string } | { ok: false; error: string }> {
  const response = await fetch(`${env.HELIA_X402_FACILITATOR_URL!.replace(/\/$/, '')}/v1/settle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scheme: 'exact',
      network: `eip155:${env.ARC_CHAIN_ID}`,
      payload: payment,
      requirements: {
        scheme: 'exact',
        network: `eip155:${env.ARC_CHAIN_ID}`,
        asset: arcUsdcAddress,
        amount: String(env.HELIA_X402_PRICE_MICRO_USDC),
        maxTimeoutSeconds,
        payTo: receiver,
        extra: {
          name: 'GatewayWalletBatched',
          version: '1',
          verifyingContract: gatewayWalletTestnet,
        },
      },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.success === false) {
    return {
      ok: false,
      error: payload.error ?? payload.reason ?? `x402 facilitator rejected payment: ${response.status}`,
    }
  }
  return {
    ok: true,
    payer: payload.payer,
    txHash: payload.tx_hash ?? payload.transactionHash ?? payload.transaction,
  }
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
