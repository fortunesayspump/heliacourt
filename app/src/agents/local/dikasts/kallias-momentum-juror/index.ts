import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runDikastMomentum(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-dikast-momentum-vote`,
    caseId: context.marketCase.id,
    agentId: 'dikast-momentum',
    type: 'jury-vote',
    summary: 'Votes for a slight bullish edge because the freshest signals support momentum continuation.',
    confidence: 0.66,
    claims: ['Recent evidence favors the bull counsel', 'Momentum is meaningful but not decisive'],
    risks: ['Fast signals can reverse before the case resolves'],
    costUsd: 0.01,
    createdAt: new Date().toISOString(),
  }
}
