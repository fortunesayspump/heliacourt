export type ApiCase = {
  id: string
  jobId?: string
  title: string
  status: string
  market?: string
  links?: string[]
  updated?: string
  createdAt?: string
  resolution?: string
  verdict?: string
  confidence?: number
  receipt?: string
  probability?: string
  horizon?: string
  visibility?: 'public' | 'unlisted' | 'private'
  payerVisibility?: 'public' | 'private'
  witnesses?: string[]
  onchain?: {
    chainId: string
    escrowAddress: `0x${string}`
    caseId: string
    txHash: `0x${string}`
    budgetUsdc: string
    questionHash: `0x${string}`
    metadataURI?: string
  }
  onchainSettlement?: {
    status?: string
    totalPayoutUsdc?: string
    capped?: boolean
  }
}

export type ApiLedgerRow = {
  caseId: string
  title: string
  item: string
  amount: string
  status: string
  hash?: string
  updated?: string
  chainId?: string
  txHash?: string
  receiptType?: string
  agentId?: string
  wallet?: string
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
  onchain?: {
    onchainAgentId?: string
    ownerKind: 'protocol' | 'external'
    ownerWallet?: `0x${string}`
    payoutWallet?: `0x${string}`
    metadataURI?: string
    feeQuoteUsd: number
    registrationStatus: 'registered' | 'protocol-wallet-ready' | 'protocol-wallet-pending' | 'external-wallet-ready' | 'external-wallet-pending'
  }
}

export type ApiTranscriptTurn = {
  id: string
  agentId: string
  agentName: string
  seat: string
  kind: string
  stage: string
  message: string
  replyToId?: string
  requestedAgentId?: string
  request?: string
  artifactId?: string
  confidence?: number
  tags?: string[]
  createdAt?: string
}

export type ApiEvidenceSource = {
  title?: string
  url?: string
  value?: string
}

export type ApiToolEvidence = {
  capability?: string
  provider?: string
  query?: string
  status?: string
  observations?: string[]
  sources?: ApiEvidenceSource[]
}

export type ApiCourtArtifact = {
  id: string
  agentId: string
  type: string
  summary: string
  confidence?: number
  costUsd?: number
  transcriptMessage?: string
  claims?: string[]
  notes?: string[]
  risks?: string[]
  toolEvidence?: ApiToolEvidence[]
  evidenceItems?: Array<{
    id?: string
    sourceTitle?: string
    sourceUrl?: string
    sourceType?: string
    reliability?: string
    claim?: string
  }>
  createdAt?: string
}

export type ApiCaseDetail = {
  case: ApiCase
  transcript: ApiTranscriptTurn[]
  artifacts: ApiCourtArtifact[]
  recordHash?: string
  partial?: boolean
  onchainSettlement?: {
    status?: string
    reason?: string
    recordHash?: string
    verdictHash?: string
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
  }
}

export type ApiHealth = {
  ok: boolean
  service: string
  database?: {
    backend: string
    configured: boolean
  }
  hearingQueue?: {
    backend?: string
    waiting?: number
    active?: number
    maxConcurrent?: number
    error?: string
  }
  onchain?: {
    chainId: number
    rpcUrl: string
    caseEscrowConfigured: boolean
    courtReceiptsConfigured: boolean
    settlementSignerConfigured: boolean
    settlementUsesDedicatedKey: boolean
  }
}

export type ApiUserProfile = {
  wallet: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  bio?: string | null
  createdAt?: string
  updatedAt?: string
  lastSeenAt?: string
}

export type ApiUserAccount = {
  profile: ApiUserProfile
  cases: Array<{
    id: string
    title: string
    visibility: string
    role: string
    updated: string
  }>
  participation: Array<{
    id: string
    title: string
    role: string
    visibility: string
    updated: string
  }>
  follows: Array<{
    id: string
    title: string
    visibility: string
    followedAt: string
    updated: string
  }>
  payouts: Array<{
    caseId: string
    txHash: string
    agentId?: string
    wallet?: string
    amountUsdc?: string
    createdAt: string
  }>
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

export async function getBackendCaseDetail(id: string): Promise<ApiCaseDetail | undefined> {
  try {
    const response = await fetch(`${backendUrl}/cases/${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (!response.ok) return undefined
    const payload = await response.json() as Partial<ApiCaseDetail>
    if (!payload.case) return undefined

    return {
      case: payload.case,
      transcript: Array.isArray(payload.transcript) ? payload.transcript : [],
      artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
      recordHash: payload.recordHash,
      partial: payload.partial,
      onchainSettlement: payload.onchainSettlement,
    }
  } catch {
    return undefined
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

export async function getBackendHealth(): Promise<ApiHealth | undefined> {
  try {
    const response = await fetch(`${backendUrl}/health`, { cache: 'no-store' })
    if (!response.ok) return undefined
    return await response.json() as ApiHealth
  } catch {
    return undefined
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
