import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'
import { cancelHearingOnchain, settleHearingOnchain } from '../../chains/onchain-settlement.js'
import { env } from '../../config/env.js'
import { runHeliaiaConfiguredHearing } from '../../court/heliaia-ai.js'
import type { CourtArtifact, MarketCase } from '../../court/types.js'
import { isDatabaseConfigured } from '../../db/client.js'
import { notifyCaseCompleted } from '../../integrations/telegram.js'
import { claimDatabaseJob, findReusableDatabaseJob, getDatabaseJob, listDatabaseJobs, recoverStaleDatabaseJobs, saveDatabaseJob } from './persistence.js'
import { dedupeCaseJobs, serializeJob, type HearingJob, type LiveHearingResult } from './types.js'

export type { HearingJob } from './types.js'

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

  if (isDatabaseConfigured) {
    const reusableJob = await findReusableDatabaseJob(marketCase)
    if (reusableJob) {
      void processQueue()
      return serializeJob(reusableJob)
    }
  }

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
    return dedupeCaseJobs(await listDatabaseJobs()).map(serializeJob)
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
  if (result.onchainSettlement?.status === 'recorded') {
    return serializeJob(job)
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
    await recoverStaleDatabaseJobs()
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
  if (isDatabaseConfigured) await recoverStaleDatabaseJobs()

  while (activeJobs < env.HELIA_HEARING_MAX_CONCURRENT) {
    const job = isDatabaseConfigured ? await claimDatabaseJob() : redis ? await popRedisJob() : popMemoryJob()
    if (!job) break
    if (job.status !== 'queued' && job.status !== 'running') continue

    activeJobs += 1
    if (job.status === 'queued') {
      job.status = 'running'
      job.startedAt = new Date().toISOString()
      job.updatedAt = job.startedAt
      void saveJob(job)
    }

    const liveResult: LiveHearingResult = {
      marketCase: job.marketCase,
      artifacts: [],
      transcript: [],
      partial: true,
    }
    job.result = liveResult
    void saveJob(job)
    const heartbeat = startJobHeartbeat(job)

    void runWithOptionalTimeout(
      () => runHeliaiaConfiguredHearing(job.marketCase, {
        onArtifact: async (artifact) => {
          liveResult.artifacts.push(artifact)
          job.updatedAt = new Date().toISOString()
          await saveLiveJobUpdate(job, 'artifact')
        },
        onTurn: async (turn) => {
          liveResult.transcript.push(turn)
          job.updatedAt = new Date().toISOString()
          await saveLiveJobUpdate(job, 'turn')
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
        await saveJob(job)
        void notifyCaseCompleted({
          caseId: job.marketCase.id,
          title: job.marketCase.question,
          verdict: findVerdictSummary(result.artifacts),
          confidence: findVerdictConfidence(result.artifacts),
          receiptCount: onchainSettlement.receipts?.length,
        })
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : 'hearing job failed'
        const onchainSettlement = await cancelHearingOnchain({
          marketCase: job.marketCase,
          reason: `hearing failed: ${message}`,
        }).catch((cancelError: unknown) => ({
          status: 'error' as const,
          reason: cancelError instanceof Error ? cancelError.message : 'onchain cancellation failed',
          receipts: [],
        }))
        job.status = 'failed'
        job.error = message
        job.result = {
          ...liveResult,
          onchainSettlement,
          partial: true,
        }
        job.completedAt = new Date().toISOString()
        job.updatedAt = job.completedAt
        return saveJob(job)
      })
      .finally(() => {
        clearInterval(heartbeat)
        activeJobs = Math.max(0, activeJobs - 1)
        void pruneJobs()
        void processQueue()
      })
  }
}

function startJobHeartbeat(job: HearingJob) {
  const intervalMs = Math.min(30_000, Math.max(5_000, Math.floor(env.HELIA_HEARING_STALE_RUNNING_MS / 3)))
  const heartbeat = setInterval(() => {
    if (job.status !== 'running') return
    job.updatedAt = new Date().toISOString()
    void saveLiveJobUpdate(job, 'heartbeat')
  }, intervalMs)
  heartbeat.unref()
  return heartbeat
}

async function saveLiveJobUpdate(job: HearingJob, stage: 'artifact' | 'turn' | 'heartbeat') {
  await saveJob(job).catch((error) => {
    const message = error instanceof Error ? error.message : 'live hearing save failed'
    console.warn(JSON.stringify({
      service: 'helia-hearing-worker',
      jobId: job.id,
      caseId: job.caseId,
      stage,
      error: message,
      at: new Date().toISOString(),
    }))
  })
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

export class HearingBusyError extends Error {
  name = 'HearingBusyError'
}

function findVerdictSummary(artifacts: CourtArtifact[]) {
  return findLastArtifact(artifacts, (artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')?.summary
}

function findVerdictConfidence(artifacts: CourtArtifact[]) {
  return findLastArtifact(artifacts, (artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')?.confidence
}

function findLastArtifact(artifacts: CourtArtifact[], predicate: (artifact: CourtArtifact) => boolean) {
  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    if (predicate(artifacts[index])) return artifacts[index]
  }
  return undefined
}
