import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runArgosOnchainWitness(context: AgentContext): CourtArtifact {
  const onchainEvidence = context.toolEvidence?.find((evidence) => evidence.capability === 'onchain_data')
  const findings = compactRecordItems(onchainEvidence?.observations ?? [], 4)
  const limits = onchainEvidence?.status === 'ok'
    ? ['Transaction reads need wallet labels and entity context before strong inference.']
    : [
        onchainEvidence?.error ?? onchainEvidence?.observations[0] ?? 'No onchain evidence was returned.',
        'Do not infer wallet flow, exchange movement, entity behavior, or stablecoin pressure without supplied onchain data.',
      ]

  return {
    id: `${context.marketCase.id}-argos-testimony`,
    caseId: context.marketCase.id,
    agentId: 'argos-onchain-witness',
    type: 'witness-testimony',
    summary: findings[0] ?? 'No onchain evidence was available for this testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Argos',
      findings,
      supports: 'This can support onchain-flow claims only when addresses, labels, timing, and transaction direction are explicit.',
      limits,
      fallback: 'No onchain evidence was available for this testimony.',
    }),
    confidence: onchainEvidence?.status === 'ok' ? 0.66 : 0.35,
    claims: findings.slice(0, 3),
    risks: limits,
    costUsd: 0.04,
    createdAt: new Date().toISOString(),
  }
}
