import type { AgentContext, ArgumentNode, ArgumentQualityWarning, CourtArtifact } from '../court/types'
import { scoreArtifactEvidenceWithAi } from '../court/evidence-scoring'
import { normalizeToolEvidenceToLedgerItems, summarizeEvidenceLedger } from '../court/evidence-ledger'
import { buildHearingMemory } from '../court/hearing-memory'
import { summarizeEvidenceAgenda } from '../court/evidence-agenda'
import { applyRecordGuard } from '../court/record-guard'
import { generateCourtJson } from './model'
import { getAgentPrompt } from './prompts'
import { agentRegistry } from './registry'

type RunPromptedAgentOptions = {
  agentId: string
  context: AgentContext
  fallback: CourtArtifact
  allowToolBackedWitnesses?: boolean
}

export async function runPromptedAgent({
  agentId,
  context,
  fallback,
  allowToolBackedWitnesses = false,
}: RunPromptedAgentOptions): Promise<CourtArtifact> {
  const agent = getRegistryEntry(agentId)
  const prompt = getAgentPrompt(agent.promptKey)
  const modelDisabled = process.env.HELIA_DISABLE_MODEL === 'true'
  const toolBackedButNotReady = agent.runMode === 'tool-backed-model' && !allowToolBackedWitnesses
  const readyToolEvidence = context.toolEvidence?.filter((evidence) => evidence.status === 'ok') ?? []

  if (modelDisabled || agent.runMode === 'deterministic' || toolBackedButNotReady) {
    const reason = modelDisabled
      ? 'Model calls are disabled.'
      : toolBackedButNotReady && readyToolEvidence.length
        ? `${agent.name} collected ${readyToolEvidence.map((evidence) => evidence.provider).join(', ')} evidence, but LLM witness speech is disabled.`
        : `Model testimony is not enabled for ${agent.name}.`
    throw new Error(`${agentId} cannot speak without the model: ${reason}`)
  }

  const result = await generateCourtJson({
    agent,
    system: `${prompt.system}\n\n${prompt.outputContract}`,
    user: buildAgentUserPrompt(prompt.task, context, agentId),
  })

  if (!result.ok) {
    throw new Error(`${agentId} model call failed: ${result.reason}`)
  }

  const inferredRequest = inferSpokenHandoff(result.content.message, result.content.request, agentId)
  const candidateRequestedAgentId = result.content.requestedAgentId && agentRegistry.some((entry) => entry.id === result.content.requestedAgentId)
    ? result.content.requestedAgentId
    : inferredRequest?.agentId
  const rawRequest = result.content.request ?? inferredRequest?.request
  const requestedAgentId = getUsableRequestedAgentId(candidateRequestedAgentId, rawRequest, context)

  return await finalizeArtifact(withRunMetadata({
      ...fallback,
      summary: result.content.summary ?? `${agent.name} answered the court.`,
      transcriptMessage: result.content.message ?? `${agent.name} could not produce a courtroom message.`,
      requestedAgentId,
      request: requestedAgentId ? rawRequest : undefined,
      confidence: result.content.confidence ?? fallback.confidence,
      claims: result.content.claims?.length ? result.content.claims : [],
      risks: result.content.risks?.length ? result.content.risks : [],
      testimony: result.content.testimony,
      argumentNodes: shouldKeepArgumentNodes(agent.seat, context)
        ? result.content.argumentNodes?.length ? result.content.argumentNodes : undefined
        : undefined,
    }, {
      promptVersion: prompt.version,
      modelProvider: result.provider,
      model: result.model,
      runMode: agent.runMode,
    }), context)
}

function inferSpokenHandoff(message: string | undefined, request: string | undefined, currentAgentId: string) {
  const text = `${message ?? ''} ${request ?? ''}`.replace(/\s+/g, ' ').trim()
  if (!text || !/\?|\b(search|scrape|check|give|find|look|testify|quantify|grade|build|inspect)\b/i.test(text)) return undefined

  const target = agentRegistry.find((entry) => {
    if (entry.id === currentAgentId) return false
    const shortName = entry.name.split(/\s+/)[0]
    return new RegExp(`\\b${escapeRegExp(shortName)}\\b\\s*,?`, 'i').test(text)
      || new RegExp(`\\b${escapeRegExp(entry.id)}\\b`, 'i').test(text)
  })
  if (!target) return undefined

  const shortName = target.name.split(/\s+/)[0]
  const requestMatch = text.match(new RegExp(`\\b${escapeRegExp(shortName)}\\b\\s*,?\\s*([^]*?)(?:$|\\n)`, 'i'))
  return {
    agentId: target.id,
    request: requestMatch?.[1]?.trim() || text,
  }
}

