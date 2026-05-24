import { and, eq } from 'drizzle-orm'
import { listHearingJobs } from '../agents/hearing-jobs.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { caseFollows, caseParticipants, users } from '../db/schema.js'

export async function findCaseJob(caseId: string) {
  const jobs = await listHearingJobs()
  return jobs.find((job) => job.caseId === caseId || job.marketCase.id === caseId)
}

export async function isCaseParticipant({ caseId, wallet }: { caseId: string; wallet: string }) {
  if (!isDatabaseConfigured) return false
  const [participant] = await db!
    .select({ id: caseParticipants.id })
    .from(caseParticipants)
    .where(and(
      eq(caseParticipants.caseId, caseId),
      eq(caseParticipants.wallet, wallet),
    ))
    .limit(1)
  return Boolean(participant)
}

export async function isFollowingCase({ caseId, wallet }: { caseId: string; wallet: string }) {
  if (!isDatabaseConfigured) return false
  const [follow] = await db!
    .select({ id: caseFollows.id })
    .from(caseFollows)
    .where(and(
      eq(caseFollows.caseId, caseId),
      eq(caseFollows.wallet, wallet),
    ))
    .limit(1)
  return Boolean(follow)
}

export async function ensureUser(wallet: string) {
  const now = new Date()
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
}
