import type { AgentContext, CourtArtifact } from '../court/types'
import { summarizeEvidenceLedger } from '../court/evidence-ledger'
import { buildHearingMemory } from '../court/hearing-memory'
import { summarizeEvidenceAgenda } from '../court/evidence-agenda'
import { argumentSimilarity, finalizeArtifact, summarizeArgumentQuality } from './artifact-finalization'
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
  const routedRequest = routeRequestedAgent(candidateRequestedAgentId, rawRequest)
  const requestedAgentId = getUsableRequestedAgentId(routedRequest.agentId, routedRequest.request, context)

  return await finalizeArtifact(withRunMetadata({
      ...fallback,
      summary: result.content.summary ?? `${agent.name} answered the court.`,
      transcriptMessage: result.content.message ?? `${agent.name} could not produce a courtroom message.`,
      requestedAgentId,
      request: requestedAgentId ? routedRequest.request : undefined,
      confidence: result.content.confidence ?? fallback.confidence,
      claims: result.content.claims?.length ? result.content.claims : [],
      risks: result.content.risks?.length ? result.content.risks : [],
      testimony: result.content.testimony,
      argumentNodes: shouldKeepArgumentNodes(agent.seat, context)
        ? result.content.argumentNodes?.length ? result.content.argumentNodes : undefined
        : undefined,
      leadBranches: result.content.leadBranches?.length ? result.content.leadBranches : undefined,
    }, {
      promptVersion: prompt.version,
      modelProvider: result.provider,
      model: result.model,
      runMode: agent.runMode,
    }), context)
}

function routeRequestedAgent(agentId: string | undefined, request: string | undefined) {
  if (!agentId || !request) return { agentId, request }

  if (agentId === 'web-scraper-witness' && /\b(order\s*book|bid[- ]?ask|spread|depth|best bid|best ask|clob|stale quote|market freshness|volume history|recent trades?)\b/i.test(request)) {
    return {
      agentId: 'pythia-prediction-witness',
      request: `Pythia, use prediction-market/CLOB data rather than page scraping for this market microstructure request: ${request}`,
    }
  }

  return { agentId, request }
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
    ['direct-status', /\b(confirmed|direct evidence|resolution source|official source|has happened|already happened|status)\b/],
    ['future-pathway', /\b(catalyst|mechanism|pathway|loophole|incentive|sequence|could still|will happen|before the deadline|what would make)\b/],
    ['multi-outcome', /\b(sibling outcome|sibling contract|multi[- ]outcome|multiple contracts|candidate|threshold|event page|filed contract|filed outcome)\b/],
    ['sports-status', /\b(sports data|score|final score|game status|match status|roster|squad|injury|fifa|nba|mlb|tennis|atp|wta|ipl)\b/],
    ['tool-failure', /\b(tool failed|returned empty|api returned empty|timed out|blocked|cannot fetch|could not scrape|no current data|no live data)\b/],
    ['timing-window', /\b(deadline|reporting lag|window|days?|hours?|expired|time remaining|horizon)\b/],
    ['market-quant', /\b(market|odds|liquidity|volume|spread|depth|base rate|tail risk|range|probability)\b/],
    ['source-quality', /\b(source|scrape|official|credible|freshness|directness|reuters|fifa|aaa|eia|imf|portwatch|kalshi|polymarket|manifold)\b/],
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
          'for unresolved will-markets, test catalysts and pathways before treating non-occurrence as decisive',
          'for multi-outcome events, name the filed contract and sibling outcomes that matter',
          'when search has already found URLs, tell scraper/source-quality/timeline witnesses to inspect those URLs instead of asking the user for links',
          'treat market odds as calibration, not proof; do not call odds stale without volume/history evidence',
          'when exact data is absent, build the closest supported proxy/reference class or route a witness to find one',
          'if a gap remains, include attempted paths, a bounded estimate/range, and what would update it',
          'say uncertainty plainly',
        ],
        avoid: [
          'stiff ceremonial filler',
          'raw source snippets',
          'inventing missing facts or numbers',
          'rehashing the whole record',
          'asking the same witness for the same failed tool result',
          'using no-confirmation-yet as final No while time remains',
          'ending with no data/no evidence without a proxy, range, research path, or routed next step',
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
          leadBranches: artifact.leadBranches?.slice(0, 3),
          argumentQuality: summarizeArgumentQuality(artifact.argumentQuality, 2),
        })),
      },
      hearingMemory,
      evidenceLedger: summarizeEvidenceLedger(context.evidenceLedger, 8),
      privateEvidenceAppendix: buildPrivateEvidenceAppendix(context),
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
        leadBranches: artifact.leadBranches?.slice(0, 3),
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
        rule: 'If your tools cannot answer the live question, set requestedAgentId/request for the best matching witness instead of guessing. If that witness/tool already failed on the same point, change strategy: ask for a catalyst/pathway, source alternative, sibling outcome comparison, confidence cap, or move to counsel clash.',
        examplesByCapability: [
          { need: 'fresh public facts or headlines', agentId: 'hermes-news-witness' },
          { need: 'exact source page content, cited URL text, or search-discovered source inspection', agentId: 'web-scraper-witness' },
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
      toolEvidenceSummary: (context.toolEvidence ?? [])
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
          title: compactText(String(source.title ?? ''), 160),
          url: source.url,
          observedAt: source.observedAt,
        })).slice(0, 5),
      })),
    },
    null,
    2,
  )
}

