import { and, eq, isNull } from 'drizzle-orm'
import { verifyMessage } from 'viem'
import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { authChallenges } from '../db/schema.js'
import { isCaseParticipant } from './cases.repository.js'
import type { HearingJob } from './cases.types.js'

const CASE_READ_PURPOSE_PREFIX = 'case:read'
const CASE_FOLLOW_PURPOSE_PREFIX = 'case:follow'

export function canReadPrivateCase(job: HearingJob, wallet: string) {
  return isCaseParticipant({ caseId: job.marketCase.id, wallet })
}

export async function canAccessCaseAction(job: HearingJob, wallet: string) {
  return getCaseVisibility(job) !== 'private' || await canReadPrivateCase(job, wallet)
}

export async function consumeCaseReadChallenge({
  wallet,
  caseId,
  message,
  signature,
}: {
  wallet: string
  caseId: string
  message: string
  signature: `0x${string}`
}) {
  return consumeCaseActionChallenge({
    wallet,
    caseId,
    purpose: caseReadPurpose(caseId),
    message,
    signature,
    missingError: 'case access challenge was not found or was already used',
    expiredError: 'case access challenge expired',
    invalidError: 'case access signature did not match the connected wallet',
  })
}

export async function consumeCaseActionChallenge({
  wallet,
  purpose,
  message,
  signature,
  missingError,
  expiredError,
  invalidError,
}: {
  wallet: string
  caseId: string
  purpose: string
  message: string
  signature: `0x${string}`
  missingError: string
  expiredError: string
  invalidError: string
}) {
  const [challenge] = await db!
    .select()
    .from(authChallenges)
    .where(and(
      eq(authChallenges.wallet, wallet),
      eq(authChallenges.message, message),
      eq(authChallenges.purpose, purpose),
      isNull(authChallenges.consumedAt),
    ))
    .limit(1)

  if (!challenge) return { ok: false, error: missingError }
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: expiredError }

  const isValid = await verifyMessage({
    address: wallet as `0x${string}`,
    message,
    signature,
  }).catch(() => false)

  if (!isValid) return { ok: false, error: invalidError }

  await db!
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(authChallenges.id, challenge.id))

  return { ok: true }
}

export function buildCaseReadChallengeMessage({
  wallet,
  caseId,
  nonce,
  issuedAt,
  expiresAt,
}: {
  wallet: string
  caseId: string
  nonce: string
  issuedAt: Date
  expiresAt: Date
}) {
  return [
    'Helia Court private case access',
    '',
    `Origin: ${env.APP_ORIGIN}`,
    `Wallet: ${wallet}`,
    `Case: ${caseId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    '',
    'Sign this message to unlock a private Helia Court case you are authorized to read. This does not send a transaction or spend gas.',
  ].join('\n')
}

export function buildCaseFollowChallengeMessage({
  wallet,
  caseId,
  nonce,
  issuedAt,
  expiresAt,
}: {
  wallet: string
  caseId: string
  nonce: string
  issuedAt: Date
  expiresAt: Date
}) {
  return [
    'Helia Court follow case',
    '',
    `Origin: ${env.APP_ORIGIN}`,
    `Wallet: ${wallet}`,
    `Case: ${caseId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    '',
    'Sign this message to follow or unfollow this Helia Court case. This does not send a transaction or spend gas.',
  ].join('\n')
}

export function caseReadPurpose(caseId: string) {
  return `${CASE_READ_PURPOSE_PREFIX}:${caseId}`
}

export function caseFollowPurpose(caseId: string) {
  return `${CASE_FOLLOW_PURPOSE_PREFIX}:${caseId}`
}

export function authorizeAdminRequest(headers: Record<string, string | string[] | undefined>) {
  if (!env.HELIA_ADMIN_KEY) {
    return {
      ok: false as const,
      status: 503,
      error: 'admin settlement retry is disabled until HELIA_ADMIN_KEY is configured',
    }
  }

  const header = headers['x-helia-admin-key']
  const supplied = Array.isArray(header) ? header[0] : header
  if (supplied !== env.HELIA_ADMIN_KEY) {
    return {
      ok: false as const,
      status: 401,
      error: 'invalid admin key',
    }
  }

  return { ok: true as const }
}

export function formatValidationIssues(error: { issues: Array<{ path: Array<string | number | symbol>; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

export function getCaseVisibility(job: HearingJob) {
  const result = job.result as { marketCase?: HearingJob['marketCase'] } | undefined
  const marketCase = result?.marketCase ?? job.marketCase
  return marketCase.visibility ?? 'public'
}
