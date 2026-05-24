import { resolveMarketImageUrl } from './market-images'
import { getPreviewAgents, getPreviewCaseDetail, getPreviewCases, getPreviewLedgerRows, hydrateAgentAvatar } from './fixtures/preview-data'
import { backendUrl } from './backend-url'
export { getPreviewUserAccount, getPreviewUserNotifications } from './fixtures/preview-data'

export type ApiCase = {
  id: string
  jobId?: string
  title: string
  status: string
  market?: string
  imageUrl?: string
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
  parentCaseId?: string
  filingKind?: 'original' | 'fresh-hearing' | 'private-fork'
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
  imageUrl?: string
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
  avatarUrl?: string
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
    imageUrl?: string
    visibility: string
    role: string
    updated: string
  }>
  participation: Array<{
    id: string
    title: string
    imageUrl?: string
    role: string
    visibility: string
    updated: string
  }>
  follows: Array<{
    id: string
    title: string
    imageUrl?: string
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

export type ApiUserNotifications = {
  wallet: string
  notifications: Array<{
    id: string
    kind: 'case' | 'follow' | 'receipt'
    href: string
    title: string
    detail: string
    createdAt?: string
  }>
}

const backendTimeoutMs = Number(process.env.BACKEND_TIMEOUT_MS ?? 5000)
const backendResponseCache = new Map<string, {
  expiresAt: number
  promise: Promise<Response>
}>()

export async function getBackendCases(): Promise<ApiCase[]> {
  try {
    const response = await fetchBackend('/cases', { ttlMs: 3_000 })
    if (!response.ok) return getPreviewCases()
    const payload = await response.json() as { cases?: ApiCase[] }

    return Array.isArray(payload.cases) && payload.cases.length ? await hydrateCaseImages(payload.cases) : getPreviewCases()
  } catch {
    return getPreviewCases()
  }
}

export async function getBackendCaseDetail(id: string): Promise<ApiCaseDetail | undefined> {
  try {
    const response = await fetchBackend(`/cases/${encodeURIComponent(id)}`)
    if (!response.ok) return getPreviewCaseDetail(id)
    const payload = await response.json() as Partial<ApiCaseDetail>
    if (!payload.case) return getPreviewCaseDetail(id)

    return {
      case: await hydrateCaseImage(payload.case),
      transcript: Array.isArray(payload.transcript) ? payload.transcript : [],
      artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
      recordHash: payload.recordHash,
      partial: payload.partial,
      onchainSettlement: payload.onchainSettlement,
    }
  } catch {
    return getPreviewCaseDetail(id)
  }
}

async function hydrateCaseImages(cases: ApiCase[]) {
  return await Promise.all(cases.map((item) => hydrateCaseImage(item)))
}

async function hydrateCaseImage(item: ApiCase): Promise<ApiCase> {
  if (item.imageUrl) return item
  const imageUrl = await resolveMarketImageUrl(item.links, item.title)
  return imageUrl ? { ...item, imageUrl } : item
}

export async function getBackendLedgerRows(): Promise<ApiLedgerRow[]> {
  try {
    const response = await fetchBackend('/ledger', { ttlMs: 3_000 })
    if (!response.ok) return getPreviewLedgerRows()
    const payload = await response.json() as { rows?: ApiLedgerRow[] }

    return Array.isArray(payload.rows) && payload.rows.length ? await hydrateLedgerImages(payload.rows) : getPreviewLedgerRows()
  } catch {
    return getPreviewLedgerRows()
  }
}

async function hydrateLedgerImages(rows: ApiLedgerRow[]) {
  const cases = await getBackendCases()
  const casesById = new Map(cases.map((item) => [item.id, item]))
  const casesByTitle = new Map(cases.map((item) => [item.title, item]))

  return rows.map((row) => {
    if (row.imageUrl) return row
    const courtCase = casesById.get(row.caseId) ?? casesByTitle.get(row.title)
    return courtCase?.imageUrl ? { ...row, imageUrl: courtCase.imageUrl } : row
  })
}

export async function getBackendAgents(): Promise<ApiAgent[]> {
  try {
    const response = await fetchBackend('/agents/registry', { ttlMs: 10_000 })
    if (!response.ok) return getPreviewAgents()
    const payload = await response.json() as { agents?: ApiAgent[] }
    const agents = Array.isArray(payload.agents) && payload.agents.length ? payload.agents : getPreviewAgents()

    return agents.map(hydrateAgentAvatar)
  } catch {
    return getPreviewAgents()
  }
}

export async function getBackendHealth(): Promise<ApiHealth | undefined> {
  try {
    const response = await fetchBackend('/health', { ttlMs: 5_000 })
    if (!response.ok) return undefined
    return await response.json() as ApiHealth
  } catch {
    return undefined
  }
}

async function fetchBackend(path: string, options: { ttlMs?: number } = {}) {
  const ttlMs = options.ttlMs ?? 0
  const cacheKey = `${backendUrl}${path}`
  const cached = backendResponseCache.get(cacheKey)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return (await cached.promise).clone()
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), backendTimeoutMs)
  const promise = fetch(`${backendUrl}${path}`, {
    cache: 'no-store',
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout)
  })

  if (ttlMs > 0) {
    backendResponseCache.set(cacheKey, { expiresAt: now + ttlMs, promise })
    promise.catch(() => backendResponseCache.delete(cacheKey))
  }

  return (await promise).clone()
}

export function formatUpdated(value?: string) {
  if (!value) return 'Pending'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const diffMs = Date.now() - timestamp
  const minutes = Math.max(0, Math.round(diffMs / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`
  const days = Math.floor(minutes / 1_440)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatConfidence(value?: number) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'Pending'
}
