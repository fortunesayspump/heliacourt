import { randomUUID } from 'node:crypto'
import { desc, eq, sql } from 'drizzle-orm'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import { x402Receipts } from '../../db/schema.js'
import type { PaidEvidence } from './types.js'

export async function recordX402Receipt(caseId: string, resource: string, paid: PaidEvidence) {
  if (!db || !paid.txHash) return
  try {
    await db.insert(x402Receipts).values({
      id: randomUUID(),
      caseId,
      payer: paid.payer?.toLowerCase(),
      transactionId: paid.txHash,
      amountMicroUsdc: String(paid.amountMicroUsdc),
      network: paid.network ?? `eip155:${env.ARC_CHAIN_ID}`,
      resource,
      createdAt: new Date(),
    }).onConflictDoNothing()
  } catch (error) {
    console.warn('[x402] failed to record receipt', error)
  }
}

export async function getX402Activity(caseId?: string) {
  if (!db) {
    return emptyX402Activity(caseId)
  }

  try {
    const rows = caseId
      ? await db.select().from(x402Receipts).where(eq(x402Receipts.caseId, caseId)).orderBy(desc(x402Receipts.createdAt)).limit(50)
      : await db.select().from(x402Receipts).orderBy(desc(x402Receipts.createdAt)).limit(250)
    const [summary] = caseId
      ? await db
        .select({
          totalPaidReads: sql<number>`count(*)::int`,
          totalMicroUsdc: sql<string>`coalesce(sum((${x402Receipts.amountMicroUsdc})::numeric), 0)::text`,
          distinctPayers: sql<number>`count(distinct ${x402Receipts.payer})::int`,
          distinctCases: sql<number>`count(distinct ${x402Receipts.caseId})::int`,
        })
        .from(x402Receipts)
        .where(eq(x402Receipts.caseId, caseId))
      : await db
        .select({
          totalPaidReads: sql<number>`count(*)::int`,
          totalMicroUsdc: sql<string>`coalesce(sum((${x402Receipts.amountMicroUsdc})::numeric), 0)::text`,
          distinctPayers: sql<number>`count(distinct ${x402Receipts.payer})::int`,
          distinctCases: sql<number>`count(distinct ${x402Receipts.caseId})::int`,
        })
        .from(x402Receipts)
    const totalPaidReads = Number(summary?.totalPaidReads ?? 0)
    const totalMicroUsdc = Number(summary?.totalMicroUsdc ?? 0)
    const distinctPayers = Number(summary?.distinctPayers ?? 0)
    const distinctCases = Number(summary?.distinctCases ?? 0)
    const averageMicroUsdc = totalPaidReads ? totalMicroUsdc / totalPaidReads : 0

    return {
      caseId: caseId ?? null,
      totalPaidReads,
      totalMicroUsdc,
      totalUsdc: formatMicroUsdc(totalMicroUsdc),
      averageMicroUsdc,
      averageUsdc: formatMicroUsdc(averageMicroUsdc),
      distinctPayers,
      distinctCases,
      latest: rows[0] ? serializeX402Receipt(rows[0]) : null,
      recent: rows.slice(0, 12).map(serializeX402Receipt),
    }
  } catch (error) {
    return { ...emptyX402Activity(caseId), error: error instanceof Error ? error.message : 'x402 activity unavailable' }
  }
}

function emptyX402Activity(caseId?: string) {
  return {
    caseId: caseId ?? null,
    totalPaidReads: 0,
    totalMicroUsdc: 0,
    totalUsdc: '0',
    averageMicroUsdc: 0,
    averageUsdc: '0',
    distinctPayers: 0,
    distinctCases: 0,
    latest: null,
    recent: [],
  }
}

function serializeX402Receipt(row: typeof x402Receipts.$inferSelect) {
  return {
    caseId: row.caseId,
    payer: row.payer,
    transactionId: row.transactionId,
    amountMicroUsdc: Number(row.amountMicroUsdc || 0),
    amountUsdc: formatMicroUsdc(Number(row.amountMicroUsdc || 0)),
    network: row.network,
    resource: row.resource,
    createdAt: row.createdAt.toISOString(),
  }
}

function formatMicroUsdc(value: number) {
  return (value / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}
