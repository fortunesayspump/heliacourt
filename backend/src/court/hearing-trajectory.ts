import type { CourtArtifact, CourtTranscriptTurn, MarketCase, ToolEvidence } from './types'
import type { CourtProcedureStep } from './group-chat'

export type TrajectoryIssueSeverity = 'critical' | 'high' | 'medium'

export type TrajectoryIssue = {
  id: string
  severity: TrajectoryIssueSeverity
  summary: string
  evidence: string[]
  suggestedAgentId: string
  suggestedRequest: string
}

export type TrajectoryEvaluation = {
  score: number
  issues: TrajectoryIssue[]
}

const terminalPattern = /\b(record is exhausted|both sides? (?:rest|concede|have conceded)|ready to issue the verdict|I will now issue the verdict|move to verdict|cannot proceed substantively|no further evidence)\b/i
const missingDataPattern = /\b(no data|zero polling|lacks? data|cannot confirm|unconfirmed|not found|missing|gap remains|timed out|generic homepage|dead end|no content retrieved|no specific articles|empty results|no direct polling|no candidate names)\b/i

export function evaluateHearingTrajectory(params: {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript: CourtTranscriptTurn[]
  lastArtifact?: CourtArtifact
  parentStep?: CourtProcedureStep
}): TrajectoryEvaluation {
  const { marketCase, artifacts, transcript, lastArtifact, parentStep } = params
  const caseText = normalize(`${marketCase.question} ${marketCase.context ?? ''} ${(marketCase.links ?? []).join(' ')}`)
  const recentArtifacts = artifacts.slice(-12)
  const recentText = normalize(recentArtifacts.map(artifactText).join(' '))
  const allText = normalize(artifacts.map(artifactText).join(' '))
  const toolEvidence = artifacts.flatMap((artifact) => artifact.toolEvidence ?? [])
  const issues: TrajectoryIssue[] = []

  const add = (issue: TrajectoryIssue) => {
    if (!issues.some((existing) => existing.id === issue.id)) issues.push(issue)
  }

  if (hasAcronymContextDrift(caseText, toolEvidence, recentText)) {
    add({
      id: 'acronym-context-drift',
      severity: 'critical',
      summary: 'Search/scrape drifted onto an off-context meaning of an ambiguous term.',
      evidence: compactEvidence([
        'Case context uses PLA in a China/Taiwan setting, but scrape/search evidence returned plastic/filament pages.',
        ...matchingEvidence(toolEvidence, /\bfilament|bioplastic|thermoplastic|3d[- ]?print|polylactic acid\b/i),
      ]),
      suggestedAgentId: 'sophia-research-witness',
      suggestedRequest: 'Reset the research context before continuing: disambiguate PLA as the People\'s Liberation Army in the China/Taiwan context, then branch into targeted searches for PLA Eastern Theater Command activity, Taiwan ADIZ/incursion data, blockade/amphibious drills, official PRC/Taiwan/US statements, and credible OSINT/source pages. Ignore plastic/filament results as off-context noise.',
    })
  }

  if (needsMarketRecovery(caseText, recentText, toolEvidence)) {
    add({
      id: 'market-recovery-before-moot',
      severity: 'high',
      summary: 'The hearing treated a missing market/API result as substantive without exhausting market recovery.',
      evidence: compactEvidence([
        'Transcript mentions a 404, invalid market, or no API match.',
        ...matchingEvidence(toolEvidence, /\b404|not found|no active market|no market|archive|cache\b/i),
      ]),
      suggestedAgentId: 'pythia-prediction-witness',
      suggestedRequest: 'Recover the market before treating it as moot: try direct market slug and event slug variants, platform API search, title search, sibling outcomes, archive/cache evidence, and nearby Manifold/Kalshi/Polymarket markets. Report whether the filed link is a dead exact contract, a renamed single market, or an event page with child outcomes, plus odds/liquidity/freshness where available.',
    })
  }

  if (needsCalendarAnchor(caseText, recentText, toolEvidence)) {
    add({
      id: 'calendar-anchor-gap',
      severity: 'critical',
      summary: 'The hearing is proceeding with an unanchored date/deadline that should be discoverable.',
      evidence: compactEvidence([
        'Recent turns say a key date or schedule is unconfirmed.',
        ...matchingEvidence(toolEvidence, /\bcalendar|date|deadline|closeTime|election|meeting|schedule|fomc|tse\b/i),
      ]),
      suggestedAgentId: 'notus-weather-data-witness',
      suggestedRequest: 'Anchor the timeline with structured and official sources before any verdict: find the exact event date, market close/deadline, official calendar source, days remaining, and any reporting lag. For elections use electoral authority pages and market APIs; for FOMC/macro use the Federal Reserve calendar; for sports use official schedule/standings APIs. Do not stop at "typically" or "unconfirmed dates."',
    })
  }

  if (needsElectionDataBridge(caseText, recentText)) {
    add({
      id: 'election-data-bridge',
      severity: 'critical',
      summary: 'Election forecast lacks the concrete candidate/polling/reference-class bridge the market requires.',
      evidence: compactEvidence([
        'Recent turns say polling/candidate data is absent while the case turns on vote share or nomination viability.',
        recentText.match(/(?:zero|no) polling[^.]{0,180}/i)?.[0],
        recentText.match(/candidate names?[^.]{0,180}/i)?.[0],
      ]),
      suggestedAgentId: 'sophia-research-witness',
      suggestedRequest: 'Build the election data bridge in context: identify declared/likely candidates, ballot/party constraints, official election calendar, current polling from local pollsters or aggregators, and prior comparable vote shares. For Brazil, search Portuguese and named sources such as Datafolha, Quaest, Ipec, PoderData, AtlasIntel, CNN Brasil, Poder360, TSE, and candidate/party pages; then say who counts under the market definition and whether any candidate is plausibly near the threshold.',
    })
  }

  if (needsTimeoutStrategyChange(recentText, toolEvidence)) {
    add({
      id: 'tool-failure-strategy-change',
      severity: 'high',
      summary: 'A tool failure repeated without a changed retrieval strategy.',
      evidence: compactEvidence([
        ...matchingEvidence(toolEvidence, /\btimed out|timeout|no content retrieved|dead end|blocked access|generic landing page\b/i),
        recentText.match(/timed out[^.]{0,180}/i)?.[0],
      ]),
      suggestedAgentId: 'web-scraper-witness',
      suggestedRequest: 'Do not retry the same timed-out page again. Change retrieval strategy: use the direct PDF/file extractor if it is a file, static endpoint before browser, archive/cache, source API, text-only mirrors, search snippets, or a narrower official page. Report exactly which fallback worked or why each fallback failed.',
    })
  }

  if (needsQuantProxy(caseText, recentText)) {
    add({
      id: 'proxy-before-no-data',
      severity: 'high',
      summary: 'The hearing says exact data is missing before constructing a defensible proxy/reference class.',
      evidence: compactEvidence([
        recentText.match(/no data[^.]{0,180}/i)?.[0],
        recentText.match(/lacks? data[^.]{0,180}/i)?.[0],
        recentText.match(/reference class[^.]{0,180}/i)?.[0],
      ]),
      suggestedAgentId: 'numeros-quant-witness',
      suggestedRequest: 'Build a bounded estimate instead of stopping at missing exact data: use market odds with liquidity/freshness, sibling markets, historical analogs, update cadence, current distance to threshold, and scenario branches. State the proxy, the range it supports, and what evidence would move it.',
    })
  }

  if (isPrematureClosure(recentText, parentStep, lastArtifact)) {
    add({
      id: 'premature-closure',
      severity: 'critical',
      summary: 'The court is moving to closure while high-value research gaps remain unresolved.',
      evidence: compactEvidence([
        recentText.match(terminalPattern)?.[0],
        recentText.match(missingDataPattern)?.[0],
      ]),
      suggestedAgentId: 'head-judge',
      suggestedRequest: 'Pause closure. Identify the single live gap that matters most, route exactly one witness or require counsel to construct a bounded proxy, and only then allow closing/verdict. Do not treat "not found yet" as a final forecast reason while the event horizon remains open.',
    })
  }

  const sortedIssues = issues.sort((left, right) => severityRank(right.severity) - severityRank(left.severity)).slice(0, 6)
  const penalty = sortedIssues.reduce((sum, issue) => sum + (issue.severity === 'critical' ? 24 : issue.severity === 'high' ? 16 : 8), 0)

  return {
    score: Math.max(0, Math.min(100, 100 - penalty)),
    issues: sortedIssues,
  }
}

