import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import Redis from 'ioredis'
import { settleHearingOnchain, type OnchainSettlementResult } from '../chains/onchain-settlement.js'
import { env } from '../config/env.js'
import { runHeliaiaConfiguredHearing } from '../court/heliaia-ai.js'
import type { CourtArtifact, CourtTranscriptTurn, MarketCase, ToolEvidence } from '../court/types.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { cases, courtArtifacts, hearingJobs, onchainReceipts, settlementRows, toolEvidence, transcriptTurns, verdicts } from '../db/schema.js'

type HearingJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export type HearingJob = {
  id: string
  caseId: string
  status: HearingJobStatus
  marketCase: MarketCase
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  result?: unknown
}

type LiveHearingResult = {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript: CourtTranscriptTurn[]
  recordHash?: string
  partial: boolean
  onchainSettlement?: OnchainSettlementResult
}

const jobs = new Map<string, HearingJob>()
const queue: string[] = []
const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    })
  : undefined
const queueKey = `${env.HELIA_REDIS_PREFIX}:hearing:queue`
const jobKey = (jobId: string) => `${env.HELIA_REDIS_PREFIX}:hearing:job:${jobId}`
let queuePoller: NodeJS.Timeout | undefined
let activeJobs = 0

export async function enqueueHearingJob(marketCase: MarketCase) {
  await pruneJobs()

  const now = new Date().toISOString()
  const job: HearingJob = {
    id: `hearing-${randomUUID()}`,
    caseId: marketCase.id,
    status: 'queued',
    marketCase,
    createdAt: now,
    updatedAt: now,
  }

  if (isDatabaseConfigured) {
    await saveDatabaseJob(job)
    void processQueue()

    return serializeJob(job)
  }

  if (redis) {
    await connectRedis()
    await writeRedisJob(job)
    await redis.rpush(queueKey, job.id)
    void processQueue()

    return serializeJob(job)
  }

  jobs.set(job.id, job)
  queue.push(job.id)
  void processQueue()

  return serializeJob(job)
}

export async function getHearingJob(jobId: string) {
  if (isDatabaseConfigured) {
    const job = await getDatabaseJob(jobId)
    return job ? serializeJob(job) : undefined
  }

  if (redis) {
    await connectRedis()
    const raw = await redis.get(jobKey(jobId))
    return raw ? serializeJob(JSON.parse(raw) as HearingJob) : undefined
  }

  const job = jobs.get(jobId)
  return job ? serializeJob(job) : undefined
}

export async function listHearingJobs() {
  if (isDatabaseConfigured) {
    return (await listDatabaseJobs()).map(serializeJob)
  }

  if (redis) {
    await connectRedis()
    const keys = await redis.keys(`${env.HELIA_REDIS_PREFIX}:hearing:job:*`).catch(() => [])
    const values = await Promise.all(keys.map((key) => redis.get(key).catch(() => null)))

    return values
      .map((raw) => raw ? JSON.parse(raw) as HearingJob : undefined)
      .filter((job): job is HearingJob => Boolean(job))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map(serializeJob)
  }

  return [...jobs.values()]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .map(serializeJob)
}

export async function retryOnchainSettlement(caseId: string) {
  const jobs = await listHearingJobs()
  const job = jobs.find((item) => item.caseId === caseId || item.marketCase.id === caseId)
  if (!job) return undefined
  if (job.status !== 'completed') {
    throw new Error(`case is ${job.status}; settlement can only be retried after verdict`)
  }

  const result = job.result as LiveHearingResult | undefined
  if (!result?.marketCase || !Array.isArray(result.artifacts) || !Array.isArray(result.transcript)) {
    throw new Error('completed case is missing hearing artifacts or transcript')
  }

  const onchainSettlement = await settleHearingOnchain({
    marketCase: result.marketCase,
    artifacts: result.artifacts,
    transcript: result.transcript,
    recordHash: result.recordHash,
  })
  const updatedJob: HearingJob = {
    ...job,
    result: {
      ...result,
      onchainSettlement,
      partial: false,
    },
    updatedAt: new Date().toISOString(),
  }
  await saveJob(updatedJob)

  return serializeJob(updatedJob)
}

export function startHearingJobWorker() {
  if (queuePoller) return

  void processQueue()
  queuePoller = setInterval(() => {
    void processQueue()
  }, env.HELIA_HEARING_QUEUE_POLL_MS)
  queuePoller.unref()
}

export async function getHearingQueueStats() {
  if (isDatabaseConfigured) {
    const waiting = (await listDatabaseJobs()).filter((job) => job.status === 'queued').length
    return {
      backend: 'postgres',
      waiting,
      active: activeJobs,
      maxConcurrent: env.HELIA_HEARING_MAX_CONCURRENT,
    }
  }

  if (redis) {
    await connectRedis()
    const waiting = await redis.llen(queueKey).catch(() => 0)
    return {
      backend: 'redis',
      waiting,
      active: activeJobs,
      maxConcurrent: env.HELIA_HEARING_MAX_CONCURRENT,
    }
  }

  return {
    backend: 'memory',
    waiting: queue.length,
    active: activeJobs,
    maxConcurrent: env.HELIA_HEARING_MAX_CONCURRENT,
  }
}

