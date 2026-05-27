export type CourtSeat =
  | 'court-clerk'
  | 'evidence-clerk'
  | 'bull-counsel'
  | 'bear-counsel'
  | 'juror'
  | 'expert-witness'
  | 'risk-bailiff'
  | 'head-judge'
  | 'settlement-clerk'
  | 'outcome-reviewer'

export type AgentMode = 'local' | 'hosted' | 'external'

export type AgentRunMode = 'deterministic' | 'model' | 'tool-backed-model'

export type AgentToolCapability =
  | 'prediction_market_data'
  | 'market_data'
  | 'web_news_search'
  | 'research_session'
  | 'onchain_data'
  | 'weather_data'
  | 'sports_data'
  | 'calendar_data'
  | 'web_page_scrape'
  | 'visual_page_analysis'
  | 'social_activity_data'
  | 'risk_analysis'
  | 'settlement_accounting'

export type AgentPermission =
  | 'read_case'
  | 'read_public_evidence'
  | 'submit_evidence'
  | 'submit_testimony'
  | 'submit_argument'
  | 'submit_risk_review'
  | 'submit_jury_vote'
  | 'submit_verdict_recommendation'
  | 'request_payment'

export type AgentRegistryEntry = {
  id: string
  name: string
  seat: CourtSeat
  description: string
  owner: 'protocol' | `0x${string}`
  onchainAgentId?: string
  metadataURI?: string
  mode: AgentMode
  endpoint?: string
  priceUsd: number
  permissions: AgentPermission[]
  inputSchema: string
  outputSchema: string
  promptKey: string
  runMode: AgentRunMode
  defaultModel?: string
  temperature: number
  toolCapabilities: AgentToolCapability[]
  enabled: boolean
  version: string
}

export type AgentPromptSpec = {
  key: string
  version: string
  system: string
  task: string
  outputContract: string
}
