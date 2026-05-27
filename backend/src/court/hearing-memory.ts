import type { AgentContext, CourtArtifact, EvidenceScore } from './types'
import { buildCourtClock, describeCourtClock } from './court-time'
import { buildClaimMap, type ClaimMap } from './claim-map'

export type HearingMemory = {
  proceduralPosture: string
  courtClock: string
  agendaFocus: string[]
  uncoveredAgendaItems: string[]
  testifiedAgents: string[]
  strongestYes: EvidenceScore[]
  strongestNo: EvidenceScore[]
  strongestDirect: EvidenceScore[]
  timingIssues: EvidenceScore[]
  sourceIssues: EvidenceScore[]
  missingBridges: EvidenceScore[]
  highSignalFocus: string[]
  ledgerFocus: string[]
  testimonyFocus: string[]
  argumentGraph: string[]
  argumentQualityFocus: string[]
  staleArgumentShapes: string[]
  progressionState: {
    lastUsefulAdvances: string[]
    exhaustedPoints: string[]
    unresolvedQuestions: string[]
    neededMove: string
  }
  claimMap: ClaimMap
  counselState: {
    solonLatest?: string
    dracoLatest?: string
    unresolvedContest?: string
  }
  nextUsefulQuestions: string[]
}

export function buildHearingMemory(context: AgentContext): HearingMemory {
  const artifacts = context.artifacts ?? []
  const scores = artifacts.flatMap((artifact) => artifact.evidenceScores ?? [])
  const strongestYes = topScores(scores.filter((score) => score.polarity === 'yes'))
  const strongestNo = topScores(scores.filter((score) => score.polarity === 'no'))
  const strongestDirect = topScores(scores.filter((score) => score.tag === 'direct-proof'))
  const timingIssues = topScores(scores.filter((score) => score.tag === 'timing'), 3)
  const sourceIssues = topScores(scores.filter((score) => score.tag === 'source-quality'), 3)
  const missingBridges = topScores(scores.filter((score) => score.tag === 'missing'), 4)
  const highSignalFocus = buildHighSignalFocus(scores)
  const solonLatest = latestMessage(artifacts, 'bull-counsel')
  const dracoLatest = latestMessage(artifacts, 'bear-counsel')
  const ledgerFocus = buildLedgerFocus(context)
  const agendaFocus = buildAgendaFocus(context)
  const uncoveredAgendaItems = buildUncoveredAgendaItems(context)
  const testimonyFocus = buildTestimonyFocus(context)
  const argumentGraph = buildArgumentGraph(context)
  const argumentQualityFocus = buildArgumentQualityFocus(context)
  const staleArgumentShapes = buildStaleArgumentShapes(context)
  const progressionState = buildProgressionState(context)
  const claimMap = buildClaimMap(context)

  return {
    proceduralPosture: describePosture(context),
    courtClock: describeCourtClock(buildCourtClock(context.marketCase)),
    agendaFocus,
    uncoveredAgendaItems,
    testifiedAgents: Array.from(new Set(artifacts.filter((artifact) => artifact.type === 'witness-testimony').map((artifact) => artifact.agentId))),
    strongestYes,
    strongestNo,
    strongestDirect,
    timingIssues,
    sourceIssues,
    missingBridges,
    highSignalFocus,
    ledgerFocus,
    testimonyFocus,
    argumentGraph,
    argumentQualityFocus,
    staleArgumentShapes,
    progressionState,
    claimMap,
    counselState: {
      solonLatest,
      dracoLatest,
      unresolvedContest: claimMap.centralClash || buildContestSummary(strongestYes, strongestNo, missingBridges),
    },
    nextUsefulQuestions: buildNextUsefulQuestions({
      strongestYes,
      strongestNo,
      strongestDirect,
      timingIssues,
      sourceIssues,
      missingBridges,
      phase: context.courtPhase,
    }),
  }
}