function getUsableRequestedAgentId(agentId: string | undefined, request: string | undefined, context: AgentContext) {
  if (!agentId || !request) return undefined
  if (isPrematureJurorRequest(agentId, context.courtPhase)) return undefined

  const priorSameAgent = context.artifacts.filter((artifact) => artifact.agentId === agentId)
  const maxCalls = process.env.HELIA_HEARING_MODE === 'exhaustive' ? 4 : 3
  if (priorSameAgent.length >= maxCalls) return undefined
  if (priorSameAgent.length >= 2 && isSameTopicRecall(request, priorSameAgent)) return undefined

  const duplicate = priorSameAgent.some((artifact) =>
    argumentSimilarity(request, `${artifact.summary} ${artifact.transcriptMessage ?? ''} ${(artifact.risks ?? []).join(' ')}`) >= 0.58,
  )

  return duplicate ? undefined : agentId
}

function isSameTopicRecall(request: string, priorArtifacts: CourtArtifact[]) {
  const requestShape = topicShape(request)
  if (!requestShape) return false

  return priorArtifacts.filter((artifact) =>
    topicShape(`${artifact.summary} ${artifact.transcriptMessage ?? ''} ${(artifact.risks ?? []).join(' ')}`) === requestShape,
  ).length >= 2
}

function topicShape(value: string) {
  const text = value.toLowerCase()
  const topics = [
    ['direct-status', /\b(us case|confirmed case|testing report|reported case|direct evidence|resolution)\b/],
    ['importation-bridge', /\b(importation|traveler|travel|contact|exposure|screening|flight|germany|missionary)\b/],
    ['timing-window', /\b(42 days|deadline|incubation|reporting lag|window|june 30)\b/],
    ['market-quant', /\b(23%|market|odds|liquidity|volume|base rate|tail risk|range)\b/],
    ['source-quality', /\b(source|scrape|official|cdc|who|reuters|local alert|han|bulletin)\b/],
  ] as const

  return topics.find(([, pattern]) => pattern.test(text))?.[0] ?? ''
}

function isPrematureJurorRequest(agentId: string, phase: string | undefined) {
  if (agentId !== 'dikast-momentum' && agentId !== 'dikast-skeptic' && agentId !== 'dikast-risk') return false

  return phase !== 'jury-instruction' && phase !== 'deliberation'
}

function shouldKeepArgumentNodes(seat: string, context: AgentContext) {
  if (context.courtPhase === 'opening') return false
  return seat === 'bull-counsel'
    || seat === 'bear-counsel'
    || seat === 'juror'
    || seat === 'risk-bailiff'
    || seat === 'head-judge'
}

function getRegistryEntry(agentId: string) {
  const agent = agentRegistry.find((entry) => entry.id === agentId)

  if (!agent) {
    throw new Error(`Agent is not registered: ${agentId}`)
  }

  return agent
}

