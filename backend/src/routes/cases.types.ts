import type { listHearingJobs } from '../agents/hearing-jobs.js'
import type { CourtArtifact, MarketCase } from '../court/types.js'

export type HearingJob = Awaited<ReturnType<typeof listHearingJobs>>[number]

export type CaseResult = {
  marketCase?: MarketCase
  artifacts?: CourtArtifact[]
  transcript?: unknown[]
  recordHash?: string
  partial?: boolean
  onchainSettlement?: unknown
}
