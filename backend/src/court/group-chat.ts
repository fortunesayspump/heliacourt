import type { CourtArtifact, CourtTranscriptTurn, MarketCase } from './types'
import { getMarketGenres } from '../agents/tools/text'
import { buildCourtClock, describeCourtClock } from './court-time'

export type CourtProcedureStep = {
  agentId: string
  phase:
    | 'docket'
    | 'judge-framing'
    | 'opening'
    | 'direct'
    | 'cross'
    | 'redirect'
    | 'judge-question'
    | 'admission'
    | 'closing'
    | 'risk-instruction'
    | 'calibration'
    | 'jury-instruction'
    | 'deliberation'
    | 'verdict'
    | 'settlement'
  stage: string
  request: string
  issue?: string
  targetAgentId?: string
}

export type CourtProcedurePlan = {
  witnessIds?: string[]
  issues?: string[]
  rationale?: string
}

export const witnessAgentIds = [
  'pythia-prediction-witness',
  'hermes-news-witness',
  'argos-onchain-witness',
  'notus-weather-data-witness',
  'web-scraper-witness',
  'visual-evidence-witness',
  'skepsis-source-quality-witness',
  'chronos-timeline-witness',
  'sophia-research-witness',
  'numeros-quant-witness',
  'social-count-witness',
]

export function getDefaultMaxHearingRounds() {
  return 22
}