export async function runHearingNow(marketCase: MarketCase) {
  if (activeJobs >= env.HELIA_HEARING_MAX_CONCURRENT) {
    throw new HearingBusyError('hearing worker is busy; use /agents/hearing/jobs for queued execution')
  }

  activeJobs += 1
  try {
    return await runWithOptionalTimeout(() => runHeliaiaConfiguredHearing(marketCase), env.HELIA_HEARING_TIMEOUT_MS)
  } finally {
    activeJobs = Math.max(0, activeJobs - 1)
    void processQueue()
  }
}

async function processQueue() {
  while (activeJobs < env.HELIA_HEARING_MAX_CONCURRENT) {
    const job = isDatabaseConfigured ? await popDatabaseJob() : redis ? await popRedisJob() : popMemoryJob()
    if (!job) break
    if (job.status !== 'queued') continue

    activeJobs += 1
    job.status = 'running'
    job.startedAt = new Date().toISOString()
    job.updatedAt = job.startedAt
    void saveJob(job)

    const liveResult: LiveHearingResult = {
      marketCase: job.marketCase,
      artifacts: [],
      transcript: [],
      partial: true,
    }
    job.result = liveResult
    void saveJob(job)

    void runWithOptionalTimeout(
      () => runHeliaiaConfiguredHearing(job.marketCase, {
        onArtifact: async (artifact) => {
          liveResult.artifacts.push(artifact)
          job.updatedAt = new Date().toISOString()
          await saveJob(job)
        },
        onTurn: async (turn) => {
          liveResult.transcript.push(turn)
          job.updatedAt = new Date().toISOString()
          await saveJob(job)
        },
      }),
      env.HELIA_HEARING_TIMEOUT_MS,
    )
      .then(async (result) => {
        const onchainSettlement = await settleHearingOnchain(result).catch((error) => ({
          status: 'error' as const,
          reason: error instanceof Error ? error.message : 'onchain settlement failed',
          receipts: [],
        }))
        job.status = 'completed'
        job.result = {
          ...result,
          onchainSettlement,
          partial: false,
        }
        job.completedAt = new Date().toISOString()
        job.updatedAt = job.completedAt
        return saveJob(job)
      })
      .catch((error) => {
        job.status = 'failed'
        job.error = error instanceof Error ? error.message : 'hearing job failed'
        job.completedAt = new Date().toISOString()
        job.updatedAt = job.completedAt
        return saveJob(job)
      })
      .finally(() => {
        activeJobs = Math.max(0, activeJobs - 1)
        void pruneJobs()
        void processQueue()
      })
  }
}

function popMemoryJob() {
  const jobId = queue.shift()
  return jobId ? jobs.get(jobId) : undefined
}

async function popRedisJob() {
  if (!redis) return undefined

  await connectRedis()
  const jobId = await redis.lpop(queueKey)
  if (!jobId) return undefined

  const raw = await redis.get(jobKey(jobId))
  return raw ? JSON.parse(raw) as HearingJob : undefined
}

async function runWithOptionalTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return run()

  let timeout: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`hearing timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function pruneJobs() {
  if (isDatabaseConfigured) return
  if (redis) return

  const now = Date.now()
  const removable = [...jobs.values()]
    .filter((job) => job.status === 'completed' || job.status === 'failed')
    .filter((job) => now - Date.parse(job.completedAt ?? job.updatedAt) > env.HELIA_HEARING_JOB_RETENTION_MS)
    .map((job) => job.id)

  for (const jobId of removable) jobs.delete(jobId)

  const overflow = jobs.size - env.HELIA_HEARING_MAX_RETAINED_JOBS
  if (overflow <= 0) return

  const oldestFinished = [...jobs.values()]
    .filter((job) => job.status === 'completed' || job.status === 'failed')
    .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))
    .slice(0, overflow)

  for (const job of oldestFinished) jobs.delete(job.id)
}

async function saveJob(job: HearingJob) {
  if (isDatabaseConfigured) {
    await saveDatabaseJob(job)
    return
  }

  if (redis) {
    await writeRedisJob(job)
    return
  }

  jobs.set(job.id, job)
}

async function writeRedisJob(job: HearingJob) {
  if (!redis) return

  await connectRedis()
  await redis.set(jobKey(job.id), JSON.stringify(job), 'PX', env.HELIA_HEARING_JOB_RETENTION_MS)
}

async function connectRedis() {
  if (!redis || redis.status === 'ready') return
  if (redis.status === 'connecting' || redis.status === 'connect') return

  await redis.connect()
}

async function popDatabaseJob() {
  const [row] = await db!
    .select()
    .from(hearingJobs)
    .where(eq(hearingJobs.status, 'queued'))
    .orderBy(hearingJobs.createdAt)
    .limit(1)

  return row ? rowToJob(row) : undefined
}

async function getDatabaseJob(jobId: string) {
  const [row] = await db!
    .select()
    .from(hearingJobs)
    .where(eq(hearingJobs.id, jobId))
    .limit(1)

  return row ? rowToJob(row) : undefined
}

async function listDatabaseJobs() {
  const rows = await db!
    .select()
    .from(hearingJobs)
    .orderBy(desc(hearingJobs.updatedAt))

  return rows.map(rowToJob)
}

async function saveDatabaseJob(job: HearingJob) {
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
      filer: marketCase.filer ?? null,
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
        filer: marketCase.filer ?? null,
        updatedAt: toDate(updatedAt),
      },
    })
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

function toDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : new Date()
}

function serializeJob(job: HearingJob) {
  return {
    id: job.id,
    caseId: job.caseId,
    status: job.status,
    marketCase: job.marketCase,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    result: job.result,
  }
}

export class HearingBusyError extends Error {
  name = 'HearingBusyError'
}
