import { eq, inArray } from 'drizzle-orm'
import { env } from '../config/env.js'
import type { CourtArtifact, MarketCase } from '../court/types.js'
import { db, isDatabaseConfigured } from '../db/client.js'
import { onchainReceipts } from '../db/schema.js'
import { getCaseVisibility } from './cases.access.js'
import type { CaseResult, HearingJob } from './cases.types.js'

export async function summarizeCaseDetail(
  job: HearingJob,
  result: CaseResult | undefined,
) {
  const resultMarketCase = (result as { marketCase?: MarketCase } | undefined)?.marketCase
  const marketCase = resultMarketCase ?? job.marketCase
  const extraReceipts = await getCaseRecordedReceipts(marketCase.id, shouldExposePayerWallet(marketCase))
  const settlement = isSettlementObject(result?.onchainSettlement) ? result.onchainSettlement : undefined
  const settlementReceipts = Array.isArray(settlement?.receipts)
    ? settlement.receipts.map((receipt) => redactPayerReceipt(receipt, shouldExposePayerWallet(marketCase)))
    : []
  const onchainSettlement = extraReceipts.length
    ? {
        ...(settlement ?? {}),
        receipts: [
          ...settlementReceipts,
          ...extraReceipts,
        ],
      }
    : settlement
      ? { ...settlement, receipts: settlementReceipts }
      : result?.onchainSettlement

  return {
    case: summarizeCase(job, extraReceipts),
    transcript: Array.isArray(result?.transcript) ? result.transcript : [],
    artifacts: Array.isArray(result?.artifacts) ? result.artifacts : [],
    recordHash: result?.recordHash,
    partial: Boolean(result?.partial),
    onchainSettlement,
  }
}

export function getCaseResult(job: HearingJob): CaseResult | undefined {
  return job.result as CaseResult | undefined
}

export function isPublicListCase(job: HearingJob) {
  return getCaseVisibility(job) === 'public'
}

