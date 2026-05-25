import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { enqueueHearingJob, listHearingJobs, retryOnchainSettlement } from '../agents/hearings/index.js'
import { env } from '../config/env.js'
import type { CaseType, MarketCase } from '../court/types.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { caseFollows, cases } from '../db/schema.js'
import { notifyCaseFiled, notifyCaseFunded } from '../integrations/telegram.js'
import { authorizeAdminRequest, canAccessCaseAction, canReadPrivateCase, caseFollowPurpose, consumeCaseActionChallenge, consumeCaseReadChallenge, formatValidationIssues, getCaseVisibility } from './cases.access.js'
import { createCaseFollowChallenge, createPrivateCaseReadChallenge } from './cases.challenges.js'
import { verifyCaseCancellationReceipt, verifyCaseFundingReceipt, verifyCaseOpenedReceipt } from './cases.onchain.js'
import { getCaseRecordedReceipts, getCaseResult, getRecordedReceiptLedgerRows, isPublicListCase, summarizeCase, summarizeCaseDetail, summarizeLedgerRows } from './cases.presenter.js'
import { recordCaseAddedFunding, recordCaseCancellation, recordCaseOpen } from './cases.receipts.js'
import { ensureUser, findCaseJob, isFollowingCase } from './cases.repository.js'
import { addFundingReceiptSchema, adminSeedCasesSchema, cancelCaseReceiptSchema, caseAccessChallengeSchema, createCaseSchema, followCaseSchema, signedCaseAccessSchema } from './cases.schemas.js'
import { createCaseId, isSupportedPredictionMarketLink, normalizeWallet, supportedPredictionMarketHosts } from './cases.utils.js'

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

  app.delete('/cases/:caseId', async (request, reply) => {
    const admin = authorizeAdminRequest(request.headers)
    if (!admin.ok) return reply.status(admin.status).send({ error: admin.error })
    if (!isDatabaseConfigured) return reply.status(503).send({ error: 'database not configured' })

    const { caseId } = request.params as { caseId: string }
    const deleted = await db!
      .delete(cases)
      .where(eq(cases.id, caseId))
      .returning({ id: cases.id })

    if (!deleted.length) return reply.status(404).send({ error: 'case not found' })

    return {
      caseId,
      deleted: true,
    }
  })

  app.post('/cases/admin/bulk', async (request, reply) => {
    const admin = authorizeAdminRequest(request.headers)
    if (!admin.ok) return reply.status(admin.status).send({ error: admin.error })

    const parsed = adminSeedCasesSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid admin case seed request',
        issues: formatValidationIssues(parsed.error),
      })
    }

    const seeded = []
    const rejected = []
    for (const data of parsed.data.cases) {
      const predictionMarketLink = data.links.find(isSupportedPredictionMarketLink)
      if (!predictionMarketLink) {
        rejected.push({
          question: data.question,
          error: 'prediction market link required',
          supportedMarkets: supportedPredictionMarketHosts,
        })
        continue
      }

      const marketCase: MarketCase = {
        id: data.id ?? createAdminSeedCaseId(data.question, predictionMarketLink),
        question: data.question,
        context: [
          data.context || undefined,
          `Prediction market: ${predictionMarketLink}`,
        ].filter(Boolean).join('\n\n'),
        links: data.links.filter(Boolean),
        imageUrl: data.imageUrl,
        type: data.type as CaseType,
        visibility: data.visibility,
        payerVisibility: data.payerVisibility,
        createdAt: data.createdAt ?? new Date().toISOString(),
      }
      const job = await enqueueHearingJob(marketCase)
      seeded.push({
        caseId: marketCase.id,
        jobId: job.id,
        status: job.status,
        title: marketCase.question,
      })
    }

    return reply.status(seeded.length ? 202 : 400).send({
      status: seeded.length ? 'queued' : 'rejected',
      seeded,
      rejected,
    })
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
    return createPrivateCaseReadChallenge({ wallet, caseId: job.marketCase.id })
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
    const following = await isFollowingCase({ caseId: job.marketCase.id, wallet })
    const challenge = await createCaseFollowChallenge({ wallet, caseId: job.marketCase.id })

    return {
      ...challenge,
      following,
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

    await recordCaseAddedFunding({
      job,
      wallet,
      amountUsdc: verified.amountUsdc,
      onchainCaseId: job.marketCase.onchain.caseId,
      chainId: parsed.data.chainId,
      txHash: parsed.data.txHash,
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

    await recordCaseCancellation({
      job,
      wallet,
      refundUsdc: verified.refundUsdc,
      onchainCaseId: job.marketCase.onchain.caseId,
      chainId: parsed.data.chainId,
      txHash: parsed.data.txHash,
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
    await recordCaseOpen({
      jobId: job.id,
      marketCase,
      chainId: data.onchain.chainId,
      txHash: data.onchain.txHash,
      recordHash: data.onchain.questionHash,
      petitioner: opened.petitioner,
      budgetUsdc: opened.budgetUsdc,
      onchainCaseId: data.onchain.caseId,
      metadataURI: opened.metadataURI,
    })

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

function createAdminSeedCaseId(question: string, marketLink: string) {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42)
  const digest = createHash('sha256').update(`${question}:${marketLink}`).digest('hex').slice(0, 12)
  return `market-${slug || 'case'}-${digest}`
}