export function buildCourtProcedure(marketCase: MarketCase, plan?: CourtProcedurePlan): CourtProcedureStep[] {
  const dynamicWitnessSelection = process.env.HELIA_DYNAMIC_WITNESSES === 'true' || process.env.HELIA_HEARING_MODE === 'dynamic'
  const witnesses = dynamicWitnessSelection ? [] : selectWitnesses(plan?.witnessIds ?? getRelevantWitnesses(marketCase))
  const jurors = process.env.HELIA_ENABLE_JURY === 'true' ? getJurorPanel(marketCase) : []
  const issues = selectIssues(plan?.issues ?? getEvidentiaryIssues(marketCase))
  const issueList = issues.map((issue, index) => `${index + 1}. ${issue}`).join(' ')
  const courtClock = describeCourtClock(buildCourtClock(marketCase))
  const predictionStandard =
    'This is a prediction-market hearing. Witnesses supply facts and limits. Counsel argues the forecast bridge. Archon weighs Yes, No, leaning Yes, leaning No, or no-edge. For unresolved "will" markets, do not stop at whether the event has already happened; test catalysts, loopholes, mechanisms, blockers, timing, and update triggers. For event pages with multiple contracts/outcomes, evaluate the filed outcome and compare sibling outcomes instead of flattening the event into one generic Yes/No.'
  const marketScopeInstruction = getMarketScopeInstruction(marketCase)
  const linkInstruction = marketCase.links?.length
    ? ` Reference links for source extraction: ${marketCase.links.join(' ')}.`
    : ''
  const contextInstruction = marketCase.context
    ? ` Case context/resolution criteria for all agents: ${marketCase.context}.${linkInstruction} ${courtClock}. Treat this as resolution context, not as a separate claim already proven.`
    : `${linkInstruction} ${courtClock}.`
  const planInstruction = plan?.rationale ? ` Hearing planner rationale: ${plan.rationale}.` : ''
  const exhaustiveExamination = process.env.HELIA_HEARING_MODE === 'exhaustive'
  const allowRedirects = exhaustiveExamination || process.env.HELIA_ENABLE_REDIRECTS === 'true'
  const allowStandaloneWitnessCalls = exhaustiveExamination || process.env.HELIA_HEARING_MODE === 'full'
  const steps: CourtProcedureStep[] = [
    {
      agentId: 'court-clerk',
      phase: 'docket',
      stage: 'Docket call',
      request: `Call the case in plain English: question, deadline/window, resolution context, whether this is a binary contract or multi-outcome event, the specific filed outcome/contract, and what the court must prove or forecast.${marketScopeInstruction}${contextInstruction}`,
    },
    {
      agentId: 'head-judge',
      phase: 'judge-framing',
      stage: 'Magistrate frames issue',
      request:
        `Frame the hearing briefly. ${predictionStandard}${marketScopeInstruction} Name the live issues: ${issueList}.${contextInstruction}${planInstruction} Do not decide merits yet.`,
    },
    {
      agentId: 'bull-counsel',
      phase: 'opening',
      stage: 'Opening statement: affirmative',
      request:
        `Give a short Yes opening. No witness has testified yet. For unresolved markets, state the catalyst/mechanism that could still make the event happen before the deadline, not just whether it already happened. If this is an event-wide or event-referenced multi-outcome filing, give a compact child-market matrix: filed child plus material siblings, each with Yes path, No blocker, deadline/trigger fit, and price/liquidity if supplied. Do not pretend one unstated child contract was filed. If a specific child contract was filed, say why it could beat sibling outcomes. Say what data would matter most and which witness you may need. Issues: ${issueList}.${marketScopeInstruction}${contextInstruction}`,
    },
    {
      agentId: 'bear-counsel',
      phase: 'opening',
      stage: 'Opening statement: negative',
      request:
        `Give a short No opening. No witness has testified yet. Attack the catalyst/mechanism, deadline fit, incentives, or sibling outcomes that steal probability; do not merely say the event has not happened yet unless the deadline has passed. If this is event-wide or event-referenced, give a compact child-market matrix: filed child plus material siblings, each with No blocker, Yes vulnerability, deadline/trigger fit, and price/liquidity if supplied. Name why no single outcome deserves strong confidence. Say what data would change your mind. Issues: ${issueList}.${marketScopeInstruction}${contextInstruction}`,
    },
  ]

  if (dynamicWitnessSelection) {
    steps.push({
      agentId: 'head-judge',
      phase: 'judge-question',
      stage: 'Magistrate calls first witness',
      request:
        `Using the case agenda, openings, and live issues, call exactly one best first witness by setting requestedAgentId and request. Do not testify yourself. Choose the witness that can most reduce uncertainty now. Issues: ${issueList}.${contextInstruction}${planInstruction}`,
    })
  }

  for (const witness of witnesses) {
    const witnessIssue = getWitnessIssue(witness, issues)
    if (allowStandaloneWitnessCalls) {
      steps.push({
        agentId: 'head-judge',
        phase: 'direct',
        stage: 'Witness called',
        issue: witnessIssue,
      request: `${getAgentDisplayName(witness)}, focus on this issue: ${witnessIssue}.${contextInstruction} Give the useful evidence, the limit, the tool/source path you checked, and the next question. Do not decide the case.`,
      })
    }
    steps.push({
      agentId: witness,
      phase: 'direct',
      stage: `Direct testimony: ${getAgentDisplayName(witness)}`,
      issue: witnessIssue,
      request: `${getWitnessDirectQuestion(witness)}${contextInstruction} Explain what matters, why it matters for the forecast, what tool/source path you checked, and what it cannot prove. Issue: ${witnessIssue}.`,
    })
    steps.push({
      agentId: 'bull-counsel',
      phase: 'direct',
      stage: `Direct examination by Solon`,
      issue: witnessIssue,
      targetAgentId: witness,
      request: `Ask ${getAgentDisplayName(witness)} one sharp Yes-side question on ${witnessIssue}. Directly answer Draco if relevant, then pin down the mechanism, child/sibling comparison, deadline or shared-trigger fit, missing proof, proxy/reference class, bounded estimate, or next data check. Do not speechify.`,
    })
    steps.push({
      agentId: witness,
      phase: 'direct',
      stage: `${getAgentDisplayName(witness)} answers Solon`,
      issue: witnessIssue,
      request: `Answer Solon directly. Separate observed evidence from inference. Say what would strengthen the point.`,
    })
    steps.push({
      agentId: 'bear-counsel',
      phase: 'cross',
      stage: `Cross-examination by Draco`,
      issue: witnessIssue,
      targetAgentId: witness,
      request: `Ask ${getAgentDisplayName(witness)} one sharp No-side question on ${witnessIssue}. Directly attack Solon's last bridge, expose the blocker, test sibling probability theft or shared-trigger timing, or force the witness to name the data source, proxy/reference class, bounded estimate, or confidence cap. Do not repeat Solon.`,
    })
    steps.push({
      agentId: witness,
      phase: 'cross',
      stage: `${getAgentDisplayName(witness)} answers Draco`,
      issue: witnessIssue,
      request: `Answer Draco directly. Admit limits and preserve only supported points.`,
    })
    if (allowRedirects) {
      steps.push({
        agentId: 'bull-counsel',
        phase: 'redirect',
        stage: `Redirect by Solon`,
        issue: witnessIssue,
        targetAgentId: witness,
        request: `Redirect ${getAgentDisplayName(witness)} on one point only, or concede the gap.`,
      })
      steps.push({
        agentId: witness,
        phase: 'redirect',
        stage: `${getAgentDisplayName(witness)} answers redirect`,
        issue: witnessIssue,
        request: `Answer redirect narrowly: best supported point, exact limit, forecast weight.`,
      })
      steps.push({
        agentId: 'head-judge',
        phase: 'judge-question',
        stage: `Judicial clarification for ${getAgentDisplayName(witness)}`,
        issue: witnessIssue,
        request: `Clarify this issue briefly: what is admitted, what is limited, and what remains unknown. Issue: ${witnessIssue}.`,
      })
    }
    steps.push({
      agentId: 'head-judge',
      phase: 'admission',
      stage: `Ruling on ${getAgentDisplayName(witness)} testimony`,
      issue: witnessIssue,
      request:
        `Rule on this testimony in a few lines: admitted point, limit, and forecast weight for ${witnessIssue}.`,
    })
  }

  steps.push(
    {
      agentId: 'evidence-clerk',
      phase: 'admission',
      stage: 'Evidence admitted',
      request:
        `File the admitted record only: direct status, Yes catalysts/pathways, No blockers, sibling outcome pressure if any, unresolved gaps, and low-weight material. Issues: ${issueList}.`,
    },
    {
      agentId: 'bull-counsel',
      phase: 'closing',
      stage: 'Closing argument: affirmative',
      request:
        `Give a focused Yes closing from admitted evidence only. State the best pathway, answer the main No attack, name the main weakness, and give the verdict/probability range you want. For event-wide or event-referenced cases, close with the filed child plus material siblings and why the Yes/ranked posture follows. Issues: ${issueList}.`,
    },
    {
      agentId: 'bear-counsel',
      phase: 'closing',
      stage: 'Closing argument: negative',
      request:
        `Give a focused No closing from admitted evidence only. State the strongest blocker, answer the best Yes pathway, admit residual tail risk, and give the verdict/probability range you want. For event-wide or event-referenced cases, close with the filed child plus material siblings and why sibling pressure or trigger timing blocks the Yes/ranked posture. Issues: ${issueList}.`,
    },
    {
      agentId: 'risk-bailiff',
      phase: 'risk-instruction',
      stage: 'Risk instruction',
      request:
        `Give confidence caps, flip conditions, and what the court must not infer. Issues: ${issueList}.`,
    },
    {
      agentId: 'head-judge',
      phase: 'calibration',
      stage: 'Calibration conference',
      request:
        `Calibrate the record before verdict: base case, strongest Yes pathway, strongest No blocker, sibling outcome pressure if any, probability range, confidence cap, and biggest update trigger. For event-wide or event-referenced cases, include a child-market/ranked-outcome table in prose. Issues: ${issueList}.`,
    },
  )

  if (jurors.length) {
    steps.push({
      agentId: 'head-judge',
      phase: 'jury-instruction',
      stage: 'Magistrate instructs Dikasts',
      request:
        `Instruct the Dikasts to vote from admitted evidence only. Issues: ${issueList}.`,
    })
  }

  for (const juror of jurors) {
    steps.push({
      agentId: juror,
      phase: 'deliberation',
      stage: `Dikast vote: ${getAgentDisplayName(juror)}`,
      request:
        `Vote from your assigned lens. Keep it short: side, confidence, accepted bridge, one reservation. Issues: ${issueList}.`,
    })
  }

  steps.push(
    {
      agentId: 'head-judge',
      phase: 'verdict',
      stage: 'Verdict',
      request:
        `Issue the probabilistic verdict. If a specific child contract/outcome was filed, name it and compare it against material siblings. If the link was event-wide with no selected child outcome, do not invent a proxy; rank the leading outcomes or issue no-edge/event-wide forecast posture. If this is an event-referenced filing, preserve the filed child and give per-child/ranked sibling pressure before the bottom line. If the market is numeric, pseudo-numeric, date-based, distributional, or scalar, do not pick Yes/No; issue a range estimate, leading interval(s), median/percentile if supported, or no-edge numeric forecast. Only pick Yes, No, leaning Yes, or leaning No for a true binary threshold contract. Give a probability/value range, key catalyst/driver, key blocker, sibling/outcome pressure if relevant, confidence cap, and what would change your mind. Issues: ${issueList}.`,
    },
    {
      agentId: 'settlement-clerk',
      phase: 'settlement',
      stage: 'Judgment and receipt',
      request:
        'Prepare the settlement record: witness payments, counsel payments, protocol fee, record hash status, and caveats.',
    },
  )

  return steps
}