function buildProgressionState(context: AgentContext): HearingMemory['progressionState'] {
  const artifacts = context.artifacts ?? []
  const recent = artifacts.slice(-10)
  const advances = recent
    .map((artifact) => classifyProgressionMove(artifact))
    .filter((advance): advance is string => Boolean(advance))
    .slice(-6)
  const exhaustedPoints = buildStaleArgumentShapes(context).slice(0, 4)
  const unresolvedQuestions = [
    ...recent.flatMap((artifact) => artifact.testimony?.nextQuestion ? [artifact.testimony.nextQuestion] : []),
    ...recent.flatMap((artifact) => artifact.requestedAgentId && artifact.request ? [`${artifact.requestedAgentId}: ${artifact.request}`] : []),
    ...buildArgumentQualityFocus(context).slice(-3).map((warning) => `Repair: ${warning}`),
  ]
    .map((item) => compact(item, 180))
    .filter((item): item is string => Boolean(item))
    .slice(-5)
  const neededMove = chooseNeededMove(context, advances, unresolvedQuestions, exhaustedPoints)

  return {
    lastUsefulAdvances: advances.length ? advances : ['No useful advance has been made yet. Start by getting direct evidence or the strongest forecast pathway.'],
    exhaustedPoints,
    unresolvedQuestions,
    neededMove,
  }
}

function classifyProgressionMove(artifact: CourtArtifact) {
  const text = `${artifact.summary} ${artifact.transcriptMessage ?? ''}`.replace(/\s+/g, ' ').trim()
  if (!text) return undefined

  const prefix = `${artifact.agentId}:`

  if (artifact.testimony?.finding) {
    return `${prefix} testified ${artifact.testimony.supports}/${artifact.testimony.forecastWeight}: ${compact(artifact.testimony.finding, 170)}`
  }

  const scores = artifact.evidenceScores ?? []
  const highScore = scores.find((score) => score.weight >= 0.5 && score.tag !== 'background')
  if (highScore) {
    return `${prefix} added ${highScore.tag}/${highScore.polarity}: ${compact(highScore.text, 170)}`
  }

  const argument = artifact.argumentNodes?.[0]
  if (argument) {
    return `${prefix} argued ${argument.side}: ${compact(argument.claim, 150)}`
  }

  if (/\b(admitted|limited|excluded|struck|ruling|verdict|confidence cap|probability range)\b/i.test(text)) {
    return `${prefix} narrowed the record: ${compact(text, 170)}`
  }

  if (/\?/.test(text)) {
    return `${prefix} asked: ${compact(text, 170)}`
  }

  return undefined
}

function chooseNeededMove(
  context: AgentContext,
  advances: string[],
  unresolvedQuestions: string[],
  exhaustedPoints: string[],
) {
  const phase = context.courtPhase ?? ''
  const recentText = context.artifacts.slice(-5).map((artifact) => `${artifact.summary} ${artifact.transcriptMessage ?? ''}`).join(' ')
  const uncoveredAgendaItems = buildUncoveredAgendaItems(context)

  if (exhaustedPoints.length && /closing|admission|verdict/.test(phase)) {
    return 'Use memory to avoid circling. Convert familiar points into a ruling, confidence cap, or concession.'
  }

  if (uncoveredAgendaItems.length && !/closing|verdict|settlement/.test(phase)) {
    return `Cover the next agenda gap with a targeted witness/tool check: ${uncoveredAgendaItems[0]}`
  }

  if (unresolvedQuestions.length && !/closing|verdict|settlement/.test(phase)) {
    return `Answer or route the live unresolved question with a new data check or mechanism: ${unresolvedQuestions.at(-1)}`
  }

  if (/\b(missing|gap|unknown|unresolved|cannot prove|no evidence)\b/i.test(recentText)) {
    return 'Close the missing bridge with a specific witness/tool call, proxy/reference class, bounded estimate, failure mode, or only then a confidence cap.'
  }

  if (/\b(market|odds|price|probability)\b/i.test(recentText) && !/\b(liquidity|spread|depth|copy|fade|overprice|underprice)\b/i.test(recentText)) {
    return 'Stress-test market price against liquidity, depth, freshness, and non-market evidence instead of just repeating the odds.'
  }

  if (!advances.length) {
    return 'Produce the first useful advance: direct evidence, catalyst, blocker, timing bridge, or source limit.'
  }

  return 'Use the next turn to advance the case: fresh data, mechanism, failure mode, source distinction, number/range, direct rebuttal, concession, useful handoff, or ruling.'
}

