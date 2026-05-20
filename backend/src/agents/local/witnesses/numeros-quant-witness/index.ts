import type { AgentContext, CourtArtifact, ToolEvidence } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runNumerosQuantWitness(context: AgentContext): CourtArtifact {
  const evidence = getQuantEvidence(context.toolEvidence)
  const okEvidence = evidence.filter((item) => item.status === 'ok')
  const observations = okEvidence.flatMap((item) => item.observations).filter(Boolean)
  const quantObservation =
    observations.find((observation) => /\b(implies|probability|liquidity|last traded|price|target|above|below|volatility|funding|distance)\b/i.test(observation))
    ?? observations[0]
  const findings = compactRecordItems(observations, 5)
  const limits = okEvidence.length
    ? [
        'Numerical market evidence can be stale, thin, or loosely matched to the case wording.',
        'Quant testimony does not decide the event; it only anchors numerical constraints and market structure.',
      ]
    : [
        evidence[0]?.error ?? evidence[0]?.observations[0] ?? 'No prediction-market or market quote evidence was returned.',
        'Do not infer probabilities, volatility, liquidity, or price distance without supplied numerical evidence.',
      ]

  return {
    id: `${context.marketCase.id}-numeros-testimony`,
    caseId: context.marketCase.id,
    agentId: 'numeros-quant-witness',
    type: 'witness-testimony',
    summary: compactRecordItems([quantObservation], 1)[0] ?? 'No numerical market evidence was available for this testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Numeros',
      findings,
      supports: 'Use this only to anchor probabilities, liquidity, or numerical constraints; do not treat it as event proof.',
      limits,
      fallback: 'No numerical market evidence was available for this testimony.',
    }),
    confidence: okEvidence.length ? 0.7 : 0.35,
    claims: findings,
    risks: limits,
    costUsd: 0.04,
    createdAt: new Date().toISOString(),
  }
}

function getQuantEvidence(evidence: ToolEvidence[] | undefined) {
  return evidence?.filter((item) => item.capability === 'prediction_market_data' || item.capability === 'market_data') ?? []
}
