export type ApiCase = {
  id: string
  jobId?: string
  title: string
  status: string
  market?: string
  updated?: string
  createdAt?: string
  resolution?: string
  verdict?: string
  confidence?: number
  receipt?: string
  probability?: string
  horizon?: string
  witnesses?: string[]
}

export type ApiLedgerRow = {
  caseId: string
  title: string
  item: string
  amount: string
  status: string
  hash?: string
  updated?: string
}

export type ApiAgent = {
  id: string
  name: string
  seat: string
  description: string
  mode: string
  runMode: string
  priceUsd: number
  toolCapabilities: string[]
  enabled: boolean
  version: string
}

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function getBackendCases(): Promise<ApiCase[]> {
  try {
    const response = await fetch(`${backendUrl}/cases`, { cache: 'no-store' })
    if (!response.ok) return []
    const payload = await response.json() as { cases?: ApiCase[] }

    return Array.isArray(payload.cases) ? payload.cases : []
  } catch {
    return []
  }
}

export async function getBackendLedgerRows(): Promise<ApiLedgerRow[]> {
  try {
    const response = await fetch(`${backendUrl}/ledger`, { cache: 'no-store' })
    if (!response.ok) return []
    const payload = await response.json() as { rows?: ApiLedgerRow[] }

    return Array.isArray(payload.rows) ? payload.rows : []
  } catch {
    return []
  }
}

export async function getBackendAgents(): Promise<ApiAgent[]> {
  try {
    const response = await fetch(`${backendUrl}/agents/registry`, { cache: 'no-store' })
    if (!response.ok) return []
    const payload = await response.json() as { agents?: ApiAgent[] }

    return Array.isArray(payload.agents) ? payload.agents : []
  } catch {
    return []
  }
}

export function formatUpdated(value?: string) {
  if (!value) return 'Pending'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const diffMs = Date.now() - timestamp
  const minutes = Math.max(0, Math.round(diffMs / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatConfidence(value?: number) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'Pending'
}
