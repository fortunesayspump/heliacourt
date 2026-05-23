import { resolveMarketImageUrl } from './market-images'

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

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const usePreviewData = process.env.ENABLE_PREVIEW_DATA === 'true'
const backendTimeoutMs = Number(process.env.BACKEND_TIMEOUT_MS ?? 5000)
const backendResponseCache = new Map<string, {
  expiresAt: number
  promise: Promise<Response>
}>()

const previewCases: ApiCase[] = [
  {
    id: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    status: 'Hearing',
    market: 'Polymarket',
    links: ['https://polymarket.com/event/bitcoin-100k-before-july-2026'],
    updated: '2026-05-22T11:40:00.000Z',
    createdAt: '2026-05-21T15:20:00.000Z',
    probability: '42%',
    horizon: 'Jul 1, 2026',
    confidence: 0.42,
    visibility: 'public',
    payerVisibility: 'private',
    witnesses: ['prediction-market-analyst', 'macro-researcher', 'onchain-analyst'],
    onchain: {
      chainId: '5042002',
      escrowAddress: '0x0000000000000000000000000000000000000001',
      caseId: '7',
      txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      budgetUsdc: '12.50',
      questionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      metadataURI: 'helia-case://preview-polymarket-btc-100k',
    },
  },
  {
    id: 'preview-kalshi-fed-cut',
    title: 'Will the Federal Reserve cut rates at the June 2026 meeting?',
    status: 'Queued',
    market: 'Kalshi',
    links: ['https://kalshi.com/markets/fed/june-rate-cut'],
    updated: '2026-05-22T10:05:00.000Z',
    createdAt: '2026-05-22T09:12:00.000Z',
    probability: '31%',
    horizon: 'June 2026 FOMC',
    confidence: 0.31,
    visibility: 'public',
    payerVisibility: 'private',
    witnesses: ['macro-researcher', 'news-witness'],
    onchain: {
      chainId: '5042002',
      escrowAddress: '0x0000000000000000000000000000000000000001',
      caseId: '8',
      txHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
      budgetUsdc: '8.00',
      questionHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      metadataURI: 'helia-case://preview-kalshi-fed-cut',
    },
  },
  {
    id: 'preview-manifold-ai-benchmark',
    title: 'Will an open model top the leading closed model on a major benchmark before 2027?',
    status: 'Verdict',
    market: 'Manifold',
    links: ['https://manifold.markets/example/open-model-leading-benchmark'],
    updated: '2026-05-21T22:30:00.000Z',
    createdAt: '2026-05-20T18:45:00.000Z',
    probability: '58%',
    horizon: 'Dec 31, 2026',
    confidence: 0.58,
    verdict: 'Unresolved, evidence favors Yes',
    resolution: 'Benchmark definitions require public leaderboard publication and reproducible model identity.',
    visibility: 'public',
    payerVisibility: 'public',
    witnesses: ['web-researcher', 'source-quality-reviewer', 'risk-bailiff'],
    onchain: {
      chainId: '5042002',
      escrowAddress: '0x0000000000000000000000000000000000000001',
      caseId: '9',
      txHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
      budgetUsdc: '15.00',
      questionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      metadataURI: 'helia-case://preview-manifold-ai-benchmark',
    },
  },
]

const previewAgents: ApiAgent[] = [
  {
    id: 'prediction-market-analyst',
    name: 'Prediction Market Analyst',
    seat: 'expert-witness',
    description: 'Reads market structure, liquidity, odds movement, and trader positioning before testimony.',
    mode: 'market-analysis',
    runMode: 'autonomous',
    priceUsd: 2.5,
    toolCapabilities: ['market-odds', 'liquidity-scan', 'source-review'],
    enabled: true,
    version: '0.3.0',
    onchain: {
      onchainAgentId: '12',
      ownerKind: 'protocol',
      ownerWallet: '0x1111111111111111111111111111111111111111',
      payoutWallet: '0x2222222222222222222222222222222222222222',
      metadataURI: 'helia-agent://prediction-market-analyst',
      feeQuoteUsd: 2.5,
      registrationStatus: 'registered',
    },
  },
  {
    id: 'macro-researcher',
    name: 'Macro Researcher',
    seat: 'expert-witness',
    description: 'Frames policy, rates, inflation, and cross-asset context for macro-sensitive questions.',
    mode: 'macro-research',
    runMode: 'autonomous',
    priceUsd: 3,
    toolCapabilities: ['macro-calendar', 'fed-watch', 'news-search'],
    enabled: true,
    version: '0.2.4',
    onchain: {
      onchainAgentId: '13',
      ownerKind: 'protocol',
      ownerWallet: '0x3333333333333333333333333333333333333333',
      payoutWallet: '0x4444444444444444444444444444444444444444',
      metadataURI: 'helia-agent://macro-researcher',
      feeQuoteUsd: 3,
      registrationStatus: 'registered',
    },
  },
  {
    id: 'onchain-analyst',
    name: 'Onchain Analyst',
    seat: 'expert-witness',
    description: 'Inspects token flows, wallet clusters, settlement activity, and chain-native evidence.',
    mode: 'onchain-analysis',
    runMode: 'autonomous',
    priceUsd: 3.5,
    toolCapabilities: ['wallet-trace', 'contract-events', 'token-flow'],
    enabled: true,
    version: '0.2.1',
    onchain: {
      ownerKind: 'protocol',
      ownerWallet: '0x5555555555555555555555555555555555555555',
      payoutWallet: '0x6666666666666666666666666666666666666666',
      metadataURI: 'helia-agent://onchain-analyst',
      feeQuoteUsd: 3.5,
      registrationStatus: 'protocol-wallet-ready',
    },
  },
  {
    id: 'risk-bailiff',
    name: 'Risk Bailiff',
    seat: 'risk-bailiff',
    description: 'Challenges weak evidence, flags manipulation risk, and keeps verdict confidence grounded.',
    mode: 'risk-review',
    runMode: 'supervised',
    priceUsd: 1.75,
    toolCapabilities: ['risk-flags', 'contradiction-check', 'settlement-review'],
    enabled: true,
    version: '0.1.9',
    onchain: {
      ownerKind: 'protocol',
      feeQuoteUsd: 1.75,
      registrationStatus: 'protocol-wallet-pending',
    },
  },
]

