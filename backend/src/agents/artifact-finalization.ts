import type { AgentContext, ArgumentNode, ArgumentQualityWarning, CourtArtifact } from '../court/types'
import { scoreArtifactEvidenceWithAi } from '../court/evidence-scoring'
import { normalizeToolEvidenceToLedgerItems } from '../court/evidence-ledger'
import { applyRecordGuard } from '../court/record-guard'

export async function finalizeArtifact(artifact: CourtArtifact, context: AgentContext) {
  sanitizeArtifactText(artifact)
  const evidenceItems = normalizeToolEvidenceToLedgerItems({
    marketCase: context.marketCase,
    toolEvidence: context.toolEvidence ?? [],
    agentId: artifact.agentId,
  })
  const scoredArtifact = {
    ...artifact,
    evidenceItems: evidenceItems.length ? evidenceItems : artifact.evidenceItems,
    argumentQuality: evaluateArgumentQuality(artifact, context.artifacts),
    evidenceScores: await scoreArtifactEvidenceWithAi(artifact),
  }
  const examinationWarning = evaluateCounselExamination(scoredArtifact, context)
  if (examinationWarning) {
    scoredArtifact.notes = [...(scoredArtifact.notes ?? []), examinationWarning]
    scoredArtifact.risks = [...(scoredArtifact.risks ?? []), examinationWarning]
  }

  applyReasoningDiscipline(scoredArtifact, context)
  sanitizeArtifactText(scoredArtifact)

  const guardedArtifact = applyRecordGuard(scoredArtifact, context)
  sanitizeArtifactText(guardedArtifact)
  return guardedArtifact
}

function sanitizeArtifactText(artifact: CourtArtifact) {
  artifact.claims = cleanArtifactList(artifact.claims)
  artifact.risks = cleanArtifactList(artifact.risks, artifact.type === 'verdict')
  artifact.notes = cleanArtifactList(artifact.notes)
}

function cleanArtifactList(values: string[] | undefined, verdict = false) {
  return values
    ?.map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((value) => !isPlannerMetadata(value))
    .filter((value) => !(verdict && /turn appears to repeat|low-novelty/i.test(value)))
    .slice(0, 8)
}

function isPlannerMetadata(value: string) {
  return /^(search plan|planner relevance|deterministic fallback search plan|supporting context|fallback context):/i.test(value.trim())
}

function applyReasoningDiscipline(artifact: CourtArtifact, context: AgentContext) {
  const bridgeWarnings = evaluateResolutionBridge(artifact, context)
  if (bridgeWarnings.length) {
    artifact.argumentQuality = [...(artifact.argumentQuality ?? []), ...bridgeWarnings]
    artifact.risks = [...(artifact.risks ?? []), ...bridgeWarnings.map((warning) => warning.message)]
    artifact.notes = [...(artifact.notes ?? []), ...bridgeWarnings.map((warning) => warning.repairPrompt)]
  }

  const noveltyWarning = evaluateTurnNovelty(artifact, context)
  if (noveltyWarning) {
    artifact.argumentQuality = [...(artifact.argumentQuality ?? []), noveltyWarning]
    if (artifact.type !== 'verdict') artifact.risks = [...(artifact.risks ?? []), noveltyWarning.message]
    artifact.notes = [...(artifact.notes ?? []), noveltyWarning.repairPrompt]
  }

  if (artifact.type === 'verdict' && artifact.agentId === 'head-judge') {
    enforceVerdictDiscipline(artifact, context)
    normalizeVerdictConfidenceLanguage(artifact)
    enforceMarketAnchorDiscipline(artifact, context)
  }
}