function getMarketScopeInstruction(marketCase: MarketCase) {
  const links = marketCase.links ?? []
  const hasPolymarketEventOnly = links.some((value) => {
    try {
      const url = new URL(value)
      if (!url.hostname.replace(/^www\./, '').endsWith('polymarket.com')) return false
      const segments = url.pathname.split('/').filter(Boolean)
      const eventIndex = segments.indexOf('event')
      return eventIndex >= 0 && Boolean(segments[eventIndex + 1]) && !segments[eventIndex + 2]
    } catch {
      return false
    }
  })
  const likelyMultiOutcome =
    hasPolymarketEventOnly
    || /\b(multi[- ]outcome|multiple-choice|event-wide|all listed outcomes|candidate-specific|driver-specific|team-specific|sibling outcomes|listed answers)\b/i.test(`${marketCase.question} ${marketCase.context ?? ''}`)
  const likelyNumericDistribution =
    /\b(pseudo[-_ ]?numeric|numeric\/distribution|distribution forecast|scalar market|outcome type (?:PSEUDO_NUMERIC|NUMERIC|DATE)|how old|what age|what year|which year|what price|how many|how much|when will)\b/i.test(`${marketCase.question} ${marketCase.context ?? ''}`)
  const likelyEventReferenced =
    /\b(resolves? (?:according to|based on|via|by reference to).*(?:polymarket|kalshi|manifold).*event|event markets?:|child markets?:|sibling markets?:)\b/i.test(`${marketCase.question} ${marketCase.context ?? ''}`)
  const likelySharedTriggerRace =
    /\b(before|after)\s+(?:gta\s*vi|gta\s*6|release|launch|election|meeting|deadline|earnings|primary|final|tournament|season|halving|fork|vote)\b/i.test(`${marketCase.question} ${marketCase.context ?? ''}`)

  if (!likelyMultiOutcome && !likelyNumericDistribution && !likelyEventReferenced && !likelySharedTriggerRace) return ''

  return [
    ' Market-scope instruction:',
    'if the supplied link resolves to an event page and child markets/outcomes are present, this is an event-wide hearing.',
    'If a binary market resolves by reference to another event page, preserve the filed child and use the referenced child list as sibling calibration; do not collapse the debate into a generic Yes/No page-title argument.',
    'For before/after shared-trigger markets, anchor the trigger from official/current sources first, then compare whether each child event happens before or after that trigger.',
    'If the supplied market is numeric, pseudo-numeric, date-based, distributional, or scalar, this is a non-binary hearing: estimate/rank ranges or intervals instead of forcing Yes/No.',
    'If the link returns 404 or direct market data cannot resolve it, treat the filed market as missing/invalid and use nearby markets only as low-weight proxies.',
    'Counsel must compare/rank listed outcomes, child markets, ranges, intervals, and sibling pressure instead of declaring the case defective or silently choosing a proxy candidate/team.',
    'Only call it ambiguous if the question itself asks for one specific child outcome but the link/metadata cannot identify which child was filed.',
  ].join(' ')
}

