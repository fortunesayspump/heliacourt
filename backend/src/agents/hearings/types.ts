import type { OnchainSettlementResult } from '../../chains/onchain-settlement.js'
import type { CourtArtifact, CourtTranscriptTurn, MarketCase } from '../../court/types.js'

export type HearingJobStatus = 'queued' | 'running' | 'completed' | 'failed'

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

export type LiveHearingResult = {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript: CourtTranscriptTurn[]
  recordHash?: string
  partial: boolean
  onchainSettlement?: OnchainSettlementResult
}

export function serializeJob(job: HearingJob) {
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

export function compareCanonicalJobs(left: HearingJob, right: HearingJob) {
  const statusRank: Record<HearingJobStatus, number> = {
    completed: 0,
    running: 1,
    queued: 2,
    failed: 3,
  }
  const statusDelta = statusRank[left.status] - statusRank[right.status]
  if (statusDelta !== 0) return statusDelta
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

export function dedupeCaseJobs(caseJobs: HearingJob[]) {
  const byCase = new Map<string, HearingJob>()

  for (const job of caseJobs) {
    const current = byCase.get(job.caseId)
    if (!current || compareCanonicalJobs(job, current) < 0) {
      byCase.set(job.caseId, job)
    }
  }

  return [...byCase.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}