function enforceMarketAnchorDiscipline(artifact: CourtArtifact, context: AgentContext) {
  const message = `${artifact.transcriptMessage ?? ''} ${artifact.summary}`
  const verdictRange = extractLastPercentRange(message)
  const marketAnchor = extractMarketAnchor(context)
  if (!verdictRange || marketAnchor === undefined) return

  const verdictMidpoint = (verdictRange.low + verdictRange.high) / 2
  const distance = Math.abs(verdictMidpoint - marketAnchor)
  const strongReason = /\b(direct disqualifier|direct proof|resolved|officially resolved|cancelled|impossible|already happened|primary resolution source|overwhelming blocker|fraud|fake|invalid)\b/i.test(message)
  if (distance < 12 || strongReason) return

  artifact.risks = [
    ...(artifact.risks ?? []),
    `Market-anchor discipline: verdict midpoint ${formatPercent(verdictMidpoint)} is far from observed market anchor ${formatPercent(marketAnchor)}; court must explain why evidence beats or fades the market.`,
  ]
  artifact.notes = [
    ...(artifact.notes ?? []),
    'Market-anchor discipline applied because the final range moved far from observed market context without a direct disqualifier.',
  ]

  const lower = Math.min(verdictRange.low, marketAnchor)
  const upper = Math.max(verdictRange.high, marketAnchor)
  const widenedLow = Math.max(0, Math.round((lower + (marketAnchor < verdictMidpoint ? marketAnchor : verdictRange.low)) / 2))
  const widenedHigh = Math.min(100, Math.round((upper + (marketAnchor > verdictMidpoint ? marketAnchor : verdictRange.high)) / 2))

  if (artifact.transcriptMessage) {
    artifact.transcriptMessage += ` Market anchor note: because the record contains a live market near ${formatPercent(marketAnchor)}, any tighter range than roughly ${widenedLow}-${widenedHigh}% needs a concrete reason to fade the market.`
  }
}

