import { randomUUID } from 'node:crypto'
import { db } from '../db/client.js'
import { authChallenges } from '../db/schema.js'
import {
  buildCaseFollowChallengeMessage,
  buildCaseReadChallengeMessage,
  caseFollowPurpose,
  caseReadPurpose,
} from './cases.access.js'

const CHALLENGE_TTL_MS = 5 * 60 * 1000

export async function createPrivateCaseReadChallenge({ wallet, caseId }: { wallet: string; caseId: string }) {
  return createCaseChallenge({
    wallet,
    caseId,
    purpose: caseReadPurpose(caseId),
    buildMessage: buildCaseReadChallengeMessage,
  })
}

export async function createCaseFollowChallenge({ wallet, caseId }: { wallet: string; caseId: string }) {
  return createCaseChallenge({
    wallet,
    caseId,
    purpose: caseFollowPurpose(caseId),
    buildMessage: buildCaseFollowChallengeMessage,
  })
}

async function createCaseChallenge({
  wallet,
  caseId,
  purpose,
  buildMessage,
}: {
  wallet: string
  caseId: string
  purpose: string
  buildMessage: (input: {
    wallet: string
    caseId: string
    nonce: string
    issuedAt: Date
    expiresAt: Date
  }) => string
}) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS)
  const nonce = randomUUID()
  const message = buildMessage({
    wallet,
    caseId,
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
      purpose,
      expiresAt,
      createdAt: now,
    })

  return {
    wallet,
    caseId,
    nonce,
    message,
    expiresAt: expiresAt.toISOString(),
  }
}
