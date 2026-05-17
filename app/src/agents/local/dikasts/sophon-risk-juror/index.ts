import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runDikastRisk(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-dikast-risk-vote`,
    caseId: context.marketCase.id,
    agentId: 'dikast-risk',
    type: 'jury-vote',
    summary: 'Votes for a cautious verdict only if Phylax preserves uncertainty and source-quality limits.',
    confidence: 0.69,
    claims: ['The case can proceed as intelligence only', 'Risk review should override raw conviction'],
    risks: ['Verdict should be downgraded if liquidity or source quality worsens'],
    costUsd: 0.01,
    createdAt: new Date().toISOString(),
  }
}
