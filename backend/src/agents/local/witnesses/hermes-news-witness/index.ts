import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runHermesNewsWitness(context: AgentContext): CourtArtifact {
  const newsEvidence = context.toolEvidence?.find((evidence) => evidence.capability === 'web_news_search')
  const findings = compactRecordItems(newsEvidence?.observations ?? [], 4)
  const limits = newsEvidence?.status === 'ok'
    ? ['Search results show public source flow; they are not proof by themselves.', 'Counsel must prefer official or directly reported sources over aggregators.']
    : [newsEvidence?.error ?? newsEvidence?.observations[0] ?? 'No web/news evidence was returned.']

  return {
    id: `${context.marketCase.id}-hermes-testimony`,
    caseId: context.marketCase.id,
    agentId: 'hermes-news-witness',
    type: 'witness-testimony',
    summary: findings[0] ?? 'No web/news evidence was available for this testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Hermes',
      findings,
      supports: 'This helps identify whether there is a live outbreak signal, official denial/confirmation, and whether credible reporting is moving toward Yes or No.',
      limits,
      fallback: 'No web/news evidence was available for this testimony.',
    }),
    confidence: newsEvidence?.status === 'ok' ? 0.69 : 0.35,
    claims: findings.slice(0, 3),
    risks: limits,
    costUsd: 0.03,
    createdAt: new Date().toISOString(),
  }
}
