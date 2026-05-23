export type CaseType = 'crypto-market' | 'prediction-market' | 'macro' | 'real-world-event'

export type MarketCase = {
  id: string
  question: string
  context?: string
  links?: string[]
  imageUrl?: string
  type: CaseType
  parentCaseId?: string
  filingKind?: 'original' | 'fresh-hearing' | 'private-fork'
  filer?: `0x${string}`
  visibility?: 'public' | 'unlisted' | 'private'
  payerVisibility?: 'public' | 'private'
  onchain?: {
    chainId: string
    escrowAddress: `0x${string}`
    caseId: string
    txHash: `0x${string}`
    budgetUsdc: string
    questionHash: `0x${string}`
    metadataURI?: string
  }
  createdAt: string
}

export type CourtArtifactType =
  | 'case-record'
  | 'witness-testimony'
  | 'evidence'
  | 'argument'
  | 'risk-review'
  | 'jury-vote'
  | 'verdict'
  | 'settlement-plan'

export type CourtArtifact = {
  id: string
  caseId: string
  agentId: string
  type: CourtArtifactType
  summary: string
  confidence?: number
  claims?: string[]
  risks?: string[]
  costUsd: number
  createdAt: string
  promptVersion?: string
  modelProvider?: string
  model?: string
  runMode?: 'deterministic' | 'model' | 'tool-backed-model'
  notes?: string[]
  transcriptMessage?: string
  replyToTurnId?: string
  requestedAgentId?: string
  request?: string
  toolEvidence?: ToolEvidence[]
  evidenceItems?: EvidenceItem[]
  testimony?: TestimonyFinding
  argumentNodes?: ArgumentNode[]
  argumentQuality?: ArgumentQualityWarning[]
  evidenceScores?: EvidenceScore[]
}

export type EvidenceTag =
  | 'direct-proof'
  | 'yes-catalyst'
  | 'no-blocker'
  | 'timing'
  | 'source-quality'
  | 'background'
  | 'missing'

export type EvidenceScore = {
  text: string
  tag: EvidenceTag
  polarity: 'yes' | 'no' | 'neutral'
  weight: number
  basis: 'claim' | 'risk' | 'tool' | 'argument' | 'ruling'
}

export type CourtTranscriptTurnKind =
  | 'opening'
  | 'direction'
  | 'testimony'
  | 'exhibit'
  | 'question'
  | 'argument'
  | 'risk'
  | 'vote'
  | 'verdict'
  | 'receipt'

export type CourtTranscriptTurn = {
  id: string
  caseId: string
  agentId: string
  agentName: string
  speaker?: string
  seat: string
  kind: CourtTranscriptTurnKind
  stage: string
  message: string
  replyToId?: string
  requestedAgentId?: string
  request?: string
  artifactId?: string
  confidence?: number
  createdAt: string
  tags?: string[]
}

export type ToolEvidenceSource = {
  title: string
  url?: string
  observedAt?: string
  value?: string
}

export type ToolEvidence = {
  capability:
    | 'prediction_market_data'
    | 'market_data'
    | 'web_news_search'
    | 'onchain_data'
    | 'weather_data'
    | 'sports_data'
    | 'calendar_data'
    | 'web_page_scrape'
    | 'visual_page_analysis'
    | 'social_activity_data'
    | 'risk_analysis'
    | 'settlement_accounting'
  provider: string
  query: string
  fetchedAt: string
  status: 'ok' | 'empty' | 'skipped' | 'error'
  observations: string[]
  sources: ToolEvidenceSource[]
  error?: string
  selected?: boolean
  relevance?: 'primary' | 'supporting' | 'low' | 'none'
  plannerReason?: string
}

export type EvidenceItem = {
  id: string
  caseId: string
  capability: ToolEvidence['capability']
  provider: string
  sourceTitle: string
  sourceUrl?: string
  sourceType: 'official' | 'market' | 'news' | 'scrape' | 'visual' | 'social' | 'dataset' | 'onchain' | 'risk' | 'settlement' | 'unknown'
  observedAt: string
  claim: string
  supports: 'yes' | 'no' | 'neutral' | 'context'
  directness: 'direct' | 'indirect' | 'background' | 'missing'
  freshness: 'fresh' | 'recent' | 'stale' | 'unknown'
  reliability: 'high' | 'medium' | 'low' | 'unknown'
  limitations: string[]
  relevance?: ToolEvidence['relevance']
  plannerReason?: string
}

export type TestimonyFinding = {
  evidenceIds: string[]
  finding: string
  supports: 'yes' | 'no' | 'neutral' | 'context'
  forecastWeight: 'strong' | 'moderate' | 'weak' | 'none'
  limits: string[]
  nextQuestion?: string
}

export type ArgumentNode = {
  id: string
  side: 'yes' | 'no' | 'no-edge'
  claim: string
  evidenceIds: string[]
  warrant: string
  attacks: string[]
  confidence: number
}

export type ArgumentQualityWarning = {
  nodeId: string
  severity: 'low' | 'medium' | 'high'
  issue:
    | 'missing-evidence'
    | 'weak-warrant'
    | 'repetition'
    | 'missing-quantification'
    | 'market-handwave'
    | 'resolution-mismatch'
    | 'low-novelty'
    | 'no-progress'
  message: string
  repairPrompt: string
}

export type AgentContext = {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript?: CourtTranscriptTurn[]
  toolEvidence?: ToolEvidence[]
  evidenceLedger?: EvidenceItem[]
  evidenceAgenda?: import('./evidence-agenda').EvidenceAgenda
  courtInstruction?: string
  courtPhase?: string
}