function selectWitnesses(witnesses: string[]) {
  const allowed = new Set(witnessAgentIds)
  const selected = prioritizeWitnesses(unique(witnesses).filter((witness) => allowed.has(witness)))
  const defaultMaxWitnesses = process.env.HELIA_HEARING_MODE === 'exhaustive' ? selected.length : process.env.HELIA_HEARING_MODE === 'full' ? 5 : 4
  const maxWitnesses = Number(process.env.HELIA_MAX_HEARING_WITNESSES ?? defaultMaxWitnesses)
  const limited = Number.isFinite(maxWitnesses) && maxWitnesses > 0 ? selected.slice(0, maxWitnesses) : selected

  return limited.length ? limited : ['pythia-prediction-witness', 'hermes-news-witness', 'sophia-research-witness']
}

function selectIssues(issues: string[]) {
  const baseIssues = [
    'Court clock, deadline, reporting lag, and current window are clear',
    'Reference class, base rate, and market context are calibrated without treating market odds as proof',
    'The strongest Yes pathway and tail-risk scenario are concrete enough to move probability',
    'The strongest No blockers, mitigations, and missing bridges are concrete enough to cap probability',
  ]

  return unique([...baseIssues, ...issues]).slice(0, process.env.HELIA_HEARING_MODE === 'exhaustive' ? 6 : 4)
}

export function buildMagistrateDirectionTurn(
  marketCase: MarketCase,
  step: CourtProcedureStep,
  transcript: CourtTranscriptTurn[],
): CourtTranscriptTurn | undefined {
  if (step.agentId === 'court-clerk') return undefined
  if (step.agentId === 'head-judge') return undefined
  if (process.env.HELIA_SHOW_DIRECTIONS !== 'true') return undefined

  const id = `turn-${transcript.length + 1}-head-judge-direction`
  const priorTurn = transcript.at(-1)

  return {
    id,
    caseId: marketCase.id,
    agentId: 'head-judge',
    agentName: 'Archon',
    speaker: 'Archon',
    seat: 'head-judge',
    kind: 'direction',
    stage: getDirectionStage(step),
    message: buildPublicDirectionMessage(step),
    replyToId: priorTurn?.id,
    requestedAgentId: step.agentId,
    request: buildPublicRequest(step),
    createdAt: new Date().toISOString(),
    tags: [step.phase, 'direction'],
  }
}

