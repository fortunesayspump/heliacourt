import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildRecordBrief, formatList, makeArtifact, summarizeVerdictPosture } from '../../courtroom-record'

export function runDikastMomentum(context: AgentContext): CourtArtifact {
  const brief = buildRecordBrief(context)
  const posture = summarizeVerdictPosture(brief)
  const facts = [...brief.admittedFacts, ...brief.witnessFacts]

  return makeArtifact(context, {
    agentId: 'dikast-momentum',
    type: 'jury-vote',
    summary: `Votes for ${posture.label} from a fresh-signal lens.`,
    transcriptMessage: `My vote from the fresh-signal lens: ${posture.label}. I rely on: ${formatList(facts, 'no admitted signal', 3)} Reservation: ${brief.gaps[0] ?? 'the signal may not survive the case horizon'}.`,
    confidence: posture.confidence,
    claims: facts.slice(0, 3),
    risks: [brief.gaps[0] ?? 'Fresh signals can reverse before resolution.'],
    costUsd: 0.01,
  })
}
