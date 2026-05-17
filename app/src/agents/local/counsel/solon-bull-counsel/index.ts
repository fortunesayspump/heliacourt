import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runBullCounsel(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-bull-argument`,
    caseId: context.marketCase.id,
    agentId: 'bull-counsel',
    type: 'argument',
    summary: 'Argues that the market has not fully priced the newest signal cluster.',
    confidence: 0.64,
    claims: [
      'The strongest evidence supports a slight yes-side edge',
      'Market odds appear slower than the recent evidence shift',
    ],
    risks: ['The move may already be partially priced'],
    costUsd: 0.05,
    createdAt: new Date().toISOString(),
  }
}