export function applyProcedureHandoff(artifact: CourtArtifact, step: CourtProcedureStep) {
  if (step.phase === 'opening') {
    applyOpeningBoundary(artifact)
  }

  if (step.targetAgentId) {
    const modelRequest = artifact.request
    const modelRequestedAgentId = artifact.requestedAgentId
    if (!modelRequestedAgentId) {
      artifact.requestedAgentId = step.targetAgentId
      artifact.request = modelRequest || step.request
    } else if (modelRequestedAgentId === step.targetAgentId) {
      artifact.requestedAgentId = step.targetAgentId
      artifact.request = modelRequest || step.request
    } else {
      artifact.requestedAgentId = modelRequestedAgentId
      artifact.request = modelRequest || step.request
      artifact.notes = [
        ...(artifact.notes ?? []),
        `Counsel redirected the examination from ${step.targetAgentId} to ${modelRequestedAgentId}.`,
      ]
    }
  }

  return artifact
}

function applyOpeningBoundary(artifact: CourtArtifact) {
  artifact.claims = []
  artifact.confidence = Math.min(artifact.confidence ?? 0.5, 0.45)
  artifact.notes = [...(artifact.notes ?? []), 'Opening boundary: no factual claims are admitted before witness testimony.']
}

export function getTurnKindForPhase(step: CourtProcedureStep): CourtTranscriptTurn['kind'] {
  if (step.phase === 'docket' || step.phase === 'opening') return 'opening'
  if (step.phase === 'direct' || step.phase === 'cross' || step.phase === 'redirect' || step.phase === 'judge-question') {
    return witnessAgentIds.includes(step.agentId) ? 'testimony' : 'question'
  }
  if (step.phase === 'admission') return step.agentId === 'head-judge' ? 'verdict' : 'exhibit'
  if (step.phase === 'closing') return 'argument'
  if (step.phase === 'risk-instruction') return 'risk'
  if (step.phase === 'calibration') return 'verdict'
  if (step.phase === 'jury-instruction') return 'verdict'
  if (step.phase === 'deliberation') return 'vote'
  if (step.phase === 'verdict') return 'verdict'
  if (step.phase === 'settlement') return 'receipt'

  return 'argument'
}