export function summarizeCase(
  job: HearingJob,
  extraReceipts: Array<{ type: string }> = [],
) {
  const result = job.result as { marketCase?: MarketCase; artifacts?: CourtArtifact[]; recordHash?: string; partial?: boolean; onchainSettlement?: { status?: string; totalPayoutUsdc?: string; capped?: boolean } } | undefined
  const marketCase = result?.marketCase ?? job.marketCase
  const verdict = findLastArtifact(result?.artifacts, (artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')
  const isRefunded = result?.onchainSettlement?.status === 'refunded' || extraReceipts.some((receipt) => receipt.type === 'case-cancel')
  const status = isRefunded
    ? 'Refunded'
    : job.status === 'completed'
    ? 'Verdict'
    : job.status === 'running'
      ? 'Hearing'
      : job.status === 'queued'
        ? 'Queued'
        : 'Failed'

  return {
    id: marketCase.id,
    jobId: job.id,
    title: marketCase.question,
    status,
    market: marketCase.type,
    imageUrl: marketCase.imageUrl,
    links: marketCase.links ?? [],
    updated: job.updatedAt,
    createdAt: job.createdAt,
    resolution: marketCase.context,
    verdict: verdict?.summary ?? (isRefunded ? 'Escrow refunded after hearing failure' : job.status === 'failed' ? job.error : 'Hearing pending'),
    confidence: verdict?.confidence,
    receipt: result?.recordHash,
    probability: extractProbability(verdict),
    horizon: extractHorizon(marketCase),
    visibility: marketCase.visibility ?? 'public',
    payerVisibility: marketCase.payerVisibility ?? 'private',
    parentCaseId: marketCase.parentCaseId,
    filingKind: marketCase.filingKind ?? 'original',
    witnesses: result?.artifacts
      ? Array.from(new Set(result.artifacts.filter((artifact) => artifact.type === 'witness-testimony').map((artifact) => artifact.agentId)))
      : [],
    onchain: marketCase.onchain,
    onchainSettlement: result?.onchainSettlement || isRefunded
      ? {
          status: isRefunded ? 'refunded' : result?.onchainSettlement?.status,
          totalPayoutUsdc: result?.onchainSettlement?.totalPayoutUsdc,
          capped: result?.onchainSettlement?.capped,
        }
      : undefined,
  }
}

export function summarizeLedgerRows(job: HearingJob) {
  const result = job.result as {
    marketCase?: MarketCase
    artifacts?: CourtArtifact[]
    recordHash?: string
    partial?: boolean
    onchainSettlement?: {
      status?: string
      reason?: string
      totalPayoutUsdc?: string
      capped?: boolean
      receipts?: Array<{
        type: string
        txHash: string
        chainId: string
        caseId: string
        recordHash?: string
        amountUsdc?: string
        agentId?: string
        wallet?: string
      }>
      totalBudgetUsdc?: string
      protocolFeeUsdc?: string
    }
  } | undefined
  const marketCase = result?.marketCase ?? job.marketCase
  const exposePayerWallet = shouldExposePayerWallet(marketCase)
  const settlement = findLastArtifact(result?.artifacts, (artifact) => artifact.agentId === 'settlement-clerk')
  const verdict = findLastArtifact(result?.artifacts, (artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')
  const rows = []

  if (marketCase.onchain) {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: 'Case funding',
      amount: `${result?.onchainSettlement?.totalBudgetUsdc ?? marketCase.onchain.budgetUsdc} USDC`,
      status: job.status === 'failed' ? 'Funded' : 'Opened',
      hash: marketCase.onchain.txHash,
      updated: job.updatedAt,
      chainId: marketCase.onchain.chainId,
      txHash: marketCase.onchain.txHash,
      receiptType: 'case-funding',
    })
  }

  if (result?.onchainSettlement?.totalPayoutUsdc) {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: 'Agent payouts',
      amount: `${result.onchainSettlement.totalPayoutUsdc} USDC`,
      status: result.onchainSettlement.status === 'recorded' ? 'Recorded' : 'Pending',
      hash: result.recordHash,
      updated: job.updatedAt,
      chainId: marketCase.onchain?.chainId,
      receiptType: 'agent-payout-summary',
    })
  }

  if (marketCase.onchain && result?.onchainSettlement?.status === 'recorded') {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: 'Protocol fee',
      amount: `${result.onchainSettlement.protocolFeeUsdc ?? formatProtocolFee(marketCase.onchain.budgetUsdc)} USDC`,
      status: 'Recorded',
      hash: result.onchainSettlement.receipts?.find((receipt) => receipt.type === 'case-close')?.txHash,
      updated: job.updatedAt,
      chainId: marketCase.onchain.chainId,
      receiptType: 'protocol-fee',
    })
  }

  for (const receipt of result?.onchainSettlement?.receipts ?? []) {
    rows.push({
      caseId: marketCase.id,
      title: marketCase.question,
      item: formatReceiptType(receipt.type, receipt.agentId),
      amount: receipt.amountUsdc ? `${receipt.amountUsdc} USDC` : receipt.type === 'case-close' ? 'Closed' : 'Recorded',
      status: 'Anchored',
      hash: receipt.txHash,
      updated: job.updatedAt,
      chainId: receipt.chainId,
      txHash: receipt.txHash,
      receiptType: receipt.type,
      agentId: receipt.agentId,
      wallet: isPayerReceiptType(receipt.type) && !exposePayerWallet ? undefined : receipt.wallet,
      payerRedacted: isPayerReceiptType(receipt.type) && !exposePayerWallet ? true : undefined,
    })
  }

  if (rows.length) return rows
  if (!result?.recordHash && !settlement && !verdict) return []

  return [{
    caseId: marketCase.id,
    title: marketCase.question,
    item: settlement ? 'Settlement plan' : 'Verdict record',
    amount: settlement?.costUsd ? `${settlement.costUsd.toFixed(2)} USDC` : 'Pending',
    status: result?.recordHash ? 'Recorded' : job.status,
    hash: result?.recordHash,
    updated: job.updatedAt,
    receiptType: settlement ? 'settlement-plan' : 'verdict-record',
  }]
}