export function recommendedTrajectoryMove(evaluation: TrajectoryEvaluation): { agentId: string; request: string; issue: string } | undefined {
  const issue = evaluation.issues.find((item) => item.severity === 'critical') ?? evaluation.issues.find((item) => item.severity === 'high')
  if (!issue) return undefined

  return {
    agentId: issue.suggestedAgentId,
    request: issue.suggestedRequest,
    issue: issue.summary,
  }
}

export function summarizeTrajectoryEvaluation(evaluation: TrajectoryEvaluation) {
  if (!evaluation.issues.length) return { score: evaluation.score, issues: [] }

  return {
    score: evaluation.score,
    issues: evaluation.issues.map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      summary: issue.summary,
      suggestedAgentId: issue.suggestedAgentId,
      suggestedRequest: issue.suggestedRequest,
      evidence: issue.evidence.slice(0, 3),
    })),
  }
}

function needsMarketRecovery(caseText: string, recentText: string, toolEvidence: ToolEvidence[]) {
  const asksMarket = /\b(polymarket|manifold|kalshi|prediction market|odds|market)\b/i.test(caseText)
  const missingMarket = /\b(404|no active market|no api match|invalid market|missing market|no market|never existed|moot)\b/i.test(recentText)
  const hasMarketEvidence = toolEvidence.some((evidence) => evidence.capability === 'prediction_market_data' && evidence.status === 'ok')

  return asksMarket && missingMarket && !hasMarketEvidence
}

