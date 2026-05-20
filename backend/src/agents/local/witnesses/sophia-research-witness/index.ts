import type { AgentContext, CourtArtifact, ToolEvidence } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runSophiaResearchWitness(context: AgentContext): CourtArtifact {
  const usableEvidence = (context.toolEvidence ?? []).filter((item) => item.status === 'ok')
  const observations = usableEvidence.flatMap((item) => item.observations).filter(Boolean)
  const directSupport = observations.find((observation) => /\b(exposed|official|primary|direct|resolution|reported|confirmed|last traded|implies|released|declassified|catalyst|deadline)\b/i.test(observation))
  const contradiction = observations.find((observation) => /\b(does not prove|did not expose|no active market matched|no dedicated fresh-news|missing|skipped|empty)\b/i.test(observation))
  const background = observations.find((observation) => observation !== directSupport && observation !== contradiction)
  const findings = compactRecordItems([
    directSupport ? `Forecast-relevant support in the supplied record: ${directSupport}` : undefined,
    background ? `Background context in the supplied record: ${background}` : undefined,
    contradiction ? `Material limitation or contradiction: ${contradiction}` : undefined,
  ], 5)
  const limits = usableEvidence.length
    ? [
        'Research synthesis is only as strong as the admitted sources and tool evidence.',
        'Background context needs an explicit bridge before it can carry forecast weight.',
      ]
    : [
        'No usable web, scrape, market, or dataset evidence was returned for synthesis.',
        'Counsel should request specific witnesses or source URLs before relying on broad research.',
      ]

  return {
    id: `${context.marketCase.id}-sophia-testimony`,
    caseId: context.marketCase.id,
    agentId: 'sophia-research-witness',
    type: 'witness-testimony',
    summary: compactRecordItems([directSupport, background, contradiction], 1)[0] ?? 'No broad research evidence was available for this testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Sophia',
      findings,
      supports: 'This synthesis separates direct support, background, contradiction, and missing proof for counsel.',
      limits,
      fallback: 'No broad research evidence was available for this testimony.',
    }),
    confidence: usableEvidence.length ? 0.67 : 0.36,
    claims: findings,
    risks: limits,
    costUsd: 0.04,
    createdAt: new Date().toISOString(),
  }
}
