import type { AgentContext, CourtArtifact, ToolEvidence } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runThalesSocialCountWitness(context: AgentContext): CourtArtifact {
  const evidence = getSocialEvidence(context.toolEvidence)
  const visualEvidence = context.toolEvidence?.filter((item) => item.capability === 'visual_page_analysis') ?? []
  const scrapeEvidence = context.toolEvidence?.filter((item) => item.capability === 'web_page_scrape') ?? []
  const supportingObservations = [...visualEvidence, ...scrapeEvidence].flatMap((item) => item.observations).filter(Boolean)
  const okEvidence = evidence.filter((item) => item.status === 'ok')
  const okSupportingEvidence = [...visualEvidence, ...scrapeEvidence].filter((item) => item.status === 'ok')
  const observations = [
    ...evidence.flatMap((item) => item.observations).filter(Boolean),
    ...supportingObservations.map((observation) => `Rendered/source audit: ${observation}`),
  ]
  const countObservation =
    observations.find((observation) => /\bcounted \d+|exposed .*=\d+|social target|social account candidate|counting window candidate|exact social/i.test(observation))
    ?? observations[0]
  const findings = compactRecordItems(observations, 7)
  const limits = okEvidence.length || okSupportingEvidence.length
    ? [
        'Social-count testimony must match the market rule for retweets, quote tweets, replies, deleted posts, timezone, and endpoint coverage.',
        'Public profile snapshots are live unless archived; exact historical counts require the market source, archive, platform export, or trusted counter source.',
        'Rendered screenshot/OCR reads are supporting evidence; accept exact counts only when the visible account identity and count label are clear.',
      ]
    : [
        evidence[0]?.error ?? evidence[0]?.observations[0] ?? 'No social-count provider evidence was returned.',
        'Do not infer a tweet/post/follower count from search snippets, screenshots, or gated social pages unless the count source, account identity, and timing rule are explicit.',
      ]

  return {
    id: `${context.marketCase.id}-thales-testimony`,
    caseId: context.marketCase.id,
    agentId: 'social-count-witness',
    type: 'witness-testimony',
    summary: compactRecordItems([countObservation], 1)[0] ?? 'No social activity count evidence was available for this testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Thales',
      findings,
      supports: 'This can support social profile/count markets only when the handle, metric, and timing rule match the market.',
      limits,
      fallback: 'No social activity count evidence was available for this testimony.',
    }),
    confidence: okEvidence.length ? 0.76 : okSupportingEvidence.length ? 0.58 : evidence.length ? 0.42 : 0.3,
    claims: findings,
    risks: limits,
    costUsd: 0.04,
    createdAt: new Date().toISOString(),
  }
}

function getSocialEvidence(evidence: ToolEvidence[] | undefined) {
  return evidence?.filter((item) => item.capability === 'social_activity_data') ?? []
}
