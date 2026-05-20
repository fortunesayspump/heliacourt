import type { AgentContext, CourtArtifact, ToolEvidence } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runSkepsisSourceQualityWitness(context: AgentContext): CourtArtifact {
  const evidence = getSourceEvidence(context.toolEvidence)
  const okEvidence = evidence.filter((item) => item.status === 'ok')
  const observations = okEvidence.flatMap((item) => item.observations).filter(Boolean)
  const sources = okEvidence.flatMap((item) => item.sources)
  const officialSources = sources.filter((source) => /official|fifa|sec|gov|court|exchange|issuer|primary/i.test(`${source.title} ${source.url ?? ''}`))
  const referenceSources = sources.filter((source) => /wikipedia|crossref|reference/i.test(`${source.title} ${source.url ?? ''}`))
  const directness = observations.find((observation) => /\bdoes not prove|did not expose|resolution|official|primary|credible|direct\b/i.test(observation))
  const summary = directness
    ?? observations[0]
    ?? 'No source-quality evidence was available for this testimony.'
  const findings = compactRecordItems([
    officialSources.length ? `${officialSources.length} official or primary-looking source(s) were present in the source record.` : undefined,
    referenceSources.length ? `${referenceSources.length} reference-style source(s) were present and should not be treated as direct resolution proof.` : undefined,
    directness,
    observations[0],
  ], 4)
  const limits = okEvidence.length
    ? [
        'Source authority is not the same thing as proof of a future event.',
        'Reference, search, and scraped pages must be tied directly to the case context before counsel can rely on them.',
      ]
    : [
        evidence[0]?.error ?? evidence[0]?.observations[0] ?? 'No search or scrape evidence was returned.',
        'The court cannot grade source authority, freshness, or directness without source evidence.',
      ]

  return {
    id: `${context.marketCase.id}-skepsis-testimony`,
    caseId: context.marketCase.id,
    agentId: 'skepsis-source-quality-witness',
    type: 'witness-testimony',
    summary: compactRecordItems([summary], 1)[0] ?? summary,
    transcriptMessage: buildWitnessSpeech({
      role: 'Skepsis',
      findings,
      supports: 'This grades whether sources are official, direct, fresh, and tied to the exact resolution criteria.',
      limits,
      fallback: 'No source-quality evidence was available for this testimony.',
    }),
    confidence: okEvidence.length ? 0.68 : 0.38,
    claims: findings,
    risks: limits,
    costUsd: 0.03,
    createdAt: new Date().toISOString(),
  }
}

function getSourceEvidence(evidence: ToolEvidence[] | undefined) {
  return evidence?.filter((item) => item.capability === 'web_news_search' || item.capability === 'web_page_scrape') ?? []
}