function getRelevantWitnesses(marketCase: MarketCase) {
  const configuredWitnesses = getConfiguredWitnesses()
  if (configuredWitnesses.length) return configuredWitnesses

  const question = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''}`.toLowerCase()
  const genres = getMarketGenres(question)
  const witnesses: string[] = []
  const asksOnchain = /\b0x[a-f0-9]{40}\b/i.test(question) || /\b(wallet|onchain|exchange flow|address|stablecoin|transfer)\b/.test(question)
  const asksDatasetWitness = genres.some((genre) => ['sports', 'weather', 'macro', 'transport'].includes(genre))
    || /\b(weather|rain|storm|flood|wind|temperature|sport|match|team|roster|calendar|holiday|market quote|price quote|business day)\b/.test(question)
  const asksStructuredExternalData = marketCase.type === 'real-world-event' || asksDatasetWitness || genres.includes('health')
  const asksExactPageScrape = /https?:\/\//i.test(question)
  const asksVisualEvidence = /\b(image|photo|picture|screenshot|visual|chart|graph|map|diagram|market card|read image|screen grab|screengrab)\b/.test(question)
  const asksMarketPriceOrOdds = genres.some((genre) => ['crypto', 'macro', 'business'].includes(genre)) || /\b(odds|market|probability|price|reach|outperform|underperform|rally|selloff)\b/.test(question)
  const asksNews = genres.length > 0 || /\b(news|headline|report|source|fresh|public|announce|announcement|narrative)\b/.test(question)

  if (asksDatasetWitness) {
    witnesses.push('notus-weather-data-witness')
  }

  if (asksStructuredExternalData) {
    witnesses.push('hermes-news-witness')
  }

  if (asksExactPageScrape || asksStructuredExternalData || asksNews) {
    witnesses.push('web-scraper-witness')
  }

  if (asksVisualEvidence) {
    witnesses.push('visual-evidence-witness')
  }

  if (marketCase.context || asksExactPageScrape || asksNews || asksStructuredExternalData) {
    witnesses.push('skepsis-source-quality-witness')
  }

  if (marketCase.context || /\b(within|next|today|tomorrow|hours?|days?|week|deadline|horizon|before|after|during|expiry|202\d|203\d)\b/.test(question)) {
    witnesses.push('chronos-timeline-witness')
  }

  if (marketCase.context || asksNews || asksExactPageScrape || marketCase.type === 'real-world-event') {
    witnesses.push('sophia-research-witness')
  }

  if (marketCase.type === 'prediction-market' || asksMarketPriceOrOdds) {
    witnesses.push('pythia-prediction-witness')
    witnesses.push('numeros-quant-witness')
    if (asksNews || asksMarketPriceOrOdds) witnesses.push('hermes-news-witness')
  }

  if (genres.includes('social') && /\b(tweet|tweets|post|posts|followers|mentions?|#|number|count)\b/.test(question)) {
    witnesses.push('social-count-witness', 'chronos-timeline-witness', 'skepsis-source-quality-witness')
  }

  if (asksOnchain) {
    witnesses.push('argos-onchain-witness')
    if (asksNews) witnesses.push('hermes-news-witness')
  }

  if (!witnesses.length) {
    witnesses.push('pythia-prediction-witness', 'hermes-news-witness')
  }

  const selected = unique(witnesses)
  const defaultMaxWitnesses = process.env.HELIA_HEARING_MODE === 'exhaustive' ? selected.length : process.env.HELIA_HEARING_MODE === 'full' ? 5 : 4
  const maxWitnesses = Number(process.env.HELIA_MAX_HEARING_WITNESSES ?? defaultMaxWitnesses)

  return Number.isFinite(maxWitnesses) && maxWitnesses > 0 ? prioritizeWitnesses(selected).slice(0, maxWitnesses) : prioritizeWitnesses(selected)
}

function prioritizeWitnesses(witnesses: string[]) {
  const priority = [
    'hermes-news-witness',
    'web-scraper-witness',
    'pythia-prediction-witness',
    'chronos-timeline-witness',
    'skepsis-source-quality-witness',
    'sophia-research-witness',
    'numeros-quant-witness',
    'visual-evidence-witness',
    'social-count-witness',
    'notus-weather-data-witness',
    'argos-onchain-witness',
  ]

  return witnesses.slice().sort((a, b) => {
    const left = priority.indexOf(a)
    const right = priority.indexOf(b)
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right)
  })
}

function getConfiguredWitnesses() {
  const configured = process.env.HELIA_HEARING_WITNESSES
  if (!configured) return []

  const allowed = new Set(witnessAgentIds)

  return configured
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => allowed.has(value))
}

function getWitnessDirectQuestion(agentId: string) {
  if (agentId === 'pythia-prediction-witness') return 'Testify on prediction-market odds, market liquidity, price context, and how much the market data can or cannot move the forecast.'
  if (agentId === 'hermes-news-witness') return 'Testify on fresh news/source flow, stale claims, source timing, catalysts, blockers, and what public information can or cannot support.'
  if (agentId === 'argos-onchain-witness') return 'Testify on relevant wallet, exchange, contract, or stablecoin flows. If none are relevant, say so and explain the limit.'
  if (agentId === 'notus-weather-data-witness') return 'Testify only from supplied structured datasets: weather, sports, calendar, macro, or market quotes. State data quality, timing limits, and whether measured conditions support a Yes driver, No blocker, or no usable signal.'
  if (agentId === 'web-scraper-witness') return 'Scrape the supplied URL or cited page, extract exact page claims, dates, source identity, and relevance to the resolution criteria. State how the page can or cannot support a forecast inference.'
  if (agentId === 'visual-evidence-witness') return 'Inspect supplied images or page screenshots for visible text, chart values, timestamps, logos, source identity, and visual-only claims. State how the visual can or cannot support a forecast inference.'
  if (agentId === 'skepsis-source-quality-witness') return 'Grade source authority, freshness, directness, conflicts, and how much the source record should move the forecast. Do not decide the event.'
  if (agentId === 'chronos-timeline-witness') return 'Build the event chronology from dated sources, publication timing, horizon language, and calendar evidence. State whether timing creates a catalyst, blocker, or unknown.'
  if (agentId === 'sophia-research-witness') return 'Synthesize broad research from supplied sources, separating direct support, forecast drivers, blockers, background context, contradiction, missing evidence, and the best proxy/reference class when exact data is absent.'
  if (agentId === 'numeros-quant-witness') return 'Testify on numerical market anchors: price distance, liquidity, volatility, funding, proxy/reference classes, bounded ranges, and market-structure limits from supplied tools.'
  if (agentId === 'social-count-witness') return 'Testify on social activity counts: identify the account handle, counting window, inclusion/exclusion rules, exact count if available, audit sources, and limits. Search results alone are not an exact count.'

  return 'Testify on your specialist evidence and its limits.'
}

function getEvidentiaryIssues(marketCase: MarketCase) {
  const question = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''}`.toLowerCase()
  const genres = getMarketGenres(question)
  const issues = ['Relevant evidence exists and is current enough to forecast the case horizon']
  const likelyEventWide = /\b(polymarket\.com\/event\/[^/\s]+(?:\s|$)|multi[- ]outcome|multiple-choice|event-wide|candidate-specific|driver-specific|team-specific|sibling outcomes|listed outcomes|listed answers)\b/i.test(question)

  if (likelyEventWide) {
    issues.push('Event-wide scope is handled correctly: rank or compare listed outcomes unless a specific child contract is selected')
    issues.push('Placeholder/inactive outcomes are filtered before sibling outcome pressure is used')
  }

  issues.push('Yes-side catalysts and implementation path are concrete enough to move probability')
  issues.push('No-side blockers, inertia, ambiguity, or missing steps are concrete enough to resist the event')

  if (genres.some((genre) => ['weather', 'transport'].includes(genre))) {
    issues.push('Measured conditions or forecasts support a credible event pathway')
    issues.push('A direct source or dataset links the measured event to the claimed operational effect')
  }

  if (genres.some((genre) => ['crypto', 'macro', 'business'].includes(genre)) || /\b(odds|prediction|market|probability|price)\b/.test(question)) {
    issues.push('Market odds or price data are relevant and liquid enough to use as context')
    issues.push('Non-market evidence supports the directional inference without merely copying market probability')
  }

  if (genres.includes('sports')) {
    issues.push('Sports roster, eligibility, health, selection, and appearance clues match the resolution criteria')
    issues.push('Official or credible sources can verify the relevant sports status or resolution event')
  }

  if (genres.some((genre) => ['politics', 'geopolitics', 'legal-regulatory'].includes(genre))) {
    issues.push('Official statements, legal text, or credible reporting show a concrete policy or event pathway')
    issues.push('Diplomatic, political, or legal wording affects the market resolution criteria rather than adjacent news only')
  }

  if (genres.some((genre) => ['business', 'culture', 'health', 'science-tech', 'social'].includes(genre))) {
    issues.push('Primary or credible sources identify named entities, incentives, constraints, metrics, or quote risk')
    issues.push('The observed signal maps to the market wording rather than a related proxy')
  }

  if (genres.includes('social') || /\b(tweet|tweets|post|posts|followers|mentions?)\b/i.test(question)) {
    issues.push('The account identity, count window, timezone, and inclusion rules are explicit enough to audit')
    issues.push('The social activity count comes from an authoritative provider, archive, or reproducible source trail')
  }

  if (/\b(wallet|onchain|exchange flow|address|stablecoin|transfer|0x[a-f0-9]{40})\b/i.test(question)) {
    issues.push('Onchain activity is identified and relevant to the case question')
    issues.push('Entity, exchange, or wallet-flow interpretation is supported rather than assumed')
  }

  issues.push('Market odds and liquidity are useful context but not treated as proof')
  issues.push('Material gaps, uncertainty, and invalidation conditions are explicit before verdict')
  issues.push('Source quality, timing, and directness are sufficient for the forecast weight counsel asks the court to give them')

  return unique(issues)
}

