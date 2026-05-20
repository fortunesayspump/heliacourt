import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { summarizeEvidenceScores } from '../../../../court/evidence-scoring'
import { buildRecordBrief, formatList, makeArtifact } from '../../courtroom-record'

export function runRiskBailiff(context: AgentContext): CourtArtifact {
  const brief = buildRecordBrief(context)
  const gaps = brief.gaps.length ? brief.gaps : ['No source closes every forecast bridge.']
  const scores = context.artifacts.flatMap((artifact) => artifact.evidenceScores ?? [])

  return makeArtifact(context, {
    agentId: 'risk-bailiff',
    type: 'risk-review',
    summary: 'Caps confidence by separating observed facts from forecast bridges.',
    transcriptMessage: `Risk instruction: cap the forecast below high confidence unless direct proof is scored and admitted. Evidence-score map: ${summarizeEvidenceScores(scores)} Main constraints: ${formatList(gaps, 'evidence remains limited', 4)} The court must not infer a strong Yes or No forecast from context alone; counsel needs a bridge from facts to probability.`,
    confidence: 0.82,
    claims: ['Forecast should stay below high-confidence framing', 'Supporting context needs an explicit probability bridge'],
    risks: gaps.slice(0, 4),
    costUsd: 0.02,
  })
}
