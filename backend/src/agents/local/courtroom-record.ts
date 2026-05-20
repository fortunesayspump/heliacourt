import type { AgentContext, CourtArtifact, ToolEvidence } from '../../court/types'

export type RecordBrief = {
  primaryFacts: string[]
  supportingFacts: string[]
  gaps: string[]
  witnessFacts: string[]
  admittedFacts: string[]
  affirmativeArguments: CourtArtifact[]
  negativeArguments: CourtArtifact[]
  votes: CourtArtifact[]
}

export function buildRecordBrief(context: AgentContext): RecordBrief {
  const okEvidence = context.toolEvidence?.filter((evidence) => evidence.status === 'ok') ?? []
  const primaryFacts = collectEvidenceFacts(okEvidence.filter((evidence) => evidence.relevance === 'primary'), 5)
  const supportingFacts = collectEvidenceFacts(okEvidence.filter((evidence) => evidence.relevance !== 'primary'), 5)
  const witnessFacts = context.artifacts
    .filter((artifact) => artifact.type === 'witness-testimony')
    .flatMap((artifact) => artifact.claims ?? [])
    .filter(Boolean)
    .slice(-8)
  const rawGaps = [
    ...collectEvidenceFacts(context.toolEvidence?.filter((evidence) => evidence.status !== 'ok') ?? [], 4),
    ...collectArtifactRisks(context.artifacts, 6),
  ]
  const hasMeritsFacts = primaryFacts.length > 0 || witnessFacts.length > 0
  const gaps = rawGaps
    .filter((gap) => !/Opening only|No evidence has been admitted yet/i.test(gap) || !hasMeritsFacts)
    .filter((gap) => !/No EVM or Solana address was found/i.test(gap))
  const admittedFacts = context.artifacts
    .filter((artifact) => artifact.type === 'evidence')
    .flatMap((artifact) => artifact.claims ?? [])
    .filter(Boolean)
    .slice(-8)
  const affirmativeArguments = context.artifacts.filter((artifact) => artifact.agentId === 'bull-counsel' && artifact.type === 'argument')
  const negativeArguments = context.artifacts.filter((artifact) => artifact.agentId === 'bear-counsel' && artifact.type === 'argument')
  const votes = context.artifacts.filter((artifact) => artifact.type === 'jury-vote')

  return {
    primaryFacts: uniqueStrings(primaryFacts),
    supportingFacts: uniqueStrings(supportingFacts),
    gaps: uniqueStrings(gaps),
    witnessFacts: uniqueStrings(witnessFacts),
    admittedFacts: uniqueStrings(admittedFacts),
    affirmativeArguments,
    negativeArguments,
    votes,
  }
}

export function issueFromInstruction(context: AgentContext) {
  const instruction = context.courtInstruction ?? ''
  const issueMatch =
    instruction.match(/issue: ([^.,]+)(?:\.|,)/i) ??
    instruction.match(/this issue: ([^.,]+)(?:\.|,)/i) ??
    instruction.match(/for this issue: ([^.,]+)(?:\.|,)/i) ??
    instruction.match(/issue: ([\s\S]+?)(?:\.|$)/i)
  const strongestMatch = instruction.match(/strongest admitted fact for this issue: ([^,]+),/i)

  const issue = (issueMatch?.[1] ?? strongestMatch?.[1] ?? 'the court-defined issue').trim()
  return /^\d+$/.test(issue) ? 'all evidentiary issues' : issue
}

export function formatList(items: string[], fallback: string, max = 3) {
  const selected = items.map(cleanRecordText).filter(Boolean).slice(0, max)
  if (!selected.length) return fallback

  return selected.map((item, index) => `${index + 1}. ${item}`).join(' ')
}