function getWitnessIssue(agentId: string, issues: string[]) {
  if (agentId === 'notus-weather-data-witness') {
    return issues.find((issue) => issue.includes('Sports roster')) ?? issues.find((issue) => issue.includes('Measured conditions')) ?? issues[0]
  }
  if (agentId === 'hermes-news-witness') {
    return issues.find((issue) => issue.includes('Official or credible sources')) ?? issues.find((issue) => issue.includes('credible reporting')) ?? issues.find((issue) => issue.includes('concrete policy')) ?? issues[0]
  }
  if (agentId === 'web-scraper-witness') {
    return issues.find((issue) => issue.includes('Official or credible sources')) ?? issues.find((issue) => issue.includes('source')) ?? issues[0]
  }
  if (agentId === 'visual-evidence-witness') {
    return issues.find((issue) => issue.includes('observed signal')) ?? issues.find((issue) => issue.includes('source')) ?? issues[0]
  }
  if (agentId === 'skepsis-source-quality-witness') {
    return issues.find((issue) => issue.includes('Source quality')) ?? issues.find((issue) => issue.includes('Official or credible sources')) ?? issues[0]
  }
  if (agentId === 'chronos-timeline-witness') {
    return issues.find((issue) => issue.includes('current enough')) ?? issues.find((issue) => issue.includes('timing')) ?? issues[0]
  }
  if (agentId === 'sophia-research-witness') {
    return issues.find((issue) => issue.includes('Material gaps')) ?? issues.find((issue) => issue.includes('Source quality')) ?? issues[0]
  }
  if (agentId === 'numeros-quant-witness') {
    return issues.find((issue) => issue.includes('Market odds')) ?? issues.find((issue) => issue.includes('market probability')) ?? issues[0]
  }
  if (agentId === 'social-count-witness') {
    return issues.find((issue) => issue.includes('social activity count')) ?? issues.find((issue) => issue.includes('account identity')) ?? issues[0]
  }
  if (agentId === 'pythia-prediction-witness') {
    return issues.find((issue) => issue.includes('Market odds')) ?? issues[0]
  }
  if (agentId === 'argos-onchain-witness') {
    return issues.find((issue) => issue.includes('Onchain activity')) ?? issues[0]
  }

  return issues[0]
}