function extractMarketAnchor(context: AgentContext) {
  const marketEvidenceText = context.artifacts
    .flatMap((artifact) => artifact.evidenceItems ?? [])
    .filter((item) => item.sourceType === 'market' || item.capability === 'prediction_market_data')
    .slice(-6)
    .map((item) => item.claim)
    .join(' ')
  const text = marketEvidenceText || context.artifacts
    .filter((artifact) => artifact.agentId === 'pythia-prediction-witness')
    .slice(-4)
    .map((artifact) => `${artifact.summary} ${artifact.transcriptMessage ?? ''} ${(artifact.claims ?? []).join(' ')}`)
    .join(' ')

  const candidates = Array.from(text.matchAll(/\b(?:yes|chance|priced|trading|market(?:\s+at)?|probability)\D{0,24}(\d{1,2}(?:\.\d+)?)\s*%/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100)

  return candidates.at(-1)
}

function extractLastPercentRange(text: string) {
  const ranges = Array.from(text.matchAll(/(\d{1,2}(?:\.\d+)?)\s*-\s*(\d{1,2}(?:\.\d+)?)\s*%/g))
    .map((match) => ({ low: Number(match[1]), high: Number(match[2]) }))
    .filter((range) => Number.isFinite(range.low) && Number.isFinite(range.high) && range.low >= 0 && range.high <= 100 && range.low <= range.high)

  return ranges.at(-1)
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function normalizeVerdictConfidenceLanguage(artifact: CourtArtifact) {
  const message = artifact.transcriptMessage ?? artifact.summary
  const hasProbabilityRange = /\b(?:probability|range|yes)\s*(?:is|:)?\s*\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*%/i.test(message)
    || /\bfactual range\s*(?:is|:)?\s*\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*%/i.test(message)
  const confusesConfidenceWithProbability =
    /\bconfidence\s*(?:cap|capped|is|:|at)?\s*\d+(?:\.\d+)?\s*%/i.test(message)
    || /\b(?:with|at)\s+\d+(?:\.\d+)?\s*%\s+confidence\b/i.test(message)

  if (!confusesConfidenceWithProbability) return

  const confidence = artifact.confidence ?? 0.55
  const normalizedConfidence = confidence <= 0.1 ? 0.55 : confidence
  artifact.confidence = normalizedConfidence
  const confidenceText = normalizedConfidence >= 0.65
    ? 'confidence is moderate-high'
    : normalizedConfidence >= 0.45
      ? 'confidence is moderate'
      : 'confidence is low'

  const replaceConfidence = (value: string | undefined) =>
    value
      ?.replace(/\bconfidence\s*(?:cap|capped|is|:|at)?\s*\d+(?:\.\d+)?\s*%/gi, confidenceText)
      .replace(/\b(?:with|at)\s+\d+(?:\.\d+)?\s*%\s+confidence\b/gi, `with ${confidenceText}`)

  artifact.summary = replaceConfidence(artifact.summary) ?? artifact.summary
  artifact.transcriptMessage = replaceConfidence(artifact.transcriptMessage)
  artifact.risks = [
    ...(artifact.risks ?? []),
    hasProbabilityRange
      ? 'Verdict wording normalized: probability range is not the same as confidence.'
      : 'Verdict wording normalized: numeric event posture is not the same as model confidence.',
  ]
  artifact.notes = [
    ...(artifact.notes ?? []),
    'Normalized confidence/probability wording to avoid treating event probability as confidence.',
  ]
}

function evaluateResolutionBridge(artifact: CourtArtifact, context: AgentContext): ArgumentQualityWarning[] {
  const warnings: ArgumentQualityWarning[] = []
  const ledger = context.evidenceLedger ?? context.artifacts.flatMap((item) => item.evidenceItems ?? [])
  const evidenceById = new Map(ledger.map((item) => [item.id, item]))

  for (const node of artifact.argumentNodes ?? []) {
    const cited = node.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean)
    const citedDirectForSide = cited.some((item) =>
      item?.directness === 'direct'
      && (item.supports === node.side || item.supports === 'context'),
    )
    const citedCatalystOrBlocker = cited.some((item) =>
      item?.directness === 'indirect'
      && item.supports === node.side,
    )
    const bridgeText = `${node.claim} ${node.warrant}`
    const hasBridgeShape = /\b(mechanism|pathway|because|therefore|timeline|window|deadline|lag|failure mode|base rate|reference class|moves|caps|range|%|probability|scenario)\b/i.test(bridgeText)

    if (node.evidenceIds.length && !citedDirectForSide && !citedCatalystOrBlocker) {
      warnings.push(argumentWarning(
        node,
        'high',
        'resolution-mismatch',
        'Cited evidence does not directly support this side of the resolution rule.',
        'Recast the point as background/context, cite a better evidence id, or ask the appropriate witness to bridge source text to the exact resolution criterion.',
      ))
    } else if (citedCatalystOrBlocker && !hasBridgeShape) {
      warnings.push(argumentWarning(
        node,
        'medium',
        'resolution-mismatch',
        'Argument uses indirect catalyst/blocker evidence without explaining the mechanism and timing to the resolution event.',
        'State fact -> mechanism/pathway/blocker -> timing/window fit -> probability movement or confidence cap.',
      ))
    }
  }

  if (artifact.testimony?.evidenceIds?.length) {
    const cited = artifact.testimony.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean)
    const directCited = cited.some((item) => item?.directness === 'direct')
    const onlyContext = cited.length > 0 && cited.every((item) => item?.directness === 'background' || item?.supports === 'context')

    if (onlyContext && artifact.testimony.forecastWeight !== 'none') {
      artifact.testimony = {
        ...artifact.testimony,
        forecastWeight: 'none',
        limits: [
          ...artifact.testimony.limits,
          'This evidence is market/context/background only and cannot carry event proof without a separate bridge.',
        ],
      }
    } else if (!directCited && artifact.testimony.forecastWeight === 'strong') {
      artifact.testimony = {
        ...artifact.testimony,
        forecastWeight: 'moderate',
        limits: [
          ...artifact.testimony.limits,
          'No cited evidence item is direct to the resolution rule; treat this as a catalyst/blocker, not proof.',
        ],
      }
    }
  }

  return warnings.slice(0, 3)
}

