export type CaseType = 'crypto-market' | 'prediction-market' | 'macro' | 'real-world-event'

export type MarketCase = {
  id: string
  question: string
  type: CaseType
  filer?: `0x${string}`
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
}

export type AgentContext = {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
}