function buildAgentUserPrompt(task: string, context: AgentContext, agentId: string) {
  const lastTurn = context.transcript?.at(-1)
  const directedTurns = (context.transcript ?? []).filter((turn) => turn.requestedAgentId === agentId)
  const ownArtifacts = context.artifacts.filter((artifact) => artifact.agentId === agentId)
  const hearingMemory = buildHearingMemory(context)

  return JSON.stringify(
    {
      task,
      responseStyle: {
        visibleMessage: 'Write naturally, like a smart person in a serious group chat.',
        maxWords: context.courtPhase === 'verdict' || context.courtPhase === 'admission' ? 160 : 120,
        novelty: {
          rule: 'Use your memory before speaking. If you are about to repeat the same point, turn it into a sharper question, a mechanism, a number/range, a source distinction, a concession, a direct rebuttal, or a handoff to the witness who can actually improve the record.',
          avoidRepeating: hearingMemory.progressionState.exhaustedPoints.slice(0, 3),
          usefulNextQuestions: hearingMemory.nextUsefulQuestions.slice(0, 3),
          centralClash: hearingMemory.counselState.unresolvedContest,
        },
        do: [
          'respond to the live conversation',
          'use the evidence and memory you were given',
          'ask another agent when their tools or role would help',
          'say uncertainty plainly',
        ],
        avoid: [
          'stiff ceremonial filler',
          'raw source snippets',
          'inventing missing facts or numbers',
          'rehashing the whole record',
        ],
        progressionHint: hearingMemory.progressionState.neededMove,
        neededMove: hearingMemory.progressionState.neededMove,
      },
      courtPhase: context.courtPhase,
      courtInstruction: context.courtInstruction,
      marketCase: context.marketCase,
      evidenceAgenda: summarizeEvidenceAgenda(context.evidenceAgenda, 8),
      turnAwareness: {
        currentAgentId: agentId,
        lastTurn: lastTurn
          ? {
              id: lastTurn.id,
              agentId: lastTurn.agentId,
              agentName: lastTurn.agentName,
              seat: lastTurn.seat,
              kind: lastTurn.kind,
              stage: lastTurn.stage,
              requestedAgentId: lastTurn.requestedAgentId,
              request: lastTurn.request ? compactText(cleanPromptText(lastTurn.request), 220) : undefined,
              message: compactText(cleanPromptText(lastTurn.message), 300),
            }
          : undefined,
        lastTurnWasDirectedToYou: lastTurn?.requestedAgentId === agentId,
        recentTurnsDirectedToYou: directedTurns.slice(-6).map((turn) => ({
          id: turn.id,
          agentId: turn.agentId,
          agentName: turn.agentName,
          kind: turn.kind,
          stage: turn.stage,
          request: turn.request ? compactText(cleanPromptText(turn.request), 220) : undefined,
          message: compactText(cleanPromptText(turn.message), 260),
        })),
        yourPriorTurns: ownArtifacts.slice(-6).map((artifact) => ({
          type: artifact.type,
          summary: compactText(artifact.summary, 260),
          confidence: artifact.confidence,
          testimony: artifact.testimony,
          argumentNodes: artifact.argumentNodes?.slice(0, 2),
          argumentQuality: summarizeArgumentQuality(artifact.argumentQuality, 2),
        })),
      },
      hearingMemory,
      evidenceLedger: summarizeEvidenceLedger(context.evidenceLedger, 8),
      recentRecord: context.artifacts.slice(-10).map((artifact) => ({
        agentId: artifact.agentId,
        type: artifact.type,
        summary: compactText(cleanPromptText(artifact.summary), 220),
        confidence: artifact.confidence,
        claims: artifact.claims?.map(cleanPromptText).filter(Boolean).map((claim) => compactText(claim, 160)).slice(0, 3),
        risks: artifact.risks?.map(cleanPromptText).filter(Boolean).map((risk) => compactText(risk, 160)).slice(0, 3),
        evidenceScores: artifact.evidenceScores?.slice(0, 6),
        testimony: artifact.testimony,
        argumentNodes: artifact.argumentNodes?.slice(0, 2),
        argumentQuality: summarizeArgumentQuality(artifact.argumentQuality, 3),
        notes: artifact.notes?.map((note) => compactText(note, 220)).slice(0, 3),
      })),
      liveConversation: (context.transcript ?? []).slice(-10).map((turn) => ({
        id: turn.id,
        agentId: turn.agentId,
        agentName: turn.agentName,
        seat: turn.seat,
        kind: turn.kind,
        stage: turn.stage,
        message: compactText(cleanPromptText(turn.message), 260),
        request: turn.request ? compactText(cleanPromptText(turn.request), 180) : undefined,
        requestedAgentId: turn.requestedAgentId,
      })),
      availableAgents: agentRegistry.map((entry) => ({
        id: entry.id,
        name: entry.name,
        seat: entry.seat,
        description: entry.description,
        toolCapabilities: entry.toolCapabilities,
      })),
      handoffHint: {
        rule: 'If your tools cannot answer the live question, set requestedAgentId/request for the best matching witness instead of guessing.',
        examplesByCapability: [
          { need: 'fresh public facts or headlines', agentId: 'hermes-news-witness' },
          { need: 'exact source page content or cited URL text', agentId: 'web-scraper-witness' },
          { need: 'screenshot, image, chart, or page visual reading', agentId: 'visual-evidence-witness' },
          { need: 'social profile, post, follower, tweet, or mention counts', agentId: 'social-count-witness' },
          { need: 'wallet, contract, token, or exchange-flow data', agentId: 'argos-onchain-witness' },
          { need: 'weather, sports, calendar, or external structured dataset', agentId: 'notus-weather-data-witness' },
          { need: 'prediction-market odds, liquidity, or market page context', agentId: 'pythia-prediction-witness' },
          { need: 'numbers, probability range, price distance, or liquidity interpretation', agentId: 'numeros-quant-witness' },
          { need: 'source authority, freshness, directness, or credibility grading', agentId: 'skepsis-source-quality-witness' },
          { need: 'timeline, deadline, chronology, or reporting lag', agentId: 'chronos-timeline-witness' },
          { need: 'broad synthesis after several tools disagree', agentId: 'sophia-research-witness' },
        ],
      },
      toolGaps: (context.toolEvidence ?? [])
        .filter((evidence) => evidence.status !== 'ok' || evidence.relevance === 'low')
        .slice(0, 6)
        .map((evidence) => ({
          capability: evidence.capability,
          provider: evidence.provider,
          status: evidence.status,
          relevance: evidence.relevance,
          error: evidence.error,
          observations: evidence.observations.map(cleanPromptText).filter(Boolean).map((observation) => compactText(observation, 180)).slice(0, 2),
        })),
      toolEvidence: (context.toolEvidence ?? [])
        .filter((evidence) => evidence.status === 'ok' && evidence.relevance !== 'low')
        .slice(0, 6)
        .map((evidence) => ({
        capability: evidence.capability,
        provider: evidence.provider,
        query: compactText(evidence.query, 180),
        fetchedAt: evidence.fetchedAt,
        status: evidence.status,
        relevance: evidence.relevance,
        observations: evidence.observations.map(cleanPromptText).filter(Boolean).map((observation) => compactText(observation, 220)).slice(0, 4),
        sources: evidence.sources.map((source) => ({
          title: compactText(source.title, 160),
          url: source.url,
          observedAt: source.observedAt,
        })).slice(0, 5),
      })),
    },
    null,
    2,
  )
}

