import { and, desc, eq, lt, or } from 'drizzle-orm'
import { env } from '../../config/env.js'
import type { CourtArtifact, MarketCase, ToolEvidence } from '../../court/types.js'
import { db } from '../../db/client.js'
import { caseParticipants, cases, courtArtifacts, hearingJobs, onchainReceipts, settlementRows, toolEvidence, transcriptTurns, users, verdicts } from '../../db/schema.js'
import { compareCanonicalJobs, type HearingJob, type HearingJobStatus, type LiveHearingResult } from './types.js'

export async function claimDatabaseJob() {
  const [row] = await db!
    .select()
    .from(hearingJobs)
    .where(eq(hearingJobs.status, 'queued'))
    .orderBy(hearingJobs.createdAt)
    .limit(1)

  if (!row) return undefined

  const now = new Date()
  const [claimed] = await db!
    .update(hearingJobs)
    .set({
      status: 'running',
      startedAt: row.startedAt ?? now,
      updatedAt: now,
      error: null,
    })
    .where(and(eq(hearingJobs.id, row.id), eq(hearingJobs.status, 'queued')))
    .returning()

  return claimed ? rowToJob(claimed) : undefined
}

export async function getDatabaseJob(jobId: string) {
  const [row] = await db!
    .select()
    .from(hearingJobs)
    .where(eq(hearingJobs.id, jobId))
    .limit(1)

  return row ? rowToJob(row) : undefined
}

export async function deleteUnfundedDatabaseJob(jobIdOrCaseId: string) {
  const [row] = await db!
    .select()
    .from(hearingJobs)
    .where(or(eq(hearingJobs.id, jobIdOrCaseId), eq(hearingJobs.caseId, jobIdOrCaseId)))
    .limit(1)

  if (!row) return { deleted: false as const, reason: 'not-found' as const }

  const job = rowToJob(row)
  if (job.marketCase.onchain || job.marketCase.filer) {
    return { deleted: false as const, reason: 'funded-or-owned' as const, job }
  }

  await db!
    .delete(cases)
    .where(eq(cases.id, row.caseId))

  return { deleted: true as const, job }
}

export async function listDatabaseJobs() {
  const rows = await db!
    .select()
    .from(hearingJobs)
    .orderBy(desc(hearingJobs.updatedAt))

  return rows.map(rowToJob)
}

export async function findReusableDatabaseJob(marketCase: MarketCase) {
  const existing = (await listDatabaseJobs())
    .filter((job) => job.caseId === marketCase.id)
    .sort(compareCanonicalJobs)

  const candidate = existing[0]
  if (!candidate) return undefined
  if (candidate.status === 'completed' || candidate.status === 'queued') return candidate

  if (candidate.status === 'running' && isStaleJob(candidate)) {
    const requeued: HearingJob = {
      ...candidate,
      status: 'queued',
      marketCase,
      updatedAt: new Date().toISOString(),
      error: undefined,
    }
    await saveDatabaseJob(requeued)
    return requeued
  }

  if (candidate.status === 'running') return candidate
  return undefined
}

export async function recoverStaleDatabaseJobs() {
  const cutoff = new Date(Date.now() - env.HELIA_HEARING_STALE_RUNNING_MS)
  await db!
    .update(hearingJobs)
    .set({
      status: 'queued',
      updatedAt: new Date(),
      error: null,
    })
    .where(and(eq(hearingJobs.status, 'running'), lt(hearingJobs.updatedAt, cutoff)))
}

export async function saveDatabaseJob(job: HearingJob) {
  await upsertDatabaseCase(job.marketCase, job.updatedAt)
  await db!
    .insert(hearingJobs)
    .values({
      id: job.id,
      caseId: job.caseId,
      status: job.status,
      marketCase: job.marketCase,
      result: job.result ?? null,
      error: job.error ?? null,
      createdAt: toDate(job.createdAt),
      updatedAt: toDate(job.updatedAt),
      startedAt: job.startedAt ? toDate(job.startedAt) : null,
      completedAt: job.completedAt ? toDate(job.completedAt) : null,
    })
    .onConflictDoUpdate({
      target: hearingJobs.id,
      set: {
        status: job.status,
        marketCase: job.marketCase,
        result: job.result ?? null,
        error: job.error ?? null,
        updatedAt: toDate(job.updatedAt),
        startedAt: job.startedAt ? toDate(job.startedAt) : null,
        completedAt: job.completedAt ? toDate(job.completedAt) : null,
      },
    })

  await persistJobResult(job)
}