export function summarizeVerdictPosture(brief: RecordBrief) {
  const record = [...brief.primaryFacts, ...brief.supportingFacts, ...brief.witnessFacts, ...brief.admittedFacts]
  const affirmativeText = brief.affirmativeArguments.map(formatArtifactForScoring).join(' ')
  const negativeText = brief.negativeArguments.map(formatArtifactForScoring).join(' ')
  const recordText = record.join(' ')
  const gapText = brief.gaps.join(' ')
  const hasDirectAppearanceSignal = /\b(took the field|appeared|played|match participation|official match)\b/i.test(recordText)
  const hasRosterOrEligibilitySignal = /\b(squad|roster|eligible|named to|called up|national team)\b/i.test(recordText)
  const hasOfficialOrPrimarySupport = /\b(primary source|official|fifa|sec\.gov|federalreserve|government|source quality: primary)\b/i.test(recordText)
  const hasSourceGap = /\b(no direct evidence|missing|gap|does not prove|unproven|no concrete|did not expose|not an official|weak bridge|blocker)\b/i.test(`${gapText} ${negativeText}`)
  const affirmativeClosesGap = /\b(admitted evidence|turn-|source confirms|verified|supports|catalyst|driver|implementation path|yes forecast)\b/i.test(affirmativeText)
  const negativeKeepsGapOpen = /\b(no direct evidence|cannot substitute|overread|missing|gap|strike|no-edge|blocker|weak bridge|downweight)\b/i.test(negativeText)

  if (hasDirectAppearanceSignal && hasOfficialOrPrimarySupport && affirmativeClosesGap) {
    return { label: 'leaning Yes on the admitted forecast record', confidence: 0.72 }
  }
  if (hasRosterOrEligibilitySignal && affirmativeClosesGap && !negativeKeepsGapOpen) {
    return { label: 'leaning Yes with unresolved resolution risk', confidence: 0.64 }
  }
  if (hasRosterOrEligibilitySignal && (negativeKeepsGapOpen || hasSourceGap)) {
    return { label: 'watchlist with roster support but limited appearance forecast weight', confidence: 0.58 }
  }

  const hasWeatherRisk = brief.primaryFacts.some((fact) => /precipitation|rain|wet hours|forecast/i.test(fact))
  const hasDirectImpact = [...brief.primaryFacts, ...brief.supportingFacts, ...brief.witnessFacts].some((fact) =>
    /direct.*(disrupt|delay|impact)|port.*(disrupt|delay)|logistics.*(disrupt|delay)/i.test(fact),
  )
  const hasFreshDirectNews = brief.supportingFacts.some((fact) => /fresh-news|fresh news|web\/news result|gdelt|brave|tavily|serpapi/i.test(fact))

  if (hasWeatherRisk && hasDirectImpact) return { label: 'leaning Yes on weather-risk drivers', confidence: 0.68 }
  if (hasWeatherRisk && (hasFreshDirectNews || brief.supportingFacts.length)) return { label: 'watchlist with a slight Yes edge', confidence: 0.6 }
  if (hasWeatherRisk) return { label: 'weather-risk watchlist with limited impact bridge', confidence: 0.56 }

  const hasReleaseSignal = /\b(released|declassified|files|documents|uap|ufo|extraterrestrial|unidentified anomalous)\b/i.test(recordText)
  const hasTimingSignal = /\b(deadline|by may|may 15|11:59|published|friday|date|timeline)\b/i.test(recordText)
  if (hasReleaseSignal && hasOfficialOrPrimarySupport && affirmativeClosesGap && !negativeKeepsGapOpen) {
    return { label: 'leaning Yes on release-path evidence', confidence: 0.66 }
  }
  if (hasReleaseSignal && (hasTimingSignal || affirmativeClosesGap) && !negativeKeepsGapOpen) {
    return { label: 'leaning Yes with source-quality caveats', confidence: 0.6 }
  }
  if (hasReleaseSignal && negativeKeepsGapOpen) {
    return { label: 'watchlist with Yes catalyst but unresolved source/timing bridge', confidence: 0.56 }
  }

  const hasHealthOutbreakContext = /\b(ebola|outbreak|cdc|who|virus|laboratory-confirmed|confirmed case|disease)\b/i.test(recordText)
  const hasOutbreakCatalyst = /\b(outbreak|mobilized|global health emergency|international response|surge|reported outbreak)\b/i.test(recordText)
  const hasNoUsCaseSignal = /\b(no suspected, probable, or confirmed .*?(united states|u\.s\.|us)|no .*?confirmed .*?(united states|u\.s\.|us)|no .*?cases .*?(united states|u\.s\.|us))\b/i.test(recordText)
  const hasLowUsRiskSignal = /\b(risk .*?(low|considered low)|low .*?risk)\b/i.test(recordText)

  if (hasHealthOutbreakContext && hasNoUsCaseSignal && hasLowUsRiskSignal && hasOutbreakCatalyst) {
    return { label: 'leaning No but low-nonzero outbreak watchlist', confidence: 0.58 }
  }
  if (hasHealthOutbreakContext && hasNoUsCaseSignal && hasLowUsRiskSignal) {
    return { label: 'leaning No on current official case signals', confidence: 0.58 }
  }
  if (hasHealthOutbreakContext && hasNoUsCaseSignal) {
    return { label: 'watchlist with current No blocker', confidence: 0.56 }
  }
  if (hasHealthOutbreakContext && hasOutbreakCatalyst) {
    return { label: 'watchlist with a Yes catalyst but no U.S. confirmation bridge', confidence: 0.57 }
  }

  return { label: 'no-edge on the present forecast record', confidence: 0.52 }
}

