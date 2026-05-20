import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { summarizeEvidenceScores } from '../../../../court/evidence-scoring'
import { buildRecordBrief, formatList, makeArtifact } from '../../courtroom-record'

export function runEvidenceClerk(context: AgentContext): CourtArtifact {
  const witnessCount = context.artifacts.filter((artifact) => artifact.type === 'witness-testimony').length
  const brief = buildRecordBrief(context)
  const facts = [...brief.witnessFacts, ...brief.primaryFacts]
  const gaps = brief.gaps
  const scores = context.artifacts.flatMap((artifact) => artifact.evidenceScores ?? [])

  return makeArtifact(context, {
    agentId: 'evidence-clerk',
    type: 'evidence',
    summary: `Filed ${witnessCount} witness testimonies with admitted facts and limits separated.`,
    transcriptMessage: `Exhibits filed. Supported facts: ${formatList(facts, 'none admitted', 4)} Structured scores: ${summarizeEvidenceScores(scores)} Unresolved gaps or excluded inferences: ${formatList(gaps, 'none noted', 3)} Counsel must argue from this packet only.`,
    confidence: 0.74,
    claims: facts.slice(0, 5),
    risks: gaps.slice(0, 4),
    costUsd: 0.03,
  })
}
