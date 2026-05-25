import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { getReputationMeta } from '../shared/reputation-meta.js'
import { getX402Activity, recordX402Receipt } from './x402/activity.js'
import { findVerdict, formatJobStatus, getPublicJob, getResult } from './x402/case-resource.js'
import { requireX402Payment, x402StatusPayload } from './x402/payment.js'

export async function x402Routes(app: FastifyInstance) {
  app.get('/x402/status', async () => x402StatusPayload())

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
      reputation: getReputationMeta({
        service: 'x402-price',
        endpoint: request.url,
        caseId: job.marketCase.id,
        evidenceId: paid.txHash,
      }),
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
      reputation: getReputationMeta({
        service: 'x402-transcript',
        endpoint: request.url,
        caseId: job.marketCase.id,
        evidenceId: paid.txHash,
      }),
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
      reputation: getReputationMeta({
        service: 'x402-receipts',
        endpoint: request.url,
        caseId: job.marketCase.id,
        evidenceId: paid.txHash,
      }),
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
      reputation: getReputationMeta({
        service: 'x402-proof',
        endpoint: request.url,
        caseId: job.marketCase.id,
        evidenceId: paid.txHash,
      }),
    }
  })

  app.get('/x402/activity', async (request) => {
    const caseId = typeof (request.query as { caseId?: unknown }).caseId === 'string'
      ? (request.query as { caseId: string }).caseId
      : undefined
    return getX402Activity(caseId)
  })
}