function buildLedgerFocus(context: AgentContext) {
  const ledger = context.evidenceLedger ?? context.artifacts.flatMap((artifact) => artifact.evidenceItems ?? [])
  return ledger
    .slice(-8)
    .map((item) => `${item.id} ${item.supports}/${item.directness}/${item.reliability}: ${compact(item.claim, 150)}`)
}

function buildAgendaFocus(context: AgentContext) {
  const agenda = context.evidenceAgenda
  if (!agenda) return []

  return [
    `Rule: ${compact(agenda.resolutionRule, 220)}`,
    `Clock: ${agenda.courtClock}`,
    ...agenda.requiredFacts.slice(0, 8).map((item) =>
      `${item.id}: ${item.label} | witnesses=${item.preferredWitnesses.slice(0, 3).join(',')}`,
    ),
  ]
}

function buildUncoveredAgendaItems(context: AgentContext) {
  const agenda = context.evidenceAgenda
  if (!agenda) return []
  const text = [
    ...(context.artifacts ?? []).flatMap((artifact) => [
      artifact.summary,
      artifact.transcriptMessage,
      ...(artifact.claims ?? []),
      ...(artifact.risks ?? []),
      artifact.testimony?.finding,
      ...(artifact.evidenceItems ?? []).map((item) => item.claim),
    ]),
  ].filter(Boolean).join(' ').toLowerCase()

  return agenda.requiredFacts
    .filter((item) => !agendaItemLooksCovered(item, text))
    .slice(0, 5)
    .map((item) => `${item.id}: ${item.label} via ${item.preferredWitnesses.slice(0, 2).join(' or ')}`)
}

function agendaItemLooksCovered(item: { id: string; label: string }, text: string) {
  const idTokens = item.id.split('-').filter((token) => token.length > 3)
  const labelTokens = item.label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4)
  const tokens = Array.from(new Set([...idTokens, ...labelTokens])).slice(0, 8)
  const hits = tokens.filter((token) => text.includes(token)).length

  return hits >= Math.min(2, tokens.length)
}

function buildHighSignalFocus(scores: EvidenceScore[]) {
  return scores
    .filter((score) =>
      score.weight >= 0.35
      && (score.tag === 'yes-catalyst'
        || score.tag === 'no-blocker'
        || score.tag === 'direct-proof'
        || score.tag === 'timing'
        || score.tag === 'source-quality'),
    )
    .slice(-10)
    .map((score) =>
      `${score.polarity}/${score.tag}/w=${score.weight.toFixed(2)}: ${compact(score.text, 180)}`,
    )
}

function buildTestimonyFocus(context: AgentContext) {
  return context.artifacts
    .flatMap((artifact) => artifact.testimony ? [{ agentId: artifact.agentId, testimony: artifact.testimony }] : [])
    .slice(-8)
    .map(({ agentId, testimony }) =>
      `${agentId}: ${testimony.supports}/${testimony.forecastWeight} using ${testimony.evidenceIds.join(',') || 'no evidence id'}: ${compact(testimony.finding, 150)} Limits: ${compact(testimony.limits.join('; '), 140)}`,
    )
}

function buildArgumentGraph(context: AgentContext) {
  return context.artifacts
    .flatMap((artifact) =>
      (artifact.argumentNodes ?? []).map((node) =>
        `${artifact.agentId}:${node.id} ${node.side} c=${node.confidence.toFixed(2)} evidence=${node.evidenceIds.join(',') || 'none'} claim=${compact(node.claim, 130)} warrant=${compact(node.warrant, 150)} attacks=${compact(node.attacks.join('; '), 120)}`,
      ),
    )
    .slice(-10)
}

function buildArgumentQualityFocus(context: AgentContext) {
  return context.artifacts
    .flatMap((artifact) =>
      (artifact.argumentQuality ?? []).map((warning) =>
        `${artifact.agentId}:${warning.nodeId} ${warning.severity}/${warning.issue}: ${compact(warning.message, 120)} Repair: ${compact(warning.repairPrompt, 150)}`,
      ),
    )
    .slice(-8)
}

