import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runBearCounsel(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-bear-argument`,
    caseId: context.marketCase.id,
    agentId: 'bear-counsel',
    type: 'argument',
    summary: 'Argues that the evidence is not strong enough for a high-conviction verdict.',
    confidence: 0.58,
    claims: [
      'Signal quality is mixed',
      'Liquidity and timing can make the evidence less reliable',
    ],
    risks: ['False positives are common around fast-moving headlines'],
    costUsd: 0.05,
    createdAt: new Date().toISOString(),
  }
}
