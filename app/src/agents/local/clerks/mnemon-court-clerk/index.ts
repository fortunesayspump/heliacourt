import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runCourtClerk(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-court-record-opened`,
    caseId: context.marketCase.id,
    agentId: 'court-clerk',
    type: 'case-record',
    summary: `Opened court file for: ${context.marketCase.question}`,
    claims: ['Case ID assigned', 'Initial hearing timeline created', 'Arc record pending'],
    costUsd: 0.02,
    createdAt: new Date().toISOString(),
  }
}