function buildStaleArgumentShapes(context: AgentContext) {
  const counts = new Map<string, { count: number; latest: string }>()

  for (const artifact of context.artifacts) {
    for (const node of artifact.argumentNodes ?? []) {
      const key = argumentShapeKey(`${node.claim} ${node.warrant}`)
      if (!key) continue
      const current = counts.get(key)
      counts.set(key, {
        count: (current?.count ?? 0) + 1,
        latest: `${node.side}: ${compact(node.claim, 140)} / ${compact(node.warrant, 150)}`,
      })
    }
  }

  return Array.from(counts.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((item) => `repeated x${item.count}: ${item.latest}`)
}

function describePosture(context: AgentContext) {
  const phase = context.courtPhase ?? 'unassigned'
  const turnCount = context.transcript?.length ?? 0
  const witnessCount = context.artifacts.filter((artifact) => artifact.type === 'witness-testimony').length
  const argumentCount = context.artifacts.filter((artifact) => artifact.type === 'argument').length

  return `${phase}: ${turnCount} transcript turns, ${witnessCount} witness testimonies, ${argumentCount} counsel arguments. Preserve normal court order; use discretion only for focused clarification.`
}

function latestMessage(artifacts: CourtArtifact[], agentId: string) {
  const artifact = artifacts.filter((item) => item.agentId === agentId).at(-1)
  if (!artifact) return undefined

  return compact(artifact.transcriptMessage ?? artifact.summary, 280)
}

function buildContestSummary(yesScores: EvidenceScore[], noScores: EvidenceScore[], missingScores: EvidenceScore[]) {
  const yes = yesScores[0]?.text
  const no = noScores[0]?.text
  const gap = missingScores[0]?.text

  if (!yes && !no && !gap) return 'No structured contest has formed yet.'

  return [
    yes ? `Best Yes: ${compact(yes, 180)}` : undefined,
    no ? `Best No: ${compact(no, 180)}` : undefined,
    gap ? `Open gap: ${compact(gap, 180)}` : undefined,
  ].filter(Boolean).join(' | ')
}

function buildNextUsefulQuestions(params: {
  strongestYes: EvidenceScore[]
  strongestNo: EvidenceScore[]
  strongestDirect: EvidenceScore[]
  timingIssues: EvidenceScore[]
  sourceIssues: EvidenceScore[]
  missingBridges: EvidenceScore[]
  phase?: string
}) {
  const questions: string[] = []

  if (!params.strongestDirect.length) {
    questions.push('What source, if any, directly matches the market resolution wording rather than adjacent background?')
  }

  if (params.strongestYes.length && params.strongestNo.length) {
    questions.push('Which side has the stronger probability bridge: the Yes catalyst or the No blocker?')
  }

  if (params.strongestYes.length || params.strongestNo.length) {
    questions.push('What mechanism, timeline, failure mode, reference class, or source gap would most change the current probability range?')
  }

  if (params.timingIssues.length) {
    questions.push('Does the timing evidence land inside the market window, or only near it?')
  }

  if (params.sourceIssues.length) {
    questions.push('Is the best source official/direct enough to carry forecast weight?')
  }

  if (params.missingBridges.length) {
    questions.push('Can a witness/tool, proxy/reference class, or bounded estimate close the missing bridge before it merely caps confidence?')
  }

  questions.push('Which claim in hearingMemory.claimMap is the central clash, and has it been supported, limited, or struck?')
  questions.push('Which prior argument warning must be repaired before this point can carry verdict weight?')

  if (params.phase === 'closing') {
    questions.push('Which admitted facts should closing counsel be allowed to rely on, and which inferences should be struck?')
  }

  return questions.slice(0, 5)
}

function topScores(scores: EvidenceScore[], max = 4) {
  return scores
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
    .map((score) => ({
      ...score,
      text: compact(score.text, 220),
    }))
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, ' ').trim()

  if (text.length <= maxLength) return text

  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

function argumentShapeKey(value: string) {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 4 && !shapeStopWords.has(token))
    .slice(0, 16)

  if (tokens.length < 4) return ''

  return Array.from(new Set(tokens)).sort().join(' ')
}

const shapeStopWords = new Set([
  'about',
  'after',
  'before',
  'being',
  'case',
  'cases',
  'claim',
  'claims',
  'confirmed',
  'court',
  'evidence',
  'forecast',
  'likelihood',
  'market',
  'probability',
  'reported',
  'resolution',
  'source',
  'sources',
  'strongly',
  'supports',
])