function buildPrivateEvidenceAppendix(context: AgentContext) {
  const recentPriorToolEvidence = context.artifacts
    .slice(-8)
    .flatMap((artifact) => artifact.toolEvidence?.map((evidence) => ({ artifactId: artifact.id, agentId: artifact.agentId, evidence })) ?? [])
  const seenPrior = new Set<string>()
  const priorToolEvidence = recentPriorToolEvidence.filter(({ evidence }) => {
    const key = `${evidence.capability}:${evidence.provider}:${evidence.query}:${evidence.fetchedAt}`
    if (seenPrior.has(key)) return false
    seenPrior.add(key)
    return true
  }).slice(-10)

  return {
    instruction: [
      'Private evidence appendix for model reasoning only.',
      'Use this fuller data before claiming a rule, definition, source, volume, ranking, deadline, or scrape result is missing.',
      'Do not paste the whole appendix into the public transcript; convert it into concise facts, limits, and source distinctions.',
      'If a scrape timed out but an API/source value contains the needed rule or criteria, use the API/source value and treat the timeout as non-blocking.',
      'If exact data is absent, use this appendix to build the closest defensible proxy/reference class or route a witness to fetch it; do not stop at "no data" alone.',
    ].join(' '),
    currentTurnToolEvidence: (context.toolEvidence ?? []).map((evidence) => serializeDetailedToolEvidence(evidence)),
    recentPriorToolEvidence: priorToolEvidence.map(({ artifactId, agentId, evidence }) => ({
      artifactId,
      agentId,
      ...serializeDetailedToolEvidence(evidence),
    })),
  }
}

function serializeDetailedToolEvidence(evidence: NonNullable<AgentContext['toolEvidence']>[number]) {
  return {
    capability: evidence.capability,
    provider: evidence.provider,
    query: compactText(evidence.query, 300),
    fetchedAt: evidence.fetchedAt,
    status: evidence.status,
    relevance: evidence.relevance,
    plannerReason: evidence.plannerReason ? compactText(evidence.plannerReason, 280) : undefined,
    error: evidence.error ? compactText(evidence.error, 500) : undefined,
    observations: evidence.observations
      .map(cleanPromptText)
      .filter(Boolean)
      .map((observation) => compactText(observation, 1_200))
      .slice(0, 16),
    sources: evidence.sources
      .map((source) => ({
        title: compactText(String(source.title ?? ''), 220),
        url: source.url,
        observedAt: source.observedAt,
        value: source.value ? compactText(stringifyPromptValue(source.value), 1_500) : undefined,
      }))
      .slice(0, 18),
  }
}

function stringifyPromptValue(value: unknown) {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
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

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, ' ').trim()

  if (compacted.length <= maxLength) return compacted

  return `${compacted.slice(0, maxLength - 1).trimEnd()}…`
}