const previewLedgerRows: ApiLedgerRow[] = [
  {
    caseId: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    item: 'Escrow funded for witness bench',
    amount: '12.50 USDC',
    status: 'Anchored',
    hash: '0xb71f2a9d3c4e8f10',
    updated: '2026-05-22T11:42:00.000Z',
    receiptType: 'case-funding',
    txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    chainId: '5042002',
  },
  {
    caseId: 'preview-kalshi-fed-cut',
    title: 'Will the Federal Reserve cut rates at the June 2026 meeting?',
    item: 'Escrow funded for macro review',
    amount: '8.00 USDC',
    status: 'Anchored',
    hash: '0x0d5ce91a7f430bc2',
    updated: '2026-05-22T10:09:00.000Z',
    receiptType: 'case-funding',
    txHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    chainId: '5042002',
  },
  {
    caseId: 'preview-manifold-ai-benchmark',
    title: 'Will an open model top the leading closed model on a major benchmark before 2027?',
    item: 'Escrow funded for benchmark hearing',
    amount: '15.00 USDC',
    status: 'Anchored',
    hash: '0x68f219cf01bd44aa',
    updated: '2026-05-20T18:51:00.000Z',
    receiptType: 'case-funding',
    txHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
    chainId: '5042002',
  },
  {
    caseId: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    item: 'Hearing transcript hash recorded',
    amount: '0 USDC',
    status: 'Recorded',
    hash: '0x7af4c0e2d19b8051',
    updated: '2026-05-22T11:52:00.000Z',
    receiptType: 'decision-record',
    txHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
    chainId: '5042002',
  },
  {
    caseId: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    item: 'Prediction Market Analyst testimony',
    amount: '2.50 USDC',
    status: 'Anchored',
    hash: '0xa91c0d75e4b2f601',
    updated: '2026-05-22T11:55:00.000Z',
    receiptType: 'agent-payout',
    agentId: 'prediction-market-analyst',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    chainId: '5042002',
  },
  {
    caseId: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    item: 'Macro Researcher testimony',
    amount: '3.00 USDC',
    status: 'Anchored',
    hash: '0x33c592ed40a17fc8',
    updated: '2026-05-22T11:58:00.000Z',
    receiptType: 'agent-payout',
    agentId: 'macro-researcher',
    txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    chainId: '5042002',
  },
  {
    caseId: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    item: 'Onchain Analyst testimony',
    amount: '3.50 USDC',
    status: 'Recorded',
    hash: '0xc82a90d17bf4a61c',
    updated: '2026-05-22T12:02:00.000Z',
    receiptType: 'agent-payout',
    agentId: 'onchain-analyst',
    txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    chainId: '5042002',
  },
  {
    caseId: 'preview-manifold-ai-benchmark',
    title: 'Will an open model top the leading closed model on a major benchmark before 2027?',
    item: 'Risk Bailiff review',
    amount: '1.75 USDC',
    status: 'Anchored',
    hash: '0x9e13bc7725d0a6f4',
    updated: '2026-05-21T23:05:00.000Z',
    receiptType: 'agent-payout',
    agentId: 'risk-bailiff',
    txHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    chainId: '5042002',
  },
  {
    caseId: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    item: 'Agent payout batch summary',
    amount: '9.00 USDC',
    status: 'Anchored',
    hash: '0x4df673a80e52cb91',
    updated: '2026-05-22T12:08:00.000Z',
    receiptType: 'agent-payout-summary',
    txHash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    chainId: '5042002',
  },
  {
    caseId: 'preview-polymarket-btc-100k',
    title: 'Will Bitcoin trade above $100,000 before July 1, 2026?',
    item: 'Arc protocol settlement fee',
    amount: '0.38 USDC',
    status: 'Anchored',
    hash: '0xf2ae9d1a61b8c044',
    updated: '2026-05-22T12:09:00.000Z',
    receiptType: 'protocol-fee',
    txHash: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    chainId: '5042002',
  },
  {
    caseId: 'preview-manifold-ai-benchmark',
    title: 'Will an open model top the leading closed model on a major benchmark before 2027?',
    item: 'Verdict record anchored',
    amount: '0 USDC',
    status: 'Anchored',
    hash: '0x28fbd1509c6e77ad',
    updated: '2026-05-21T23:20:00.000Z',
    receiptType: 'verdict-record',
    txHash: '0x7777777777777777777777777777777777777777777777777777777777777777',
    chainId: '5042002',
  },
  {
    caseId: 'preview-kalshi-fed-cut',
    title: 'Will the Federal Reserve cut rates at the June 2026 meeting?',
    item: 'Settlement queued for witness selection',
    amount: '8.00 USDC',
    status: 'Pending',
    hash: '0x6bf35e2d10a7cc91',
    updated: '2026-05-22T10:16:00.000Z',
    receiptType: 'settlement-pending',
    txHash: '0x8888888888888888888888888888888888888888888888888888888888888888',
    chainId: '5042002',
  },
]

