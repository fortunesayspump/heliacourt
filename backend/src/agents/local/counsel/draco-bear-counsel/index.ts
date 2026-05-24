import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildRecordBrief, compactRecordItems, issueFromInstruction, makeArtifact } from '../../courtroom-record'

export function runBearCounsel(context: AgentContext): CourtArtifact {
  const brief = buildRecordBrief(context)
  const issue = issueFromInstruction(context)
  const facts = compactRecordItems([...brief.admittedFacts, ...brief.witnessFacts, ...brief.primaryFacts], 3)
  const gap = brief.gaps[0] ?? 'the record lacks a strong bridge from admitted clues to the claimed forecast'
  const yesDriver = brief.affirmativeArguments.at(-1)?.claims?.[0] ?? facts[0] ?? 'the affirmative has not identified a concrete admitted Yes driver yet'
  const scraperRequest = getScraperRequest(context)
  const message =
    context.courtPhase === 'cross'
      ? `Witness, cut through the theory: what exact fact gets this from a related Ebola signal to a confirmed case inside U.S. territory by June 30? If that fact is missing, say so.`
      : `No turns on the missing bridge: ${gap}. Solon's best point is ${yesDriver}, but it has to cross the U.S.-territory and deadline rules before it deserves more than tail-risk weight.`

  return makeArtifact(context, {
    agentId: 'bear-counsel',
    type: 'argument',
    summary: `Negative forecast on ${issue}: bring No blockers, attack Yes drivers, and cap confidence.`,
    transcriptMessage: message,
    confidence: 0.6,
    claims: [gap, ...facts.slice(0, 2)],
    risks: ['A strong forecast would overread the admitted record.'],
    requestedAgentId: scraperRequest ? 'web-scraper-witness' : undefined,
    request: scraperRequest,
    costUsd: 0.05,
  })
}

function getScraperRequest(context: AgentContext) {
  if (!/https?:\/\//i.test(context.marketCase.context ?? '')) return undefined
  if (context.artifacts.some((artifact) => artifact.agentId === 'web-scraper-witness')) return undefined
  if (!/(source|official|credible|resolution|context|website|url|fifa|cross)/i.test(context.courtInstruction ?? '')) return undefined

  return `Aletheia, scrape the cited case-context URL(s), identify the exact text counsel is relying on, and state what forecast inference should be struck or downweighted because the page does not support it.`
}
