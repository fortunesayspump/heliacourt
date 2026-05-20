import type { AgentContext, CourtArtifact, ToolEvidence } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runNotusWeatherDataWitness(context: AgentContext): CourtArtifact {
  const notusCapabilities = ['weather_data', 'sports_data', 'calendar_data', 'market_data']
  const capabilityOrder = getCapabilityOrder(context)
  const externalEvidence =
    findEvidence(context.toolEvidence, capabilityOrder, (evidence) => evidence.status === 'ok' && evidence.relevance === 'primary')
    ?? findEvidence(context.toolEvidence, capabilityOrder, (evidence) => evidence.status === 'ok')
  const attemptedEvidence =
    findEvidence(context.toolEvidence, capabilityOrder, (evidence) => notusCapabilities.includes(evidence.capability))
  const attemptedLabel = attemptedEvidence ? getCapabilityLabel(attemptedEvidence.capability) : 'structured dataset'
  const missingSummary = buildMissingSummary(context, attemptedEvidence, attemptedLabel)
  const findings = compactRecordItems(externalEvidence?.observations ?? [], 4)
  const limits = externalEvidence
    ? [`${getCapabilityLabel(externalEvidence.capability)} evidence can change before the case horizon resolves`]
    : [
        attemptedEvidence?.error ?? missingSummary,
        `Do not infer ${attemptedLabel} facts, roster status, operational impacts, or probabilities without supplied data.`,
      ]

  return {
    id: `${context.marketCase.id}-notus-testimony`,
    caseId: context.marketCase.id,
    agentId: 'notus-weather-data-witness',
    type: 'witness-testimony',
    summary: findings[0] ?? missingSummary,
    transcriptMessage: buildWitnessSpeech({
      role: 'Notus',
      findings,
      supports: 'Structured data can anchor timing, measured conditions, rosters, calendars, or market quotes; it does not replace source testimony for unrelated health/news claims.',
      limits,
      fallback: missingSummary,
    }),
    confidence: externalEvidence ? 0.68 : 0.52,
    claims: findings.slice(0, 3),
    risks: limits,
    costUsd: 0.03,
    createdAt: new Date().toISOString(),
  }
}

function findEvidence(
  evidence: ToolEvidence[] | undefined,
  capabilityOrder: string[],
  predicate: (evidence: ToolEvidence) => boolean,
) {
  for (const capability of capabilityOrder) {
    const match = evidence?.find((item) => item.capability === capability && predicate(item))
    if (match) return match
  }

  return evidence?.find(predicate)
}

function getCapabilityOrder(context: AgentContext) {
  const text = `${context.marketCase.question} ${context.marketCase.context ?? ''} ${context.courtInstruction ?? ''}`

  if (/\b(sport|sports|game|match|team|player|squad|roster|national team|fifa|world cup|takes the field|eligibility|appearance)\b/i.test(text)) {
    return ['sports_data', 'calendar_data', 'market_data', 'weather_data']
  }

  if (/\b(weather|rain|storm|flood|wind|temperature|port|flight|shipment|logistics|delay|disrupt)\b/i.test(text)) {
    return ['weather_data', 'calendar_data', 'sports_data', 'market_data']
  }

  if (/\b(holiday|calendar|business day|market open|market close|deadline|horizon)\b/i.test(text)) {
    return ['calendar_data', 'market_data', 'sports_data', 'weather_data']
  }

  if (/\b(stock|equity|shares|\$[A-Z]{1,5}\b|quote|price|market)\b/i.test(text)) {
    return ['market_data', 'calendar_data', 'sports_data', 'weather_data']
  }

  return ['calendar_data', 'market_data', 'weather_data', 'sports_data']
}

function buildMissingSummary(context: AgentContext, attemptedEvidence: ToolEvidence | undefined, attemptedLabel: string) {
  const text = `${context.marketCase.question} ${context.marketCase.context ?? ''} ${context.courtInstruction ?? ''}`
  const attemptedObservation = attemptedEvidence?.observations[0]

  if (/\b(sport|sports|game|match|team|player|squad|roster|national team|fifa|world cup|takes the field|eligibility|appearance)\b/i.test(text)) {
    return attemptedEvidence?.capability === 'sports_data' && attemptedObservation
      ? attemptedObservation
      : 'No concrete sports dataset was available for this testimony.'
  }

  if (attemptedObservation) return attemptedObservation

  return `No concrete ${attemptedLabel} was available for this testimony.`
}

function getCapabilityLabel(capability: string) {
  if (capability === 'sports_data') return 'sports dataset'
  if (capability === 'weather_data') return 'weather dataset'
  if (capability === 'calendar_data') return 'calendar dataset'
  if (capability === 'market_data') return 'market quote dataset'

  return 'external dataset'
}
