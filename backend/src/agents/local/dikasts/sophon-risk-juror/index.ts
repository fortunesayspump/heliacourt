import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildRecordBrief, formatList, makeArtifact, summarizeVerdictPosture } from '../../courtroom-record'

export function runDikastRisk(context: AgentContext): CourtArtifact {
  const brief = buildRecordBrief(context)
  const posture = summarizeVerdictPosture(brief)
  const facts = [...brief.admittedFacts, ...brief.witnessFacts]
  const gap = brief.gaps[0] ?? 'uncertainty remains material'

  return makeArtifact(context, {
    agentId: 'dikast-risk',
    type: 'jury-vote',
    summary: `Votes for ${posture.label} only with risk caps preserved.`,
    transcriptMessage: `My risk vote: ${posture.label}, capped by uncertainty. Evidence relied on: ${formatList(facts, 'no admitted merits fact', 3)} Cap: ${gap}.`,
    confidence: Math.min(posture.confidence + 0.04, 0.7),
    claims: facts.slice(0, 3),
    risks: [gap],
    costUsd: 0.01,
  })
}
