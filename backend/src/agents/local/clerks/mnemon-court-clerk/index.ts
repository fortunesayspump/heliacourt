import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runCourtClerk(context: AgentContext): CourtArtifact {
  const contextSummary = context.marketCase.context ? ` Context preserved: ${context.marketCase.context}` : ''

  return {
    id: `${context.marketCase.id}-court-record-opened`,
    caseId: context.marketCase.id,
    agentId: 'court-clerk',
    type: 'case-record',
    summary: `Opened court file for: ${context.marketCase.question}.${contextSummary}`,
    claims: ['Case ID assigned', 'Initial hearing timeline created', ...(context.marketCase.context ? ['Case context preserved for witness and resolution checks'] : []), 'Arc record pending'],
    costUsd: 0.02,
    createdAt: new Date().toISOString(),
  }
}