function evaluateTurnNovelty(artifact: CourtArtifact, context: AgentContext): ArgumentQualityWarning | undefined {
  if (artifact.agentId === 'court-clerk' || artifact.agentId === 'settlement-clerk') return undefined
  const message = artifact.transcriptMessage ?? artifact.summary
  if (message.split(/\s+/).length < 18) return undefined

  const moveKinds = detectProgressionMoveKinds(message)
  const repeatsRecentLivePoint = context.artifacts.slice(-6).some((prior) =>
    prior.agentId !== artifact.agentId
    && argumentSimilarity(message, prior.transcriptMessage ?? prior.summary) >= 0.76,
  )
  const noConcreteAdvance = moveKinds.length === 0

  if (repeatsRecentLivePoint && noConcreteAdvance) {
    return {
      nodeId: `${artifact.agentId}-turn`,
      severity: 'medium',
      issue: 'no-progress',
      message: 'Turn repeats the live conversation without adding a new fact, mechanism, concession, number, question, or ruling.',
      repairPrompt: 'Make a progression move: close a gap, ask a targeted witness, add a mechanism, quantify a range, concede a limit, or move the court forward.',
    }
  }

  const priorSameAgent = context.artifacts.filter((item) => item.agentId === artifact.agentId).slice(-4)
  const highestSimilarity = priorSameAgent.reduce((max, prior) => {
    const priorMessage = prior.transcriptMessage ?? prior.summary
    return Math.max(max, argumentSimilarity(message, priorMessage))
  }, 0)

  if (highestSimilarity < 0.78 || moveKinds.length >= 2) return undefined

  return {
    nodeId: `${artifact.agentId}-turn`,
    severity: 'medium',
    issue: 'low-novelty',
    message: 'Turn appears to repeat the same evidence or argument shape without new analytical value.',
    repairPrompt: 'Add a new fact, concession, source distinction, mechanism, timing bridge, reference class, numerical range, or stop and let the court proceed.',
  }
}

function detectProgressionMoveKinds(text: string) {
  const kinds: string[] = []
  if (/\b(new|latest|now|confirmed|reported|source says|scraped|found|shows|states)\b/i.test(text)) kinds.push('fact')
  if (/\b(mechanism|pathway|chain|because|therefore|would require|depends on|failure mode|route|bridge)\b/i.test(text)) kinds.push('mechanism')
  if (/\b(concede|admit|cannot prove|does not show|missing|gap|unknown|unclear|no evidence|not enough)\b/i.test(text)) kinds.push('limit')
  if (/\b\d+(?:\.\d+)?\s?%|\b\d+\s?(?:days?|hours?|weeks?)\b|\brange\b|\bfair value\b|\bbase rate\b/i.test(text)) kinds.push('quant')
  if (/\?/.test(text)) kinds.push('question')
  if (/\b(admit|admitted|limited|excluded|strike|struck|ruling|weight|cap|verdict)\b/i.test(text)) kinds.push('ruling')
  if (/\b(yes|no|bull|bear)\b.*\b(but|however|fails|breaks|overstates|understates|answers)\b/i.test(text)) kinds.push('clash')

  return Array.from(new Set(kinds))
}

function enforceVerdictDiscipline(artifact: CourtArtifact, context: AgentContext) {
  const allWarnings = context.artifacts.flatMap((item) => item.argumentQuality ?? [])
  const highDefectCount = allWarnings.filter((warning) => warning.severity === 'high').length
  const recordRisks = [
    ...context.artifacts.flatMap((item) => item.risks ?? []),
    ...(artifact.risks ?? []),
  ].join(' ')
  const hasUnrepairedRecordProblem = highDefectCount > 0 || /\b(unsupported|overread|missing bridge|cannot prove|unadmitted|resolution rule)\b/i.test(recordRisks)
  const message = artifact.transcriptMessage ?? artifact.summary
  const choosesHardOrStrongSide = /\bVerdict:\s*(Yes|No)\b/i.test(message)
    || /\bconfidence\s*(?:of|at)?\s*(?:0\.[7-9]|\d{2,3}%)/i.test(message)
    || (artifact.confidence ?? 0) >= 0.7

  if (!hasUnrepairedRecordProblem || !choosesHardOrStrongSide) return

  artifact.confidence = Math.min(artifact.confidence ?? 0.55, 0.55)
  artifact.risks = [
    ...(artifact.risks ?? []),
    'Verdict discipline: unresolved high-severity bridge or record-guard problem caps confidence; indirect catalysts cannot be treated as direct resolution proof.',
  ]
  artifact.notes = [
    ...(artifact.notes ?? []),
    'Verdict discipline applied: preserve the selected lean only as a capped forecast posture unless direct/admitted evidence closes the missing bridge.',
  ]

  if (artifact.transcriptMessage) {
    artifact.transcriptMessage = artifact.transcriptMessage.replace(
      /\b(?:confidence\s*(?:of|at)?\s*(?:0\.[7-9]|\d{2,3}%)|(?:with|at)\s*\d{2,3}%\s+confidence)\b/gi,
      'confidence capped by unresolved evidence bridge',
    )
  }
}

