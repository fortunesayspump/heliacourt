import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { enqueueHearingJob, listHearingJobs, retryOnchainSettlement } from '../agents/hearing-jobs.js'
import { env } from '../config/env.js'
import type { CaseType, MarketCase } from '../court/types.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { authChallenges, caseFollows, caseParticipants, onchainReceipts } from '../db/schema.js'
import { notifyCaseFiled, notifyCaseFunded } from '../integrations/telegram.js'
import { authorizeAdminRequest, buildCaseFollowChallengeMessage, buildCaseReadChallengeMessage, canAccessCaseAction, canReadPrivateCase, caseFollowPurpose, caseReadPurpose, consumeCaseActionChallenge, consumeCaseReadChallenge, formatValidationIssues, getCaseVisibility } from './cases.access.js'
import { verifyCaseCancellationReceipt, verifyCaseFundingReceipt, verifyCaseOpenedReceipt } from './cases.onchain.js'
import { getCaseRecordedReceipts, getCaseResult, getRecordedReceiptLedgerRows, isPublicListCase, summarizeCase, summarizeCaseDetail, summarizeLedgerRows } from './cases.presenter.js'
import { ensureUser, findCaseJob, isFollowingCase } from './cases.repository.js'
import { addFundingReceiptSchema, cancelCaseReceiptSchema, caseAccessChallengeSchema, createCaseSchema, followCaseSchema, signedCaseAccessSchema } from './cases.schemas.js'
import { createCaseId, isSupportedPredictionMarketLink, normalizeWallet, supportedPredictionMarketHosts } from './cases.utils.js'

const CHALLENGE_TTL_MS = 5 * 60 * 1000

export async function caseRoutes(app: FastifyInstance) {
  app.get('/cases', async () => {
    const jobs = await listHearingJobs()
    const publicJobs = jobs.filter((job) => isPublicListCase(job))

    return {
      cases: await Promise.all(publicJobs.map(async (job) => summarizeCase(
        job,
        job.status === 'failed' ? await getCaseRecordedReceipts(job.marketCase.id) : [],
      ))),
    }
  })

  app.get('/cases/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string }
    const job = await findCaseJob(caseId)

    if (!job) {
      return reply.status(404).send({ error: 'case not found' })
    }

    if (getCaseVisibility(job) === 'private') {
      return reply.status(404).send({ error: 'case not found' })
    }

    return await summarizeCaseDetail(job, getCaseResult(job))
  })

  app.post('/cases/:caseId/challenge', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = caseAccessChallengeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid wallet' })

    const job = await findCaseJob(caseId)
    if (!job || getCaseVisibility(job) !== 'private') return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    if (!await canReadPrivateCase(job, wallet)) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })

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
        issues: formatValidationIssues(parsed.error),
      })
    }

    const job = await findCaseJob(caseId)
    if (!job || getCaseVisibility(job) !== 'private') return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    if (!await canReadPrivateCase(job, wallet)) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })

    const authorized = await consumeCaseReadChallenge({
      wallet,
      caseId: job.marketCase.id,
      message: parsed.data.auth.message,
      signature: parsed.data.auth.signature,
    })
    if (!authorized.ok) return reply.status(401).send({ error: authorized.error })

    return await summarizeCaseDetail(job, getCaseResult(job))
  })

  app.post('/cases/:caseId/follow-challenge', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = caseAccessChallengeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid wallet' })

    const job = await findCaseJob(caseId)
    if (!job) return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    if (!await canAccessCaseAction(job, wallet)) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })

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
    const parsed = followCaseSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid follow request',
        issues: formatValidationIssues(parsed.error),
      })
    }

    const job = await findCaseJob(caseId)
    if (!job) return reply.status(404).send({ error: 'case not found' })

    const wallet = normalizeWallet(parsed.data.wallet)
    if (!await canAccessCaseAction(job, wallet)) return reply.status(403).send({ error: 'wallet is not a participant on this private case' })

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
        issues: formatValidationIssues(parsed.error),
      })
    }

    const job = await findCaseJob(caseId)
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

    void notifyCaseFunded({
      caseId: job.marketCase.id,
      title: job.marketCase.question,
      amountUsdc: verified.amountUsdc,
      txHash: parsed.data.txHash,
    })

    return {
      caseId: job.marketCase.id,
      wallet,
      amountUsdc: verified.amountUsdc,
      txHash: parsed.data.txHash,
      role: 'backer',
    }
  })

  app.post('/cases/:caseId/cancellation', async (request, reply) => {
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const parsed = cancelCaseReceiptSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid cancellation receipt',
        issues: formatValidationIssues(parsed.error),
      })
    }

    const job = await findCaseJob(caseId)
    if (!job) return reply.status(404).send({ error: 'case not found' })
    if (!job.marketCase.onchain) return reply.status(400).send({ error: 'case has no onchain escrow record' })
    if (String(env.ARC_CHAIN_ID) !== parsed.data.chainId || parsed.data.chainId !== job.marketCase.onchain.chainId) {
      return reply.status(400).send({ error: 'cancellation receipt chain does not match the case chain' })
    }

    const wallet = normalizeWallet(parsed.data.wallet)
    const verified = await verifyCaseCancellationReceipt({
      txHash: parsed.data.txHash,
      wallet,
      onchainCaseId: job.marketCase.onchain.caseId,
      escrowAddress: job.marketCase.onchain.escrowAddress,
      expectedRefundUsdc: parsed.data.refundUsdc,
    }).catch((error) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : 'cancellation receipt verification failed',
    }))
    if (!verified.ok) return reply.status(400).send({ error: verified.error })

    const now = new Date()
    await ensureUser(wallet)
    const payload = {
      type: 'case-cancelled',
      wallet,
      refundUsdc: verified.refundUsdc,
      onchainCaseId: job.marketCase.onchain.caseId,
    }
    await db!
      .insert(onchainReceipts)
      .values({
        id: `${job.id}:case-cancelled:${parsed.data.txHash}`,
        caseId: job.marketCase.id,
        jobId: job.id,
        chainId: parsed.data.chainId,
        txHash: parsed.data.txHash,
        receiptType: 'case-cancel',
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
      refundUsdc: verified.refundUsdc,
      txHash: parsed.data.txHash,
      status: 'refunded',
    }
  })

  app.get('/ledger', async () => {
    const jobs = await listHearingJobs()
    const publicJobs = jobs.filter((job) => isPublicListCase(job))
    const recordedReceiptRows = await getRecordedReceiptLedgerRows(publicJobs)

    return {
      rows: [
        ...publicJobs.flatMap((job) => summarizeLedgerRows(job)),
        ...recordedReceiptRows,
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
        issues: formatValidationIssues(parsed.error),
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

    const caseId = createCaseId(data.question, data.onchain.caseId, data.onchain.txHash)
    const marketCase: MarketCase = {
      id: caseId,
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

    void notifyCaseFiled({
      caseId: marketCase.id,
      title: marketCase.question,
      budgetUsdc: data.onchain.budgetUsdc,
      status: job.status,
    })

    return reply.status(202).send({
      status: 'queued',
      case: summarizeCase(job),
      job,
    })
  })
}