async function upsertDatabaseCase(marketCase: MarketCase, updatedAt: string) {
  await db!
    .insert(cases)
    .values({
      id: marketCase.id,
      question: marketCase.question,
      context: marketCase.context ?? null,
      links: marketCase.links ?? null,
      type: marketCase.type,
      parentCaseId: marketCase.parentCaseId ?? null,
      filingKind: marketCase.filingKind ?? 'original',
      filer: marketCase.filer ?? null,
      visibility: marketCase.visibility ?? 'public',
      payerVisibility: marketCase.payerVisibility ?? 'private',
      createdAt: toDate(marketCase.createdAt),
      updatedAt: toDate(updatedAt),
    })
    .onConflictDoUpdate({
      target: cases.id,
      set: {
        question: marketCase.question,
        context: marketCase.context ?? null,
        links: marketCase.links ?? null,
        type: marketCase.type,
        parentCaseId: marketCase.parentCaseId ?? null,
        filingKind: marketCase.filingKind ?? 'original',
        filer: marketCase.filer ?? null,
        visibility: marketCase.visibility ?? 'public',
        payerVisibility: marketCase.payerVisibility ?? 'private',
        updatedAt: toDate(updatedAt),
      },
    })

  if (marketCase.filer) {
    const wallet = normalizeWallet(marketCase.filer)
    const now = toDate(updatedAt)

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

    await db!
      .insert(caseParticipants)
      .values({
        id: `${marketCase.id}:${wallet}:filer`,
        caseId: marketCase.id,
        wallet,
        role: 'filer',
        createdAt: now,
      })
      .onConflictDoNothing()
  }
}

