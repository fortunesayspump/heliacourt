import { db, isDatabaseConfigured } from '../db/client.js'
import { caseParticipants, onchainReceipts } from '../db/schema.js'
import type { MarketCase } from '../court/types.js'
import type { HearingJob } from './cases.types.js'
import { ensureUser } from './cases.repository.js'

export async function recordCaseAddedFunding({
  job,
  wallet,
  chainId,
  txHash,
  amountUsdc,
  onchainCaseId,
}: {
  job: HearingJob
  wallet: string
  chainId: string
  txHash: string
  amountUsdc: string
  onchainCaseId: string
}) {
  const now = new Date()
  await ensureUser(wallet)
  await db!
    .insert(caseParticipants)
    .values({
      id: `${job.marketCase.id}:${wallet}:backer`,
      caseId: job.marketCase.id,
      wallet,
      role: 'backer',
      createdAt: now,
    })
    .onConflictDoNothing()

  const payload = {
    type: 'case-added-funding',
    wallet,
    amountUsdc,
    onchainCaseId,
  }
  await db!
    .insert(onchainReceipts)
    .values({
      id: `${job.id}:case-added-funding:${txHash}`,
      caseId: job.marketCase.id,
      jobId: job.id,
      chainId,
      txHash,
      receiptType: 'case-added-funding',
      recordHash: null,
      payload,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: onchainReceipts.id,
      set: { payload },
    })
}

export async function recordCaseCancellation({
  job,
  wallet,
  chainId,
  txHash,
  refundUsdc,
  onchainCaseId,
}: {
  job: HearingJob
  wallet: string
  chainId: string
  txHash: string
  refundUsdc: string
  onchainCaseId: string
}) {
  const now = new Date()
  await ensureUser(wallet)
  const payload = {
    type: 'case-cancelled',
    wallet,
    refundUsdc,
    onchainCaseId,
  }
  await db!
    .insert(onchainReceipts)
    .values({
      id: `${job.id}:case-cancelled:${txHash}`,
      caseId: job.marketCase.id,
      jobId: job.id,
      chainId,
      txHash,
      receiptType: 'case-cancel',
      recordHash: null,
      payload,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: onchainReceipts.id,
      set: { payload },
    })
}

export async function recordCaseOpen({
  jobId,
  marketCase,
  chainId,
  txHash,
  recordHash,
  petitioner,
  budgetUsdc,
  onchainCaseId,
  metadataURI,
}: {
  jobId: string
  marketCase: MarketCase
  chainId: string
  txHash: string
  recordHash: string
  petitioner: string
  budgetUsdc: string
  onchainCaseId: string
  metadataURI?: string
}) {
  if (!isDatabaseConfigured) return
  await db!
    .insert(onchainReceipts)
    .values({
      id: `${jobId}:case-open:${txHash}`,
      caseId: marketCase.id,
      jobId,
      chainId,
      txHash,
      receiptType: 'case-open',
      recordHash,
      payload: {
        type: 'case-open',
        wallet: petitioner,
        amountUsdc: budgetUsdc,
        onchainCaseId,
        metadataURI,
      },
      createdAt: new Date(),
    })
    .onConflictDoNothing()
}
