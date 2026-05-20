import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runPythiaPredictionWitness(context: AgentContext): CourtArtifact {
  const predictionEvidence = context.toolEvidence?.find((evidence) => evidence.status === 'ok' && evidence.capability === 'prediction_market_data')
  const secondaryMarketEvidence = context.toolEvidence
    ?.find((evidence) => evidence.status === 'ok' && evidence.capability === 'web_news_search' && evidence.observations.some(isMarketContextObservation))
  const attemptedEvidence = context.toolEvidence?.find((evidence) => evidence.capability === 'prediction_market_data' || evidence.capability === 'market_data')
  const strongestObservation =
    predictionEvidence?.observations.find((observation) => /\b(implies|last traded|liquidity|probability|odds)\b/i.test(observation) && !/\bno active market matched\b/i.test(observation))
    ?? secondaryMarketEvidence?.observations.find(isMarketContextObservation)
    ?? predictionEvidence?.observations[0]
  const findings = compactRecordItems([
    ...(predictionEvidence?.observations ?? []),
    ...(secondaryMarketEvidence?.observations.filter(isMarketContextObservation) ?? []),
  ], 5)
  const limits = predictionEvidence?.status === 'ok'
    ? [
        'Prediction-market data is context, not proof of the event.',
        secondaryMarketEvidence ? 'Some odds context came from web-discovered market pages, not first-party exchange APIs.' : undefined,
        'Market search can return loosely related markets and must be checked against the exact wording.',
      ].filter((item): item is string => Boolean(item))
    : [attemptedEvidence?.error ?? attemptedEvidence?.observations[0] ?? 'No prediction-market evidence was returned.']

  return {
    id: `${context.marketCase.id}-pythia-testimony`,
    caseId: context.marketCase.id,
    agentId: 'pythia-prediction-witness',
    type: 'witness-testimony',
    summary: compactRecordItems([strongestObservation, attemptedEvidence?.observations[0]], 1)[0] ?? 'No prediction-market or market-price evidence was available for this testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Pythia',
      findings,
      supports: 'Market evidence can show trader expectations and liquidity, but counsel must build the non-market probability bridge separately.',
      limits,
      fallback: 'No prediction-market or market-price evidence was available for this testimony.',
    }),
    confidence: predictionEvidence?.status === 'ok' ? (secondaryMarketEvidence ? 0.68 : 0.72) : 0.35,
    claims: findings,
    risks: limits,
    costUsd: 0.04,
    createdAt: new Date().toISOString(),
  }
}

function isMarketContextObservation(observation: string) {
  return /\b(polymarket|kalshi|market|odds|chance|volume|liquidity|priced?|pricing|traded)\b/i.test(observation)
    && !/\b(no active market matched|returned no active market candidates)\b/i.test(observation)
}
