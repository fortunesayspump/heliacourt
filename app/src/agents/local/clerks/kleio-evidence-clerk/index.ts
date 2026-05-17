import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runEvidenceClerk(context: AgentContext): CourtArtifact {
  const witnessCount = context.artifacts.filter((artifact) => artifact.type === 'witness-testimony').length

  return {
    id: `${context.marketCase.id}-evidence`,
    caseId: context.marketCase.id,
    agentId: 'evidence-clerk',
    type: 'evidence',
    summary: `Filed ${witnessCount} witness testimonies into the court record and prepared them for counsel review.`,
    confidence: 0.74,
    claims: [
      'Witness testimony organized',
      'Source trail prepared',
      'Exhibit packet created',
    ],
    risks: ['Sample evidence is simulated until live data tools are connected'],
    costUsd: 0.03,
    createdAt: new Date().toISOString(),
  }
}