function needsCalendarAnchor(caseText: string, recentText: string, toolEvidence: ToolEvidence[]) {
  const asksDate = /\b(election|deadline|date|calendar|meeting|fomc|minutes|schedule|primary|nomination|close|by |before|end of)\b/i.test(caseText)
  const admitsGap = /\b(unconfirmed|cannot confirm|no confirmed dates|typically|likely aligns|deadline unknown|date remains|still unconfirmed)\b/i.test(recentText)
  if (!asksDate || !admitsGap) return false

  const hasOfficialCalendar = toolEvidence.some((evidence) =>
    evidence.capability === 'calendar_data'
    && evidence.status === 'ok'
    && /\b(official|tse|federal reserve|fomc|calendar|closeTime|election date|first round|deadline)\b/i.test(`${evidence.observations.join(' ')} ${evidence.sources.map((source) => `${source.title} ${source.url ?? ''} ${source.value ?? ''}`).join(' ')}`),
  )

  return !hasOfficialCalendar
}

function needsElectionDataBridge(caseText: string, recentText: string) {
  return /\b(election|nomination|candidate|vote|poll|primary|first[- ]round)\b/i.test(caseText)
    && /\b(no polling|zero polling|no candidate names|candidate data|polling data is absent|without polling|no donor|no draft movement)\b/i.test(recentText)
}

function needsTimeoutStrategyChange(recentText: string, toolEvidence: ToolEvidence[]) {
  const timeoutMentions = countMatches(recentText, /\btimed out|timeout|no content retrieved|dead end|blocked access|generic landing page\b/gi)
  const toolFailures = toolEvidence.filter((evidence) =>
    evidence.status === 'error'
    || evidence.status === 'skipped'
    || /\btimed out|timeout|blocked access|generic landing page|no content retrieved\b/i.test(`${evidence.error ?? ''} ${evidence.observations.join(' ')}`),
  ).length

  return timeoutMentions >= 1 || toolFailures >= 2
}

function needsQuantProxy(caseText: string, recentText: string) {
  return /\b(probability|forecast|odds|market|price|threshold|poll|vote share|rank|leaderboard|elo|rate|base rate|reference class)\b/i.test(caseText)
    && /\b(no data|lacks? data|no historical|no reference class|main weakness: no data|cannot quantify|pulled from thin air)\b/i.test(recentText)
}

function isPrematureClosure(recentText: string, parentStep?: CourtProcedureStep, lastArtifact?: CourtArtifact) {
  const closurePhase = parentStep && ['closing', 'risk-instruction', 'calibration', 'verdict'].includes(parentStep.phase)
  const closureText = terminalPattern.test(recentText) || terminalPattern.test(artifactText(lastArtifact))
  const unresolvedGap = missingDataPattern.test(recentText)

  return Boolean((closurePhase || closureText) && unresolvedGap)
}

function hasAcronymContextDrift(caseText: string, toolEvidence: ToolEvidence[], recentText: string) {
  if (!/\b(china|taiwan|beijing|pla|people'?s liberation army)\b/i.test(caseText)) return false

  return /\bfilament|bioplastic|thermoplastic|polylactic acid|3d[- ]?print\b/i.test(recentText)
    || toolEvidence.some((evidence) => /\bfilament|bioplastic|thermoplastic|polylactic acid|3d[- ]?print\b/i.test(`${evidence.observations.join(' ')} ${evidence.sources.map((source) => `${source.title} ${source.value ?? ''}`).join(' ')}`))
}

function artifactText(artifact?: CourtArtifact) {
  if (!artifact) return ''
  return [
    artifact.agentId,
    artifact.summary,
    artifact.transcriptMessage,
    artifact.request,
    ...(artifact.claims ?? []),
    ...(artifact.risks ?? []),
    ...(artifact.notes ?? []),
  ].filter(Boolean).join(' ')
}

function matchingEvidence(toolEvidence: ToolEvidence[], pattern: RegExp) {
  return toolEvidence.flatMap((evidence) => {
    const haystack = `${evidence.capability} ${evidence.provider} ${evidence.query} ${evidence.error ?? ''} ${evidence.observations.join(' ')} ${evidence.sources.map((source) => `${source.title} ${source.url ?? ''} ${source.value ?? ''}`).join(' ')}`
    if (!pattern.test(haystack)) return []
    return compact(`${evidence.capability}/${evidence.status}: ${evidence.observations[0] ?? evidence.error ?? evidence.query}`, 260)
  }).slice(-4)
}

function compactEvidence(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => compact(value, 280))
    .slice(0, 5)
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function compact(value: string, maxLength: number) {
  const text = normalize(value)
  if (text.length <= maxLength) return text

  return `${text.slice(0, maxLength - 3).trimEnd()}...`
}

function countMatches(value: string, pattern: RegExp) {
  return Array.from(value.matchAll(pattern)).length
}

function severityRank(severity: TrajectoryIssueSeverity) {
  if (severity === 'critical') return 3
  if (severity === 'high') return 2

  return 1
}
