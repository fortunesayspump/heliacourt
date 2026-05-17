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
  mode: AgentMode
  endpoint?: string
  priceUsd: number
  permissions: AgentPermission[]
  inputSchema: string
  outputSchema: string
  enabled: boolean
  version: string
}
