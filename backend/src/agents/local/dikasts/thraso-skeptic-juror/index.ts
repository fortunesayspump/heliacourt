import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildRecordBrief, formatList, makeArtifact } from '../../courtroom-record'

export function runDikastSkeptic(context: AgentContext): CourtArtifact {
  const brief = buildRecordBrief(context)
  const facts = [...brief.admittedFacts, ...brief.witnessFacts]
  const gap = brief.gaps[0] ?? 'the record does not close every required inference'

  return makeArtifact(context, {
    agentId: 'dikast-skeptic',
    type: 'jury-vote',
    summary: 'Votes for no-edge or watchlist unless the direct evidentiary bridge is proven.',
    transcriptMessage: `My skeptical vote: no-edge or watchlist. The record contains: ${formatList(facts, 'no admitted merits fact', 3)} My reservation is decisive: ${gap}.`,
    confidence: 0.61,
    claims: [gap, ...facts.slice(0, 2)],
    risks: ['The court should punish any argument that outruns admitted evidence.'],
    costUsd: 0.01,
  })
}
