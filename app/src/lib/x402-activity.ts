export type X402ActivityReceipt = {
  caseId?: string | null
  payer?: string | null
  transactionId?: string | null
  amountUsdc?: string | null
  resource?: string | null
  createdAt?: string | null
}

export type X402ActivitySnapshot = {
  totalPaidReads: number
  totalUsdc: string
  averageUsdc: string
  distinctPayers: number
  distinctCases: number
  latest?: X402ActivityReceipt | null
  recent: X402ActivityReceipt[]
}

export function normalizeActivity(payload: Partial<X402ActivitySnapshot>): X402ActivitySnapshot {
  return {
    totalPaidReads: Number(payload.totalPaidReads ?? 0),
    totalUsdc: payload.totalUsdc ?? '0',
    averageUsdc: payload.averageUsdc ?? '0',
    distinctPayers: Number(payload.distinctPayers ?? 0),
    distinctCases: Number(payload.distinctCases ?? 0),
    latest: payload.latest ?? null,
    recent: Array.isArray(payload.recent) ? payload.recent : [],
  }
}