async function persistJobResult(job: HearingJob) {
  const result = job.result as LiveHearingResult | undefined
  if (!result) return

  for (const turn of result.transcript ?? []) {
    await db!
      .insert(transcriptTurns)
      .values({
        id: `${job.id}:${turn.id}`,
        jobId: job.id,
        caseId: job.caseId,
        agentId: turn.agentId,
        agentName: turn.agentName,
        seat: turn.seat,
        kind: turn.kind,
        stage: turn.stage,
        message: turn.message,
        replyToId: turn.replyToId ?? null,
        requestedAgentId: turn.requestedAgentId ?? null,
        request: turn.request ?? null,
        artifactId: turn.artifactId ?? null,
        confidence: turn.confidence ?? null,
        tags: turn.tags ?? null,
        payload: turn,
        createdAt: toDate(turn.createdAt),
      })
      .onConflictDoUpdate({
        target: transcriptTurns.id,
        set: {
          message: turn.message,
          payload: turn,
          confidence: turn.confidence ?? null,
          tags: turn.tags ?? null,
        },
      })
  }

  for (const artifact of result.artifacts ?? []) {
    await db!
      .insert(courtArtifacts)
      .values({
        id: artifact.id,
        jobId: job.id,
        caseId: job.caseId,
        agentId: artifact.agentId,
        type: artifact.type,
        summary: artifact.summary,
        confidence: artifact.confidence ?? null,
        costUsd: artifact.costUsd,
        runMode: artifact.runMode ?? null,
        modelProvider: artifact.modelProvider ?? null,
        model: artifact.model ?? null,
        payload: artifact,
        createdAt: toDate(artifact.createdAt),
      })
      .onConflictDoUpdate({
        target: courtArtifacts.id,
        set: {
          summary: artifact.summary,
          confidence: artifact.confidence ?? null,
          costUsd: artifact.costUsd,
          runMode: artifact.runMode ?? null,
          modelProvider: artifact.modelProvider ?? null,
          model: artifact.model ?? null,
          payload: artifact,
        },
      })

    await persistToolEvidence(job, artifact, artifact.toolEvidence ?? [])

    if (artifact.type === 'verdict' && artifact.agentId === 'head-judge') {
      await db!
        .insert(verdicts)
        .values({
          id: `${job.id}:${artifact.id}`,
          jobId: job.id,
          caseId: job.caseId,
          artifactId: artifact.id,
          summary: artifact.summary,
          confidence: artifact.confidence ?? null,
          recordHash: result.recordHash ?? null,
          payload: artifact,
          createdAt: toDate(artifact.createdAt),
        })
        .onConflictDoUpdate({
          target: verdicts.id,
          set: {
            summary: artifact.summary,
            confidence: artifact.confidence ?? null,
            recordHash: result.recordHash ?? null,
            payload: artifact,
          },
        })
    }

    if (artifact.agentId === 'settlement-clerk') {
      await db!
        .insert(settlementRows)
        .values({
          id: `${job.id}:${artifact.id}`,
          jobId: job.id,
          caseId: job.caseId,
          artifactId: artifact.id,
          item: 'Settlement receipt',
          amount: artifact.costUsd ? `${artifact.costUsd.toFixed(2)} USDC` : 'Pending',
          status: result.recordHash ? 'Recorded' : job.status,
          recordHash: result.recordHash ?? null,
          payload: artifact,
          createdAt: toDate(artifact.createdAt),
        })
        .onConflictDoUpdate({
          target: settlementRows.id,
          set: {
            amount: artifact.costUsd ? `${artifact.costUsd.toFixed(2)} USDC` : 'Pending',
            status: result.recordHash ? 'Recorded' : job.status,
            recordHash: result.recordHash ?? null,
            payload: artifact,
          },
        })
    }
  }

  for (const receipt of result.onchainSettlement?.receipts ?? []) {
    await db!
      .insert(onchainReceipts)
      .values({
        id: `${job.id}:${receipt.type}:${receipt.txHash}`,
        caseId: job.caseId,
        jobId: job.id,
        chainId: receipt.chainId,
        txHash: receipt.txHash,
        receiptType: receipt.type,
        recordHash: receipt.recordHash ?? null,
        payload: receipt,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: onchainReceipts.id,
        set: {
          recordHash: receipt.recordHash ?? null,
          payload: receipt,
        },
      })
  }
}

async function persistToolEvidence(job: HearingJob, artifact: CourtArtifact, evidence: ToolEvidence[]) {
  for (const [index, item] of evidence.entries()) {
    await db!
      .insert(toolEvidence)
      .values({
        id: `${job.id}:${artifact.id}:tool-${index}`,
        jobId: job.id,
        caseId: job.caseId,
        artifactId: artifact.id,
        capability: item.capability,
        provider: item.provider,
        query: item.query,
        status: item.status,
        relevance: item.relevance ?? null,
        observations: item.observations,
        sources: item.sources,
        error: item.error ?? null,
        payload: item,
        fetchedAt: toDate(item.fetchedAt),
      })
      .onConflictDoUpdate({
        target: toolEvidence.id,
        set: {
          status: item.status,
          relevance: item.relevance ?? null,
          observations: item.observations,
          sources: item.sources,
          error: item.error ?? null,
          payload: item,
        },
      })
  }
}

function rowToJob(row: typeof hearingJobs.$inferSelect): HearingJob {
  return {
    id: row.id,
    caseId: row.caseId,
    status: row.status as HearingJobStatus,
    marketCase: row.marketCase as MarketCase,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    error: row.error ?? undefined,
    result: row.result ?? undefined,
  }
}

function isStaleJob(job: HearingJob) {
  if (job.status !== 'running') return false
  return Date.now() - Date.parse(job.updatedAt) > env.HELIA_HEARING_STALE_RUNNING_MS
}

function toDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : new Date()
}

function normalizeWallet(value: string) {
  return value.toLowerCase()
}