export async function getRecordedReceiptLedgerRows(publicJobs: HearingJob[]) {
  if (!isDatabaseConfigured || !publicJobs.length) return []

  const byCase = new Map(publicJobs.map((job) => [job.marketCase.id, job]))
  const receipts = await db!
    .select()
    .from(onchainReceipts)
    .where(inArray(onchainReceipts.receiptType, ['case-added-funding', 'case-cancel']))

  return receipts.flatMap((receipt) => {
    const job = byCase.get(receipt.caseId)
    if (!job) return []

    const payload = receipt.payload as { amountUsdc?: string; refundUsdc?: string; wallet?: string } | null
    const isCancel = receipt.receiptType === 'case-cancel'
    const exposePayerWallet = shouldExposePayerWallet(job.marketCase)
    return [{
      caseId: job.marketCase.id,
      title: job.marketCase.question,
      item: isCancel ? 'Escrow refund' : 'Added case funding',
      amount: isCancel
        ? payload?.refundUsdc ? `${payload.refundUsdc} USDC` : 'Refunded'
        : payload?.amountUsdc ? `${payload.amountUsdc} USDC` : 'Recorded',
      status: isCancel ? 'Refunded' : 'Anchored',
      hash: receipt.txHash,
      updated: receipt.createdAt.toISOString(),
      chainId: receipt.chainId,
      txHash: receipt.txHash,
      receiptType: receipt.receiptType,
      wallet: exposePayerWallet ? payload?.wallet : undefined,
      payerRedacted: exposePayerWallet ? undefined : true,
    }]
  })
}

export async function getCaseRecordedReceipts(caseId: string, exposePayerWallet = true) {
  if (!isDatabaseConfigured) return []

  const receipts = await db!
    .select()
    .from(onchainReceipts)
    .where(eq(onchainReceipts.caseId, caseId))

  return receipts
    .filter((receipt) => receipt.receiptType === 'case-added-funding' || receipt.receiptType === 'case-cancel')
    .map((receipt) => {
      const payload = receipt.payload as { amountUsdc?: string; refundUsdc?: string; wallet?: string } | null
      return {
        type: receipt.receiptType,
        txHash: receipt.txHash,
        chainId: receipt.chainId,
        caseId,
        amountUsdc: payload?.amountUsdc ?? payload?.refundUsdc,
        wallet: exposePayerWallet ? payload?.wallet : undefined,
        payerRedacted: exposePayerWallet ? undefined : true,
      }
    })
}

function isSettlementObject(value: unknown): value is { status?: string; receipts?: unknown[] } {
  return Boolean(value && typeof value === 'object')
}

function redactPayerReceipt(receipt: unknown, exposePayerWallet: boolean) {
  if (!receipt || typeof receipt !== 'object') return receipt
  const typed = receipt as { type?: string; wallet?: string; payerRedacted?: boolean }
  if (exposePayerWallet || !isPayerReceiptType(typed.type)) return receipt
  return {
    ...typed,
    wallet: undefined,
    payerRedacted: true,
  }
}

function shouldExposePayerWallet(marketCase: MarketCase) {
  return (marketCase.payerVisibility ?? 'private') === 'public'
}

function isPayerReceiptType(type?: string) {
  return type === 'case-funding' || type === 'case-added-funding' || type === 'case-cancel'
}

function formatProtocolFee(budgetUsdc: string) {
  const budget = Number(budgetUsdc)
  if (!Number.isFinite(budget)) return '0.00'
  return (budget * (env.PROTOCOL_FEE_BPS / 10_000)).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function formatReceiptType(type: string, agentId?: string) {
  if (type === 'agent-payout') return agentId ? `Agent payout · ${agentId}` : 'Agent payout'
  if (type === 'case-added-funding') return 'Added case funding'
  if (type === 'case-cancel') return 'Escrow refund'
  if (type === 'case-event') return 'Hearing record'
  if (type === 'case-close') return 'Escrow close'
  return type
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function extractProbability(verdict: CourtArtifact | undefined) {
  const text = `${verdict?.summary ?? ''} ${verdict?.transcriptMessage ?? ''}`
  const range = text.match(/\b(\d{1,2}(?:\.\d+)?)\s*-\s*(\d{1,2}(?:\.\d+)?)\s*%/)
  if (range) return `${range[1]}-${range[2]}%`
  const tail = text.match(/\b(\d{1,2}(?:\.\d+)?)\s*%\s+(?:tail|yes|chance|probability)\b/i)
  return tail ? `${tail[1]}%` : undefined
}

function findLastArtifact(artifacts: CourtArtifact[] | undefined, predicate: (artifact: CourtArtifact) => boolean) {
  if (!artifacts?.length) return undefined

  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    if (predicate(artifacts[index])) return artifacts[index]
  }

  return undefined
}

function extractHorizon(marketCase: MarketCase) {
  const text = `${marketCase.question} ${marketCase.context ?? ''}`
  const date = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/i)
  if (date) return date[0]
  const relative = text.match(/\b\d+\s*(?:hours?|days?|weeks?|months?)\b/i)
  return relative?.[0] ?? 'Open'
}