function evaluateCounselExamination(artifact: CourtArtifact, context: AgentContext) {
  if (artifact.agentId !== 'bull-counsel' && artifact.agentId !== 'bear-counsel') return undefined
  if (context.courtPhase !== 'direct' && context.courtPhase !== 'cross' && context.courtPhase !== 'redirect') return undefined

  const text = `${artifact.transcriptMessage ?? ''} ${(artifact.request ?? '')}`.toLowerCase()
  const questionCount = (text.match(/\?/g) ?? []).length
  const hasTarget = /\b(evidence id|source|url|date|when|timeline|deadline|window|lag|mechanism|pathway|failure mode|base rate|reference class|probability|range|percent|move|cap|concession|concede|cannot support|missing)\b/i.test(text)
  const genericClarify = /\b(can you clarify|please clarify|can you elaborate|tell us more|shed light)\b/i.test(text)

  if (questionCount < 1 || !hasTarget || genericClarify) {
    return 'Examination quality warning: counsel question is too broad. Counsel must ask pointed evidence-seeking questions about source, timing, mechanism, failure mode, base rate, or probability movement.'
  }

  return undefined
}

function evaluateArgumentQuality(
  artifact: Pick<CourtArtifact, 'argumentNodes'>,
  priorArtifacts: CourtArtifact[],
): ArgumentQualityWarning[] | undefined {
  const priorNodes = priorArtifacts.flatMap((item) => item.argumentNodes ?? [])
  const warnings = (artifact.argumentNodes ?? []).flatMap((node) => evaluateArgumentNode(node, priorNodes))

  return warnings.length ? warnings : undefined
}

function evaluateArgumentNode(node: ArgumentNode, priorNodes: ArgumentNode[]) {
  const warnings: ArgumentQualityWarning[] = []
  const claim = normalizeArgumentText(node.claim)
  const warrant = normalizeArgumentText(node.warrant)
  const combined = `${claim} ${warrant}`

  if (!node.evidenceIds.length) {
    warnings.push(argumentWarning(
      node,
      'high',
      'missing-evidence',
      'Argument has no evidence id from the ledger.',
      'Cite an evidence id, or recast the point as a missing proof/gap rather than an asserted fact.',
    ))
  }

  if (isWeakWarrant(warrant)) {
    warnings.push(argumentWarning(
      node,
      'high',
      'weak-warrant',
      'Warrant does not explain a concrete bridge from evidence to probability movement.',
      'Rebuild as evidence -> mechanism/pathway/blocker -> why the probability range moves or gets capped.',
    ))
  }

  if (isRepetitiveArgument(node, priorNodes)) {
    warnings.push(argumentWarning(
      node,
      'medium',
      'repetition',
      'Argument repeats an earlier claim or warrant without adding analytical value.',
      'Add a new bridge, quantify the old one, attack the opposing bridge, or concede and move on.',
    ))
  }

  if (needsQuantification(combined) && !hasQuantification(combined)) {
    warnings.push(argumentWarning(
      node,
      'medium',
      'missing-quantification',
      'Argument invokes probability, timing, counts, or market pressure without numeric discipline.',
      'Add a range, count, deadline math, reference class, or state why the record cannot support a number.',
    ))
  }

  if (mentionsMarket(combined) && !stressTestsMarket(combined)) {
    warnings.push(argumentWarning(
      node,
      'medium',
      'market-handwave',
      'Argument cites market odds without judging whether the market should be copied, faded, or adjusted.',
      'Compare market price against non-market evidence, liquidity/freshness, and the strongest opposing pathway.',
    ))
  }

  return warnings.slice(0, 3)
}