function formatArtifactForScoring(artifact: CourtArtifact) {
  return [artifact.summary, artifact.transcriptMessage, ...(artifact.claims ?? []), ...(artifact.risks ?? [])].filter(Boolean).join(' ')
}

export function makeArtifact(
  context: AgentContext,
  patch: Partial<CourtArtifact> & Pick<CourtArtifact, 'agentId' | 'summary' | 'type'>,
): CourtArtifact {
  return {
    id: `${context.marketCase.id}-${patch.agentId}-${context.courtPhase ?? 'turn'}`,
    caseId: context.marketCase.id,
    costUsd: 0,
    createdAt: new Date().toISOString(),
    ...patch,
  }
}

function collectEvidenceFacts(evidence: ToolEvidence[], max: number) {
  return evidence
    .flatMap((item) => item.observations)
    .filter(Boolean)
    .map(cleanRecordText)
    .filter(Boolean)
    .slice(0, max)
}

function collectArtifactRisks(artifacts: CourtArtifact[], max: number) {
  return artifacts
    .flatMap((artifact) => artifact.risks ?? [])
    .filter(Boolean)
    .map(cleanRecordText)
    .filter(Boolean)
    .slice(-max)
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(cleanRecordText).filter(Boolean)))
}

export function cleanRecordText(value: string) {
  const compacted = value
    .replace(/^(duckduckgo-html|bing-html|brave|serpapi|tavily|gdelt)\s+web\/news result:\s*/i, '')
    .replace(/^[^-]{12,150}\s+-\s+(?=\S)/, '')
    .replace(/^Scraped\s+/i, '')
    .replace(/\s+via\s+(?:static-readability|static-cheerio|browser-render|public-endpoint)[\s\S]*$/i, '')
    .replace(/\s+Source quality:[\s\S]*$/i, '')
    .replace(/\s+Content hash:\s*[a-f0-9]+\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (isRecordNoise(compacted)) return ''

  return compacted.slice(0, 220)
}

export function compactRecordItems(values: Array<string | undefined>, max = 4) {
  return uniqueStrings(values.filter((value): value is string => Boolean(value))).slice(0, max)
}

export function buildWitnessSpeech(params: {
  role: string
  findings: Array<string | undefined>
  supports?: string
  limits: Array<string | undefined>
  fallback?: string
}) {
  const findings = compactRecordItems(params.findings, 4)
  const limits = compactRecordItems(params.limits, 3)

  if (!findings.length) {
    return `${params.role}: ${params.fallback ?? 'I do not have usable evidence for that.'}${limits.length ? ` Limit: ${limits[0]}` : ''}`.trim()
  }

  return [
    `${params.role}: I found ${findings[0]}.`,
    params.supports ? `Forecast use: ${params.supports}` : undefined,
    limits.length ? `Limit: ${limits[0]}` : undefined,
  ].filter(Boolean).join(' ')
}

function isRecordNoise(value: string) {
  return /^(search plan|planner relevance|deterministic fallback search plan|supporting context|fallback context):/i.test(value)
    || /^No visual analysis could be completed\.?$/i.test(value)
    || /^Opening only\b/i.test(value)
    || /^No evidence has been admitted yet\.?$/i.test(value)
    || /^Kalshi public search responded, but no active market matched/i.test(value)
}