function getJurorPanel(marketCase: MarketCase) {
  const question = marketCase.question.toLowerCase()

  if (/\b(momentum|trend|price|breakout|rally|selloff)\b/.test(question)) {
    return ['dikast-momentum', 'dikast-skeptic', 'dikast-risk']
  }

  if (marketCase.type === 'real-world-event' || /\b(weather|risk|uncertain|disrupt|delay)\b/.test(question)) {
    return ['dikast-skeptic', 'dikast-risk', 'dikast-momentum']
  }

  return ['dikast-skeptic', 'dikast-risk', 'dikast-momentum']
}

function getDirectionStage(step: CourtProcedureStep) {
  if (step.phase === 'direct') return 'Magistrate directs examination'
  if (step.phase === 'cross') return 'Magistrate permits cross-examination'
  if (step.phase === 'admission') return 'Magistrate requests evidence filing'
  if (step.phase === 'closing') return 'Magistrate calls closing argument'
  if (step.phase === 'risk-instruction') return 'Magistrate requests risk instruction'
  if (step.phase === 'calibration') return 'Magistrate orders calibration memo'
  if (step.phase === 'deliberation') return 'Magistrate polls Dikasts'
  if (step.phase === 'settlement') return 'Magistrate orders receipt'

  return 'Magistrate direction'
}

function getAgentDisplayName(agentId: string) {
  const names: Record<string, string> = {
    'court-clerk': 'Mnemon',
    'pythia-prediction-witness': 'Pythia',
    'hermes-news-witness': 'Hermes',
    'argos-onchain-witness': 'Argos',
    'notus-weather-data-witness': 'Notus',
    'web-scraper-witness': 'Aletheia',
    'visual-evidence-witness': 'Eikon',
    'skepsis-source-quality-witness': 'Skepsis',
    'chronos-timeline-witness': 'Chronos',
    'sophia-research-witness': 'Sophia',
    'numeros-quant-witness': 'Numeros',
    'social-count-witness': 'Thales',
    'evidence-clerk': 'Kleio',
    'bull-counsel': 'Solon',
    'bear-counsel': 'Draco',
    'risk-bailiff': 'Phylax',
    'dikast-momentum': 'Kallias',
    'dikast-skeptic': 'Thraso',
    'dikast-risk': 'Sophon',
    'head-judge': 'Archon',
    'settlement-clerk': 'Nomisma',
  }

  return names[agentId] ?? agentId
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function buildPublicDirectionMessage(step: CourtProcedureStep) {
  const agent = getAgentDisplayName(step.agentId)

  if (step.phase === 'opening') return `${agent}, give a short opening statement. Preview your forecast theory, but do not treat any disputed fact as established yet.`
  if (step.phase === 'direct' && witnessAgentIds.includes(step.agentId)) return `${agent}, testify on ${step.issue ?? 'your assigned issue'} using only your supplied tool evidence, drivers, blockers, and source limits.`
  if (step.phase === 'direct') return `${agent}, examine the witness on ${step.issue ?? 'the assigned issue'} and ask for the strongest forecast driver plus the missing link.`
  if (step.phase === 'cross' && witnessAgentIds.includes(step.agentId)) return `${agent}, answer cross-examination directly. Admit limits and separate observed evidence from inference.`
  if (step.phase === 'cross') return `${agent}, cross-examine the witness and press the weakest link in the evidence.`
  if (step.phase === 'redirect' && witnessAgentIds.includes(step.agentId)) return `${agent}, answer redirect narrowly: strongest supported fact, exact limit, and remaining gap.`
  if (step.phase === 'redirect') return `${agent}, redirect on one point only and keep the record narrow.`
  if (step.phase === 'admission') return `${agent}, file or rule on admitted facts, forecast weight, and excluded inference without adding new facts.`
  if (step.phase === 'closing') return `${agent}, give closing argument from admitted evidence and labeled forecast bridges only.`
  if (step.phase === 'risk-instruction') return `${agent}, give issue-by-issue risk caps, flip conditions, and invalidation warnings.`
  if (step.phase === 'calibration') return `${agent}, calibrate the record into scenario branches and a probability range without issuing final verdict yet.`
  if (step.phase === 'deliberation') return `${agent}, vote issue by issue with one probability reservation.`
  if (step.phase === 'settlement') return `${agent}, prepare the settlement receipt and caveats.`

  return `${agent}, proceed on ${step.issue ?? 'the assigned issue'}.`
}

function buildPublicRequest(step: CourtProcedureStep) {
  if (step.issue) return step.issue
  if (step.phase === 'opening') return 'Opening statement'
  if (step.phase === 'closing') return 'Closing argument'
  if (step.phase === 'settlement') return 'Settlement receipt'

  return step.stage
}