const previewCaseDetails: Record<string, Omit<ApiCaseDetail, 'case'>> = {
  'preview-polymarket-btc-100k': {
    transcript: [
      {
        id: 'btc-turn-1',
        agentId: 'court-clerk',
        agentName: 'Court Clerk',
        seat: 'court-clerk',
        kind: 'opening',
        stage: 'Case opened',
        message: 'The court accepts the Polymarket question, escrow funding, market URL, and July 1, 2026 horizon. The hearing will focus on spot BTC paths, liquidity, macro catalysts, and whether the market question can be resolved from public exchange prints.',
        confidence: 0.62,
        createdAt: '2026-05-22T11:43:00.000Z',
      },
      {
        id: 'btc-turn-2',
        agentId: 'prediction-market-analyst',
        agentName: 'Prediction Market Analyst',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Market testimony',
        message: 'The market is pricing the event near 42%. Liquidity is broad enough for a signal, but not deep enough to treat the price as a final probability. The order book implies traders still assign meaningful upside to a breakout if ETF inflows accelerate.',
        artifactId: 'btc-market-artifact',
        confidence: 0.66,
        tags: ['liquidity', 'order-book'],
        createdAt: '2026-05-22T11:49:00.000Z',
      },
      {
        id: 'btc-turn-3',
        agentId: 'macro-researcher',
        agentName: 'Macro Researcher',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Macro testimony',
        message: 'The main bullish path is easier financial conditions into late June. The bearish path is sticky inflation forcing higher real yields. A June Fed surprise would move crypto beta, but the deadline is close enough that the court should discount long-run narratives.',
        artifactId: 'btc-macro-artifact',
        confidence: 0.58,
        tags: ['macro', 'rates'],
        createdAt: '2026-05-22T11:55:00.000Z',
      },
      {
        id: 'btc-turn-4',
        agentId: 'onchain-analyst',
        agentName: 'Onchain Analyst',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Flow testimony',
        message: 'Exchange balances and large wallet movement do not show a clean distribution signal. The stronger evidence is continued spot ETF demand. I would not override the market price, but I would keep the probability above a pure momentum read.',
        artifactId: 'btc-flow-artifact',
        confidence: 0.54,
        tags: ['flows', 'wallets'],
        createdAt: '2026-05-22T12:01:00.000Z',
      },
      {
        id: 'btc-turn-5',
        agentId: 'risk-bailiff',
        agentName: 'Risk Bailiff',
        seat: 'risk-bailiff',
        kind: 'challenge',
        stage: 'Risk challenge',
        message: 'Objection noted on over-weighting ETF flow. The deadline is short and the market requires an actual print above $100,000, not a narrative breakout. Keep the working confidence near the market price until a decisive catalyst appears.',
        replyToId: 'btc-turn-2',
        confidence: 0.49,
        tags: ['risk', 'deadline'],
        createdAt: '2026-05-22T12:06:00.000Z',
      },
      {
        id: 'btc-turn-6',
        agentId: 'head-judge',
        agentName: 'Head Judge',
        seat: 'head-judge',
        kind: 'ruling',
        stage: 'Interim ruling',
        message: 'Interim view: hearing remains open. Current evidence supports a live but minority path to Yes. The court keeps the working probability at 42% pending fresh market movement or material macro news.',
        artifactId: 'btc-interim-verdict',
        confidence: 0.42,
        tags: ['interim', 'verdict'],
        createdAt: '2026-05-22T12:10:00.000Z',
      },
    ],
    artifacts: [
      {
        id: 'btc-market-artifact',
        agentId: 'prediction-market-analyst',
        type: 'market-analysis',
        summary: 'Polymarket price is informative but thin around the deadline.',
        confidence: 0.66,
        costUsd: 2.5,
        transcriptMessage: 'Market structure supports a 40-45% working band.',
        claims: ['Market price sits near 42%', 'Liquidity is adequate for direction, not final certainty', 'Upside requires a catalyst before the July deadline'],
        toolEvidence: [
          {
            capability: 'market-odds',
            provider: 'Polymarket',
            status: 'complete',
            observations: ['Order book shows two-sided interest', 'Recent movement has been range-bound'],
            sources: [
              { title: 'Polymarket BTC $100K market', url: 'https://polymarket.com/event/bitcoin-100k-before-july-2026', value: 'Market page' },
            ],
          },
        ],
      },
      {
        id: 'btc-macro-artifact',
        agentId: 'macro-researcher',
        type: 'macro-review',
        summary: 'Rates and dollar conditions remain the biggest short-window driver.',
        confidence: 0.58,
        costUsd: 3,
        claims: ['Easier conditions support the Yes path', 'Sticky inflation caps upside', 'Deadline risk lowers conviction'],
        toolEvidence: [
          {
            capability: 'macro-calendar',
            provider: 'Macro desk',
            status: 'complete',
            observations: ['June policy expectations remain unsettled'],
            sources: [
              { title: 'Federal Reserve calendar', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', value: 'Policy calendar' },
            ],
          },
        ],
      },
      {
        id: 'btc-flow-artifact',
        agentId: 'onchain-analyst',
        type: 'flow-review',
        summary: 'Onchain flow does not materially contradict the market price.',
        confidence: 0.54,
        costUsd: 3.5,
        claims: ['No decisive exchange distribution signal', 'Large-wallet activity is mixed', 'ETF demand remains the cleaner signal'],
      },
      {
        id: 'btc-interim-verdict',
        agentId: 'head-judge',
        type: 'verdict',
        summary: 'Hearing open, Yes path alive but minority',
        confidence: 0.42,
        transcriptMessage: 'The court holds the working probability at 42% and waits for a stronger catalyst before shifting the case.',
        claims: ['No final verdict yet', 'Current evidence tracks the market price', 'Deadline risk keeps confidence restrained'],
        risks: ['A fast spot rally can make the current probability stale.', 'Macro releases may alter crypto beta before the deadline.', 'Thin market liquidity can overstate confidence in either direction.'],
        notes: ['This is an interim hearing record.', 'The court is tracking spot prints, not intraday sentiment alone.'],
        toolEvidence: [
          {
            capability: 'market-odds',
            provider: 'Polymarket',
            status: 'complete',
            observations: ['Market probability remains near the court working probability.', 'Deadline risk keeps the Yes path below even odds.'],
            sources: [
              { title: 'Polymarket BTC $100K market', url: 'https://polymarket.com/event/bitcoin-100k-before-july-2026', value: 'Market page' },
              { title: 'Bitcoin price reference', url: 'https://www.coinbase.com/price/bitcoin', value: 'Spot reference' },
            ],
          },
          {
            capability: 'macro-calendar',
            provider: 'Macro desk',
            status: 'complete',
            observations: ['Rates and inflation releases remain the main exogenous risk.'],
            sources: [
              { title: 'Federal Reserve calendar', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', value: 'Policy calendar' },
            ],
          },
        ],
        createdAt: '2026-05-22T12:10:00.000Z',
      },
      {
        id: 'btc-settlement',
        agentId: 'settlement-clerk',
        type: 'settlement',
        summary: 'Escrow funded and witness payout batch prepared.',
        confidence: 0.99,
        costUsd: 9,
        claims: ['Funding receipt anchored', 'Three witness payouts recorded', 'Protocol fee calculated'],
      },
    ],
    recordHash: '0x7af4c0e2d19b8051',
    partial: false,
    onchainSettlement: {
      status: 'Recorded',
      reason: 'Interim hearing record and witness payouts captured.',
      recordHash: '0x7af4c0e2d19b8051',
      verdictHash: '0x42fb47f109d5caae',
      totalPayoutUsdc: '9.00',
      capped: false,
      receipts: [
        { type: 'case-funding', txHash: '0x1111111111111111111111111111111111111111111111111111111111111111', chainId: '5042002', caseId: '7', amountUsdc: '12.50', recordHash: '0xb71f2a9d3c4e8f10' },
        { type: 'agent-payout', txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', chainId: '5042002', caseId: '7', amountUsdc: '2.50', agentId: 'prediction-market-analyst' },
        { type: 'agent-payout', txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', chainId: '5042002', caseId: '7', amountUsdc: '3.00', agentId: 'macro-researcher' },
        { type: 'agent-payout', txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', chainId: '5042002', caseId: '7', amountUsdc: '3.50', agentId: 'onchain-analyst' },
      ],
    },
  },
  'preview-kalshi-fed-cut': {
    transcript: [
      {
        id: 'fed-turn-1',
        agentId: 'court-clerk',
        agentName: 'Court Clerk',
        seat: 'court-clerk',
        kind: 'opening',
        stage: 'Queued',
        message: 'The court has accepted the Kalshi market link and funding. Witnesses are being seated for a June 2026 FOMC probability hearing.',
        confidence: 0.5,
        createdAt: '2026-05-22T10:17:00.000Z',
      },
      {
        id: 'fed-turn-2',
        agentId: 'macro-researcher',
        agentName: 'Macro Researcher',
        seat: 'expert-witness',
        kind: 'preview',
        stage: 'Pre-hearing memo',
        message: 'Initial read: the cut path depends on inflation prints and labor softness before the meeting window. Current market probability around 31% is plausible until the next CPI and payrolls releases.',
        artifactId: 'fed-macro-artifact',
        confidence: 0.55,
        createdAt: '2026-05-22T10:22:00.000Z',
      },
      {
        id: 'fed-turn-3',
        agentId: 'risk-bailiff',
        agentName: 'Risk Bailiff',
        seat: 'risk-bailiff',
        kind: 'challenge',
        stage: 'Scope check',
        message: 'The court should define “cut” as a target range reduction announced at the June meeting, not guidance, dots, or press conference language.',
        replyToId: 'fed-turn-1',
        confidence: 0.72,
        createdAt: '2026-05-22T10:25:00.000Z',
      },
    ],
    artifacts: [
      {
        id: 'fed-macro-artifact',
        agentId: 'macro-researcher',
        type: 'macro-preview',
        summary: 'Cut probability is live but below even odds.',
        confidence: 0.55,
        costUsd: 3,
        claims: ['Inflation prints are the key driver', 'Labor market weakness would raise odds', 'Resolution should use the announced target range'],
        toolEvidence: [
          {
            capability: 'macro-calendar',
            provider: 'FOMC calendar',
            status: 'complete',
            sources: [
              { title: 'Federal Reserve FOMC calendars', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', value: 'Meeting calendar' },
            ],
          },
        ],
      },
    ],
    recordHash: '0x6bf35e2d10a7cc91',
    partial: false,
    onchainSettlement: {
      status: 'Pending',
      reason: 'Witness selection queued.',
      recordHash: '0x6bf35e2d10a7cc91',
      totalPayoutUsdc: '0.00',
      capped: false,
      receipts: [
        { type: 'case-funding', txHash: '0x2222222222222222222222222222222222222222222222222222222222222222', chainId: '5042002', caseId: '8', amountUsdc: '8.00', recordHash: '0x0d5ce91a7f430bc2' },
      ],
    },
  },
  'preview-manifold-ai-benchmark': {
    transcript: [
      {
        id: 'ai-turn-1',
        agentId: 'web-researcher',
        agentName: 'Web Researcher',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Benchmark review',
        message: 'Several open model labs are closing benchmark gaps, but the case requires a major benchmark and a leading closed model comparator. Public leaderboard definitions matter more than social claims.',
        artifactId: 'ai-research-artifact',
        confidence: 0.61,
        createdAt: '2026-05-21T22:42:00.000Z',
      },
      {
        id: 'ai-turn-2',
        agentId: 'source-quality-reviewer',
        agentName: 'Source Quality Reviewer',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Source quality',
        message: 'The court should accept benchmark operators, model cards, and reproducible evaluation reports. Marketing posts alone should not settle the case.',
        replyToId: 'ai-turn-1',
        confidence: 0.76,
        createdAt: '2026-05-21T22:50:00.000Z',
      },
      {
        id: 'ai-turn-3',
        agentId: 'risk-bailiff',
        agentName: 'Risk Bailiff',
        seat: 'risk-bailiff',
        kind: 'challenge',
        stage: 'Manipulation risk',
        message: 'Leaderboard cherry-picking is the main risk. The verdict should stay unresolved and favor Yes only as a probability read, not as a settlement decision.',
        confidence: 0.67,
        createdAt: '2026-05-21T22:57:00.000Z',
      },
      {
        id: 'ai-turn-4',
        agentId: 'head-judge',
        agentName: 'Head Judge',
        seat: 'head-judge',
        kind: 'verdict',
        stage: 'Verdict',
        message: 'Verdict: unresolved, evidence favors Yes. Open models have a credible path before 2027, but the court has not seen a qualifying public benchmark result yet.',
        artifactId: 'ai-verdict-artifact',
        confidence: 0.58,
        createdAt: '2026-05-21T23:12:00.000Z',
      },
    ],
    artifacts: [
      {
        id: 'ai-research-artifact',
        agentId: 'web-researcher',
        type: 'research',
        summary: 'Open models are gaining but no qualifying settlement event is confirmed.',
        confidence: 0.61,
        costUsd: 4.25,
        claims: ['Benchmark gap is narrowing', 'Public leaderboard evidence is required', 'Case remains unresolved'],
        toolEvidence: [
          {
            capability: 'web-search',
            provider: 'Research desk',
            status: 'complete',
            sources: [
              { title: 'Chatbot Arena leaderboard', url: 'https://lmarena.ai/', value: 'Benchmark operator' },
              { title: 'HELM benchmark project', url: 'https://crfm.stanford.edu/helm/', value: 'Benchmark reference' },
            ],
          },
        ],
      },
      {
        id: 'ai-verdict-artifact',
        agentId: 'head-judge',
        type: 'verdict',
        summary: 'Unresolved, evidence favors Yes',
        confidence: 0.58,
        transcriptMessage: 'The court records a non-final verdict: credible Yes path, no qualifying benchmark result yet.',
        claims: ['No qualifying final event', 'Open model trajectory supports Yes lean', 'Resolution must rely on public benchmark evidence'],
        risks: ['Leaderboard cherry-picking could create a false positive.', 'A benchmark result may not match the market definition of major benchmark.', 'Closed model comparator status can change before 2027.'],
        notes: ['The court treats this as a probability verdict, not settlement.', 'Public reproducible evidence remains the resolution standard.'],
        toolEvidence: [
          {
            capability: 'benchmark-review',
            provider: 'Research desk',
            status: 'complete',
            observations: ['Open model performance is improving, but no qualifying settlement event is confirmed.', 'Benchmark provenance remains the key gating issue.'],
            sources: [
              { title: 'Chatbot Arena leaderboard', url: 'https://lmarena.ai/', value: 'Benchmark operator' },
              { title: 'HELM benchmark project', url: 'https://crfm.stanford.edu/helm/', value: 'Benchmark reference' },
            ],
          },
          {
            capability: 'market-context',
            provider: 'Manifold',
            status: 'complete',
            observations: ['Market remains unresolved and probability-leaning rather than settled.'],
            sources: [
              { title: 'Manifold benchmark market', url: 'https://manifold.markets/example/open-model-leading-benchmark', value: 'Market page' },
            ],
          },
        ],
        createdAt: '2026-05-21T23:12:00.000Z',
      },
      {
        id: 'ai-settlement',
        agentId: 'settlement-clerk',
        type: 'settlement',
        summary: 'Verdict record anchored and witness payments prepared.',
        costUsd: 1.75,
        claims: ['Verdict hash recorded', 'Risk review paid', 'Receipt archived'],
      },
    ],
    recordHash: '0x28fbd1509c6e77ad',
    partial: false,
    onchainSettlement: {
      status: 'Anchored',
      reason: 'Verdict record archived.',
      recordHash: '0x28fbd1509c6e77ad',
      verdictHash: '0xa15a19f02f2d5481',
      totalPayoutUsdc: '1.75',
      capped: false,
      receipts: [
        { type: 'case-funding', txHash: '0x3333333333333333333333333333333333333333333333333333333333333333', chainId: '5042002', caseId: '9', amountUsdc: '15.00', recordHash: '0x68f219cf01bd44aa' },
        { type: 'agent-payout', txHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', chainId: '5042002', caseId: '9', amountUsdc: '1.75', agentId: 'risk-bailiff' },
        { type: 'verdict-record', txHash: '0x7777777777777777777777777777777777777777777777777777777777777777', chainId: '5042002', caseId: '9', recordHash: '0x28fbd1509c6e77ad' },
      ],
    },
  },
}

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

    return Array.isArray(payload.agents) && payload.agents.length ? payload.agents : getPreviewAgents()
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

function getPreviewCases() {
  return usePreviewData ? previewCases : []
}

function getPreviewAgents() {
  return usePreviewData ? previewAgents : []
}

function getPreviewLedgerRows() {
  return usePreviewData ? previewLedgerRows : []
}

export function getPreviewUserAccount(wallet: string): ApiUserAccount | undefined {
  if (!usePreviewData) return undefined

  const normalizedWallet = wallet.toLowerCase()
  const btc = previewCases[0]
  const fed = previewCases[1]
  const ai = previewCases[2]
  if (!btc || !fed || !ai) return undefined
  const agentPayouts = previewLedgerRows.filter((row) => row.receiptType === 'agent-payout')
  const btcVisibility = btc.visibility ?? 'public'
  const fedVisibility = fed.visibility ?? 'public'
  const aiVisibility = ai.visibility ?? 'public'
  const btcUpdated = btc.updated ?? '2026-05-22T11:40:00.000Z'
  const fedUpdated = fed.updated ?? '2026-05-22T10:05:00.000Z'
  const aiUpdated = ai.updated ?? '2026-05-21T22:30:00.000Z'

  return {
    profile: {
      wallet,
      username: 'court_operator',
      displayName: 'Court Operator',
      avatarUrl: null,
      bio: 'Tracking live market hearings, following verdict records, and funding witness benches from this wallet.',
      createdAt: '2026-05-20T13:15:00.000Z',
      updatedAt: '2026-05-22T12:12:00.000Z',
      lastSeenAt: '2026-05-22T12:18:00.000Z',
    },
    cases: [
      { id: btc.id, title: btc.title, visibility: btcVisibility, role: 'filer', updated: btcUpdated },
      { id: fed.id, title: fed.title, visibility: fedVisibility, role: 'filer', updated: fedUpdated },
    ],
    participation: [
      { id: btc.id, title: btc.title, visibility: btcVisibility, role: 'filer', updated: btcUpdated },
      { id: fed.id, title: fed.title, visibility: fedVisibility, role: 'filer', updated: fedUpdated },
      { id: ai.id, title: ai.title, visibility: aiVisibility, role: 'watcher', updated: aiUpdated },
    ],
    follows: [
      { id: ai.id, title: ai.title, visibility: aiVisibility, followedAt: '2026-05-21T20:14:00.000Z', updated: aiUpdated },
      { id: btc.id, title: btc.title, visibility: btcVisibility, followedAt: '2026-05-22T09:44:00.000Z', updated: btcUpdated },
      { id: fed.id, title: fed.title, visibility: fedVisibility, followedAt: '2026-05-22T10:19:00.000Z', updated: fedUpdated },
    ],
    payouts: agentPayouts.map((row) => ({
      caseId: row.caseId,
      txHash: row.txHash ?? row.hash ?? `preview-${row.caseId}-${row.agentId ?? 'receipt'}`,
      agentId: row.agentId,
      wallet: normalizedWallet,
      amountUsdc: row.amount.replace(/\s*USDC$/i, ''),
      createdAt: row.updated ?? new Date().toISOString(),
    })),
  }
}

export function getPreviewUserNotifications(wallet: string): ApiUserNotifications | undefined {
  const account = getPreviewUserAccount(wallet)
  if (!account) return undefined

  const payoutNotifications = account.payouts.slice(0, 4).map((row) => ({
    id: `preview-payout:${row.txHash}`,
    kind: 'receipt' as const,
    href: `/cases/${row.caseId}?tab=receipts`,
    title: 'Receipt recorded',
    detail: row.amountUsdc ? `${row.amountUsdc} USDC agent payout` : 'Agent payout recorded',
    createdAt: row.createdAt,
  }))

  const caseNotifications = account.participation.slice(0, 3).map((item) => ({
    id: `preview-case:${item.id}:${item.role}`,
    kind: item.role === 'filer' ? 'case' as const : 'follow' as const,
    href: `/cases/${item.id}`,
    title: item.title,
    detail: item.role === 'filer' ? 'Filed case updated' : `${item.role} participation updated`,
    createdAt: item.updated,
  }))

  return {
    wallet,
    notifications: [...payoutNotifications, ...caseNotifications]
      .sort((left, right) => Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? ''))
      .slice(0, 8),
  }
}

function getPreviewCaseDetail(id: string): ApiCaseDetail | undefined {
  if (!usePreviewData) return undefined
  const item = previewCases.find((caseItem) => caseItem.id === id)
  if (!item) return undefined

  return {
    case: item,
    transcript: buildPreviewTranscript(id, previewCaseDetails[id]?.transcript ?? []),
    artifacts: previewCaseDetails[id]?.artifacts ?? [],
    recordHash: previewCaseDetails[id]?.recordHash,
    partial: previewCaseDetails[id]?.partial ?? true,
    onchainSettlement: previewCaseDetails[id]?.onchainSettlement,
  }
}

function buildPreviewTranscript(caseId: string, baseTurns: ApiTranscriptTurn[]) {
  if (!baseTurns.length) return []
  if (baseTurns.length >= 50) return baseTurns.slice(0, 50)

  const templates = getPreviewTranscriptTemplates(caseId)
  const generated: ApiTranscriptTurn[] = []
  const startTime = Date.parse(baseTurns.at(-1)?.createdAt ?? '2026-05-22T12:00:00.000Z')

  for (let index = baseTurns.length; index < 50; index += 1) {
    const template = templates[index % templates.length]
    const previous = index > 0 ? [...baseTurns, ...generated][index - 1] : undefined
    const turnNumber = index + 1
    generated.push({
      id: `${caseId}-turn-${turnNumber}`,
      agentId: template.agentId,
      agentName: template.agentName,
      seat: template.seat,
      kind: template.kind,
      stage: template.stage,
      message: `${template.message(turnNumber)}${formatPreviewEmbedLinks(caseId, turnNumber)}`,
      replyToId: index % 5 === 0 ? previous?.id : undefined,
      artifactId: template.artifactId,
      confidence: Math.max(0.18, Math.min(0.86, template.confidence + ((index % 7) - 3) * 0.01)),
      tags: template.tags,
      createdAt: new Date(startTime + (index - baseTurns.length + 1) * 4 * 60_000).toISOString(),
    })
  }

  return [...baseTurns, ...generated]
}

function formatPreviewEmbedLinks(caseId: string, turn: number) {
  const linkCount = getPreviewEmbedCount(turn)
  if (!linkCount) return ''

  const links = getPreviewEmbedPool(caseId).slice(0, linkCount)
  return `\n\nSources: ${links.join(' ')}`
}

function getPreviewEmbedCount(turn: number) {
  if (turn % 25 === 0) return 5
  if (turn % 20 === 0) return 4
  if (turn % 15 === 0) return 3
  if (turn % 10 === 0) return 2
  if (turn % 6 === 0) return 1
  return 0
}

function getPreviewEmbedPool(caseId: string) {
  if (caseId === 'preview-kalshi-fed-cut') {
    return [
      'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
      'https://www.federalreserve.gov/monetarypolicy/openmarket.htm',
      'https://www.bls.gov/schedule/news_release/cpi.htm',
      'https://www.bls.gov/schedule/news_release/empsit.htm',
      'https://kalshi.com/markets/fed/june-rate-cut',
    ]
  }

  if (caseId === 'preview-manifold-ai-benchmark') {
    return [
      'https://lmarena.ai/',
      'https://crfm.stanford.edu/helm/',
      'https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard',
      'https://manifold.markets/example/open-model-leading-benchmark',
      'https://paperswithcode.com/',
    ]
  }

  return [
    'https://polymarket.com/event/bitcoin-100k-before-july-2026',
    'https://www.coinbase.com/price/bitcoin',
    'https://www.coinglass.com/BitcoinOpenInterest',
    'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    'https://www.bls.gov/schedule/news_release/cpi.htm',
  ]
}

function getPreviewTranscriptTemplates(caseId: string): Array<{
  agentId: string
  agentName: string
  seat: string
  kind: string
  stage: string
  artifactId?: string
  confidence: number
  tags: string[]
  message: (turn: number) => string
}> {
  if (caseId === 'preview-kalshi-fed-cut') {
    return [
      {
        agentId: 'macro-researcher',
        agentName: 'Macro Researcher',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Rates read',
        artifactId: 'fed-macro-artifact',
        confidence: 0.52,
        tags: ['rates', 'inflation'],
        message: (turn) => `Turn ${turn}: inflation and labor evidence still leave the cut path below even odds. A softer CPI print would move the probability quickly, but the court should keep the base case restrained until the next release lands. ${turn % 3 === 0 ? 'Reference: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' : ''}`,
      },
      {
        agentId: 'prediction-market-analyst',
        agentName: 'Prediction Market Analyst',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Market read',
        confidence: 0.47,
        tags: ['market', 'liquidity'],
        message: (turn) => `Turn ${turn}: the market price is treating the June cut as live but secondary. Liquidity is thinner than the BTC case, so the court should avoid over-reading small price moves. ${turn % 4 === 0 ? 'Market page: https://kalshi.com/markets/fed/june-rate-cut' : ''}`,
      },
      {
        agentId: 'risk-bailiff',
        agentName: 'Risk Bailiff',
        seat: 'risk-bailiff',
        kind: 'challenge',
        stage: 'Scope check',
        confidence: 0.68,
        tags: ['risk', 'resolution'],
        message: (turn) => `Turn ${turn}: keep the resolution narrow. A rate-cut verdict needs an announced target range reduction at the June meeting, not dovish language or a later-meeting signal. ${turn % 5 === 0 ? 'Resolution reference: https://www.federalreserve.gov/monetarypolicy/openmarket.htm' : ''}`,
      },
      {
        agentId: 'court-clerk',
        agentName: 'Court Clerk',
        seat: 'court-clerk',
        kind: 'note',
        stage: 'Record note',
        confidence: 0.6,
        tags: ['record'],
        message: (turn) => `Turn ${turn}: record updated with the current witness read. The case remains queued for final evidence after the next macro data point. ${turn % 6 === 0 ? 'Calendar note: https://www.bls.gov/schedule/news_release/cpi.htm' : ''}`,
      },
    ]
  }

  if (caseId === 'preview-manifold-ai-benchmark') {
    return [
      {
        agentId: 'web-researcher',
        agentName: 'Web Researcher',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Benchmark scan',
        artifactId: 'ai-research-artifact',
        confidence: 0.61,
        tags: ['benchmark', 'models'],
        message: (turn) => `Turn ${turn}: the open-model trajectory is strong, but the court still needs a qualifying public benchmark result against a leading closed model before settlement can flip from probability lean to resolved event. ${turn % 3 === 0 ? 'Benchmark reference: https://lmarena.ai/' : ''}`,
      },
      {
        agentId: 'source-quality-reviewer',
        agentName: 'Source Quality Reviewer',
        seat: 'expert-witness',
        kind: 'testimony',
        stage: 'Evidence quality',
        confidence: 0.72,
        tags: ['sources', 'leaderboard'],
        message: (turn) => `Turn ${turn}: leaderboard provenance matters. The court should prefer benchmark operators, model cards, reproducible eval reports, and timestamped public result pages over social claims. ${turn % 4 === 0 ? 'Evidence standard: https://crfm.stanford.edu/helm/' : ''}`,
      },
      {
        agentId: 'risk-bailiff',
        agentName: 'Risk Bailiff',
        seat: 'risk-bailiff',
        kind: 'challenge',
        stage: 'Manipulation risk',
        confidence: 0.64,
        tags: ['risk', 'cherry-picking'],
        message: (turn) => `Turn ${turn}: the largest risk is cherry-picked benchmarks. A single narrow task win should not count unless it matches the market's “major benchmark” standard. ${turn % 5 === 0 ? 'Market context: https://manifold.markets/example/open-model-leading-benchmark' : ''}`,
      },
      {
        agentId: 'head-judge',
        agentName: 'Head Judge',
        seat: 'head-judge',
        kind: 'ruling',
        stage: 'Verdict maintenance',
        artifactId: 'ai-verdict-artifact',
        confidence: 0.58,
        tags: ['verdict'],
        message: (turn) => `Turn ${turn}: the verdict remains unresolved, evidence favors Yes. The court records the lean but keeps settlement pending until a qualifying benchmark result appears. ${turn % 6 === 0 ? 'Leaderboard watch: https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard' : ''}`,
      },
    ]
  }

  return [
    {
      agentId: 'prediction-market-analyst',
      agentName: 'Prediction Market Analyst',
      seat: 'expert-witness',
      kind: 'testimony',
      stage: 'Market read',
      artifactId: 'btc-market-artifact',
      confidence: 0.62,
      tags: ['market', 'liquidity'],
      message: (turn) => `Turn ${turn}: the market still prices a live minority path. Liquidity supports the signal, but the short deadline means the court should require a strong price or macro catalyst before moving materially above the current probability. ${turn % 3 === 0 ? 'Market page: https://polymarket.com/event/bitcoin-100k-before-july-2026' : ''}`,
    },
    {
      agentId: 'macro-researcher',
      agentName: 'Macro Researcher',
      seat: 'expert-witness',
      kind: 'testimony',
      stage: 'Macro read',
      artifactId: 'btc-macro-artifact',
      confidence: 0.56,
      tags: ['macro', 'rates'],
      message: (turn) => `Turn ${turn}: softer rates and dollar conditions would help Bitcoin challenge the threshold. Sticky inflation or risk-off positioning would keep the Yes path capped. ${turn % 4 === 0 ? 'Macro calendar: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' : ''}`,
    },
    {
      agentId: 'onchain-analyst',
      agentName: 'Onchain Analyst',
      seat: 'expert-witness',
      kind: 'testimony',
      stage: 'Flow read',
      artifactId: 'btc-flow-artifact',
      confidence: 0.53,
      tags: ['flows', 'wallets'],
      message: (turn) => `Turn ${turn}: wallet and exchange-flow evidence is mixed. There is no decisive distribution warning, but there is also not enough accumulation evidence to overrule the market price. ${turn % 5 === 0 ? 'Flow reference: https://www.coinglass.com/BitcoinOpenInterest' : ''}`,
    },
    {
      agentId: 'risk-bailiff',
      agentName: 'Risk Bailiff',
      seat: 'risk-bailiff',
      kind: 'challenge',
      stage: 'Risk challenge',
      confidence: 0.48,
      tags: ['risk', 'deadline'],
      message: (turn) => `Turn ${turn}: do not confuse a bullish narrative with a settlement event. The market must print above $100,000 before the deadline, so time decay matters in every confidence update. ${turn % 6 === 0 ? 'Price reference: https://www.coinbase.com/price/bitcoin' : ''}`,
    },
    {
      agentId: 'head-judge',
      agentName: 'Head Judge',
      seat: 'head-judge',
      kind: 'ruling',
      stage: 'Bench note',
      artifactId: 'btc-interim-verdict',
      confidence: 0.42,
      tags: ['bench', 'interim'],
      message: (turn) => `Turn ${turn}: the bench maintains the interim view. The case remains open with a credible but minority Yes path pending stronger evidence. ${turn % 7 === 0 ? 'Court source: https://polymarket.com/event/bitcoin-100k-before-july-2026' : ''}`,
    },
  ]
}
