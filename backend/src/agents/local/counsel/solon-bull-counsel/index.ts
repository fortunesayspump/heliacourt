import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildRecordBrief, compactRecordItems, issueFromInstruction, makeArtifact } from '../../courtroom-record'

export function runBullCounsel(context: AgentContext): CourtArtifact {
  const brief = buildRecordBrief(context)
  const issue = issueFromInstruction(context)
  const facts = compactRecordItems([...brief.admittedFacts, ...brief.witnessFacts, ...brief.primaryFacts], 3)
  const support = facts[0] ?? 'no admitted Yes driver yet'
  const gap = brief.gaps[0] ?? 'the court still needs a clearer bridge from admitted clues to a Yes forecast'
  const isQuestion = context.courtPhase === 'direct' || context.courtPhase === 'redirect'
  const scraperRequest = getScraperRequest(context)
  const message = isQuestion
    ? `Witness, give me the strongest Yes mechanism in plain terms: what fact makes a U.S. case by the deadline more plausible? Then name the missing step Draco can still attack.`
    : `The Yes case is narrow: ${support}. Draco wins if the missing step is fatal, but if it only caps confidence, this stays a live tail-risk case rather than a clean No.`

  return makeArtifact(context, {
    agentId: 'bull-counsel',
    type: 'argument',
    summary: `Affirmative forecast on ${issue}: bring Yes drivers, attack No blockers, and keep the verdict calibrated.`,
    transcriptMessage: message,
    confidence: facts.length ? 0.62 : 0.42,
    claims: facts,
    risks: [gap],
    requestedAgentId: scraperRequest ? 'web-scraper-witness' : undefined,
    request: scraperRequest,
    costUsd: 0.05,
  })
}

function getScraperRequest(context: AgentContext) {
  if (!/https?:\/\//i.test(context.marketCase.context ?? '')) return undefined
  if (context.artifacts.some((artifact) => artifact.agentId === 'web-scraper-witness')) return undefined
  if (!/(source|official|credible|resolution|context|website|url|fifa)/i.test(context.courtInstruction ?? '')) return undefined

  return `Aletheia, scrape the cited case-context URL(s), extract exact source text, dates, and source identity, and state whether the page text supports a Yes driver, No blocker, timing constraint, or source-quality limit.`
}