function cleanPromptText(value: string | undefined) {
  if (!value) return ''
  const cleaned = value
    .replace(/^(duckduckgo-html|bing-html|brave|serpapi|tavily|gdelt)\s+web\/news result:\s*/i, '')
    .replace(/^Scraped\s+/i, '')
    .replace(/\s+via\s+(?:static-readability|static-cheerio|browser-render|public-endpoint)[\s\S]*$/i, '')
    .replace(/\s+Source quality:[\s\S]*$/i, '')
    .replace(/\s+Content hash:\s*[a-f0-9]+\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (/^(search plan|planner relevance|deterministic fallback search plan|supporting context|fallback context):/i.test(cleaned)) return ''
  if (/^No visual analysis could be completed\.?$/i.test(cleaned)) return ''
  if (/^Opening only\b/i.test(cleaned)) return ''
  return cleaned
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withRunMetadata(
  artifact: CourtArtifact,
  metadata: Pick<CourtArtifact, 'model' | 'modelProvider' | 'notes' | 'promptVersion' | 'runMode'>,
): CourtArtifact {
  return {
    ...artifact,
    ...metadata,
  }
}

async function finalizeArtifact(artifact: CourtArtifact, context: AgentContext) {
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

function summarizeArgumentQuality(warnings: ArgumentQualityWarning[] | undefined, max = 4) {
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

function argumentSimilarity(a: string, b: string) {
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

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, ' ').trim()

  if (compacted.length <= maxLength) return compacted

  return `${compacted.slice(0, maxLength - 1).trimEnd()}…`
}
