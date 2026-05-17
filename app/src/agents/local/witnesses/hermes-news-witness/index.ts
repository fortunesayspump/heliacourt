import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runHermesNewsWitness(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-hermes-testimony`,
    caseId: context.marketCase.id,
    agentId: 'hermes-news-witness',
    type: 'witness-testimony',
    summary: 'Testifies on headline flow, source quality, and whether the market may already know the story.',
    confidence: 0.67,
    claims: [
      'Recent headlines support elevated attention around the case',
      'Source freshness matters more than headline volume alone',
    ],
    risks: ['News-driven signals can reverse when details are clarified'],
    costUsd: 0.03,
    createdAt: new Date().toISOString(),
  }
}
