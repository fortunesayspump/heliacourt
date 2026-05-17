import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runRiskBailiff(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-risk-review`,
    caseId: context.marketCase.id,
    agentId: 'risk-bailiff',
    type: 'risk-review',
    summary: 'Flags the verdict as intelligence-only and records confidence, liquidity, and evidence-quality constraints.',
    confidence: 0.82,
    claims: ['Verdict should stay below high-confidence framing', 'Liquidity context is relevant to interpretation'],
    risks: ['Evidence quality is not strong enough for a high-conviction decree'],
    costUsd: 0.02,
    createdAt: new Date().toISOString(),
  }
}
