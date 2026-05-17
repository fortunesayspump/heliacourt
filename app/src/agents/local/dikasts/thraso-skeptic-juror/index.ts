import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runDikastSkeptic(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-dikast-skeptic-vote`,
    caseId: context.marketCase.id,
    agentId: 'dikast-skeptic',
    type: 'jury-vote',
    summary: 'Votes for watchlist because the defense raised enough doubt about signal quality.',
    confidence: 0.61,
    claims: ['The bear counsel identified material uncertainty', 'No clear edge remains a defensible outcome'],
    risks: ['Waiting may miss the earliest move'],
    costUsd: 0.01,
    createdAt: new Date().toISOString(),
  }
}
