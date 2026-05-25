import type { FastifyReply } from 'fastify'
import { listHearingJobs } from '../../agents/hearings/index.js'
import type { CourtArtifact, CourtTranscriptTurn } from '../../court/types.js'

export async function getPublicJob(caseId: string, reply: FastifyReply) {
  const jobs = await listHearingJobs()
  const job = jobs.find((item) => item.marketCase.id === caseId || item.caseId === caseId || item.id === caseId)
  if (!job || (job.marketCase.visibility ?? 'public') !== 'public') {
    reply.status(404).send({ error: 'case not found' })
    return undefined
  }
  return job
}

export function getResult(job: Awaited<ReturnType<typeof listHearingJobs>>[number]) {
  return job.result as {
    recordHash?: string
    artifacts?: CourtArtifact[]
    transcript?: CourtTranscriptTurn[]
    onchainSettlement?: {
      receipts?: unknown[]
    }
  } | undefined
}

export function findVerdict(artifacts?: CourtArtifact[]) {
  return artifacts?.filter((artifact) => artifact.type === 'verdict').at(-1)
}

export function formatJobStatus(value: string) {
  if (value === 'completed') return 'Verdict'
  if (value === 'running') return 'Hearing'
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}
