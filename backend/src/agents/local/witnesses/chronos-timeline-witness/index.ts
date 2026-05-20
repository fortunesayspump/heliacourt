import type { AgentContext, CourtArtifact, ToolEvidence } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runChronosTimelineWitness(context: AgentContext): CourtArtifact {
  const evidence = getTimelineEvidence(context.toolEvidence)
  const okEvidence = evidence.filter((item) => item.status === 'ok')
  const observations = okEvidence.flatMap((item) => item.observations).filter(Boolean)
  const datedSources = okEvidence
    .flatMap((item) => item.sources)
    .filter((source) => source.observedAt || /\b(20\d{2}|today|tomorrow|yesterday|within|hours?|days?|deadline|horizon)\b/i.test(`${source.title} ${source.value ?? ''}`))
  const timingObservation =
    observations.find((observation) => /\b(20\d{2}|within|hours?|days?|deadline|horizon|timestamp|fresh|stale|published|calendar|holiday)\b/i.test(observation))
    ?? observations[0]
  const findings = compactRecordItems([
    timingObservation,
    datedSources.length ? `${datedSources.length} dated source or calendar marker(s) were available for chronology.` : undefined,
  ], 4)
  const limits = okEvidence.length
    ? [
        'Timeline evidence supports sequence and timing only; it does not decide the final forecast outcome.',
        datedSources.length ? 'Dated sources still need direct relevance to the resolution criteria.' : 'The record has weak explicit date markers.',
      ]
    : [
        evidence[0]?.error ?? evidence[0]?.observations[0] ?? 'No search, scrape, or calendar timing evidence was returned.',
        'The court cannot resolve horizon or deadline issues without dated evidence.',
      ]

  return {
    id: `${context.marketCase.id}-chronos-testimony`,
    caseId: context.marketCase.id,
    agentId: 'chronos-timeline-witness',
    type: 'witness-testimony',
    summary: findings[0] ?? 'No timeline evidence was available for this testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Chronos',
      findings,
      supports: 'This testimony can place signals before, within, or outside the resolution window and expose stale evidence.',
      limits,
      fallback: 'No timeline evidence was available for this testimony.',
    }),
    confidence: okEvidence.length ? 0.66 : 0.36,
    claims: findings,
    risks: limits,
    costUsd: 0.03,
    createdAt: new Date().toISOString(),
  }
}

function getTimelineEvidence(evidence: ToolEvidence[] | undefined) {
  return evidence?.filter((item) => item.capability === 'web_news_search' || item.capability === 'web_page_scrape' || item.capability === 'calendar_data') ?? []
}