export function summarizeArgumentQuality(warnings: ArgumentQualityWarning[] | undefined, max = 4) {
  return (warnings ?? []).slice(-max).map((warning) =>
    `${warning.severity}/${warning.issue}/${warning.nodeId}: ${warning.message} Repair: ${warning.repairPrompt}`,
  )
}

function argumentWarning(
  node: ArgumentNode,
  severity: ArgumentQualityWarning['severity'],
  issue: ArgumentQualityWarning['issue'],
  message: string,
  repairPrompt: string,
): ArgumentQualityWarning {
  return {
    nodeId: node.id,
    severity,
    issue,
    message,
    repairPrompt,
  }
}

function isWeakWarrant(warrant: string) {
  if (!warrant) return true

  const bridgeLanguage = /\b(because|therefore|raises|lowers|caps|moves|updates|pathway|mechanism|base rate|reference class|timing|deadline|window|lag|liquidity|volume|screening|constraint|incentive|directly|indirectly|official|reported|confirmed|source quality|freshness|failure mode)\b/i
  const genericOnly = /\b(provides credible information|strong foundation|supports the likelihood|could influence|does not guarantee|raises doubts|overall confidence|accurate reporting|potential developments|important context)\b/i
  const tooShort = warrant.split(/\s+/).length < 10

  return tooShort || genericOnly.test(warrant) || !bridgeLanguage.test(warrant)
}

function isRepetitiveArgument(node: ArgumentNode, priorNodes: ArgumentNode[]) {
  return priorNodes.some((prior) =>
    argumentSimilarity(node.claim, prior.claim) >= 0.72 || argumentSimilarity(node.warrant, prior.warrant) >= 0.72,
  )
}

function needsQuantification(text: string) {
  return /\b(probability|odds|market|price|chance|deadline|window|days?|hours?|weeks?|count|number|volume|liquidity|range|base rate|reference class|tail risk|timeline)\b/i.test(text)
}

function hasQuantification(text: string) {
  return /\b\d+(?:\.\d+)?\s*(?:%|bps?|days?|hours?|weeks?|months?|usd|usdc|cases?|people|volume|k|m|b|x)?\b|\b(low|mid|high)[-\s]?\d{1,2}s\b|\b\d{1,3}\s*-\s*\d{1,3}%\b/i.test(text)
}

function mentionsMarket(text: string) {
  return /\b(market|polymarket|kalshi|manifold|odds|price|probability|liquidity|volume|traders)\b/i.test(text)
}

function stressTestsMarket(text: string) {
  return /\b(liquidity|volume|spread|stale|fresh|thin|deep|overweight|underweight|mispriced|calibrated|adjust|fade|copy|market-implied|non-market|outside view)\b/i.test(text)
}

export function argumentSimilarity(a: string, b: string) {
  const left = argumentTokens(a)
  const right = argumentTokens(b)
  if (!left.size || !right.size) return 0

  let overlap = 0
  for (const token of left) {
    if (right.has(token)) overlap += 1
  }

  return overlap / Math.min(left.size, right.size)
}

function argumentTokens(value: string) {
  return new Set(
    normalizeArgumentText(value)
      .split(' ')
      .filter((token) => token.length > 3 && !argumentStopWords.has(token)),
  )
}

function normalizeArgumentText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const argumentStopWords = new Set([
  'this',
  'that',
  'with',
  'from',
  'have',
  'been',
  'will',
  'would',
  'could',
  'should',
  'case',
  'market',
  'evidence',
  'confirmed',
  'reported',
  'source',
  'sources',
  'probability',
  'likelihood',
])
