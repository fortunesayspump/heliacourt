import { agentRegistry } from '../agents/registry'
import type { CourtArtifact, CourtTranscriptTurn, MarketCase } from './types'

type TranscriptBlueprint = {
  agentId: string
  kind: CourtTranscriptTurn['kind']
  stage: string
  replyToAgentId?: string
  tags?: string[]
}

export const hearingOrder: TranscriptBlueprint[] = [
  { agentId: 'court-clerk', kind: 'opening', stage: 'Call to order', tags: ['docket'] },
  { agentId: 'pythia-prediction-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'court-clerk', tags: ['odds'] },
  { agentId: 'hermes-news-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'court-clerk', tags: ['sources'] },
  { agentId: 'web-scraper-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'hermes-news-witness', tags: ['scrape'] },
  { agentId: 'visual-evidence-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'web-scraper-witness', tags: ['visual'] },
  { agentId: 'skepsis-source-quality-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'web-scraper-witness', tags: ['source-quality'] },
  { agentId: 'chronos-timeline-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'skepsis-source-quality-witness', tags: ['timeline'] },
  { agentId: 'sophia-research-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'chronos-timeline-witness', tags: ['research'] },
  { agentId: 'numeros-quant-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'pythia-prediction-witness', tags: ['quant'] },
  { agentId: 'social-count-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'chronos-timeline-witness', tags: ['social-count'] },
  { agentId: 'argos-onchain-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'court-clerk', tags: ['onchain'] },
  { agentId: 'notus-weather-data-witness', kind: 'testimony', stage: 'Witness testimony', replyToAgentId: 'court-clerk', tags: ['external-data'] },
  { agentId: 'evidence-clerk', kind: 'exhibit', stage: 'Evidence packet', replyToAgentId: 'notus-weather-data-witness', tags: ['exhibits'] },
  { agentId: 'bull-counsel', kind: 'argument', stage: 'Affirmative argument', replyToAgentId: 'evidence-clerk', tags: ['yes-case'] },
  { agentId: 'bear-counsel', kind: 'question', stage: 'Cross examination', replyToAgentId: 'bull-counsel', tags: ['challenge'] },
  { agentId: 'risk-bailiff', kind: 'risk', stage: 'Risk constraint', replyToAgentId: 'bear-counsel', tags: ['confidence-cap'] },
  { agentId: 'dikast-momentum', kind: 'vote', stage: 'Dikast vote', replyToAgentId: 'risk-bailiff', tags: ['momentum'] },
  { agentId: 'dikast-skeptic', kind: 'vote', stage: 'Dikast vote', replyToAgentId: 'dikast-momentum', tags: ['skeptic'] },
  { agentId: 'dikast-risk', kind: 'vote', stage: 'Dikast vote', replyToAgentId: 'dikast-skeptic', tags: ['risk'] },
  { agentId: 'head-judge', kind: 'verdict', stage: 'Verdict', replyToAgentId: 'dikast-risk', tags: ['ruling'] },
  { agentId: 'settlement-clerk', kind: 'receipt', stage: 'Settlement receipt', replyToAgentId: 'head-judge', tags: ['arc'] },
]

export function buildCourtTranscript(marketCase: MarketCase, artifacts: CourtArtifact[]): CourtTranscriptTurn[] {
  const turns: CourtTranscriptTurn[] = []

  for (const artifact of artifacts) {
    const turn = buildCourtTranscriptTurn(marketCase, artifact, turns)
    if (turn) turns.push(turn)
  }

  return turns
}

export function buildCourtTranscriptTurn(
  marketCase: MarketCase,
  artifact: CourtArtifact,
  priorTranscript: CourtTranscriptTurn[],
): CourtTranscriptTurn | undefined {
  const blueprint = hearingOrder.find((item) => item.agentId === artifact.agentId)
  if (!blueprint) return undefined

  const registryEntry = agentRegistry.find((agent) => agent.id === artifact.agentId)
  const replyToId = blueprint.replyToAgentId
    ? artifact.replyToTurnId ?? priorTranscript.find((turn) => turn.agentId === blueprint.replyToAgentId)?.id
    : priorTranscript.at(-1)?.id
  const turnId = `turn-${priorTranscript.length + 1}-${artifact.agentId}`

  return {
    id: turnId,
    caseId: marketCase.id,
    agentId: artifact.agentId,
    agentName: registryEntry?.name ?? artifact.agentId,
    speaker: registryEntry?.name ?? artifact.agentId,
    seat: registryEntry?.seat ?? artifact.type,
    kind: blueprint.kind,
    stage: blueprint.stage,
    message: artifact.transcriptMessage?.trim() || buildTurnMessage(blueprint, artifact, marketCase),
    replyToId,
    requestedAgentId: artifact.requestedAgentId,
    request: sanitizeTranscriptRequest(artifact.request),
    artifactId: artifact.id,
    confidence: artifact.confidence,
    createdAt: artifact.createdAt,
    tags: blueprint.tags,
  }
}

function buildTurnMessage(blueprint: TranscriptBlueprint, artifact: CourtArtifact, marketCase: MarketCase) {
  const claim = artifact.claims?.[0]
  const risk = artifact.risks?.[0]
  const confidence = typeof artifact.confidence === 'number' ? ` Confidence: ${Math.round(artifact.confidence * 100)}%.` : ''

  if (blueprint.agentId === 'court-clerk') {
    const contextText = marketCase.context ? ` Case context: ${marketCase.context}` : ''
    return `The court calls ${marketCase.id}. Matter before us: ${marketCase.question}.${contextText} Scope is opened for testimony, argument, risk review, vote, verdict, and receipt. ${artifact.summary}`.trim()
  }

  if (blueprint.kind === 'testimony') {
    return [`I testify as follows: ${artifact.summary}`, claim ? `Key observation: ${claim}` : undefined, risk ? `Limit: ${risk}` : undefined, confidence].filter(Boolean).join(' ')
  }

  if (blueprint.agentId === 'evidence-clerk') {
    return [`Exhibits are filed from the witness record. ${artifact.summary}`, claim ? `Filed point: ${claim}` : undefined, risk ? `Contradiction or gap: ${risk}` : undefined].filter(Boolean).join(' ')
  }

  if (blueprint.agentId === 'bull-counsel') {
    return [`For the affirmative: ${artifact.summary}`, claim ? `The strongest yes-side point is: ${claim}` : undefined, risk ? `I acknowledge the weakness: ${risk}` : undefined].filter(Boolean).join(' ')
  }

  if (blueprint.agentId === 'bear-counsel') {
    return [`Cross-examining that claim: ${artifact.summary}`, claim ? `The strongest no-side point is: ${claim}` : undefined, risk ? `Risk pressed for the record: ${risk}` : undefined].filter(Boolean).join(' ')
  }

  if (blueprint.kind === 'risk') {
    return [`Risk constraint entered: ${artifact.summary}`, claim ? `Constraint: ${claim}` : undefined, risk ? `Invalidation risk: ${risk}` : undefined].filter(Boolean).join(' ')
  }

  if (blueprint.kind === 'vote') {
    return [`My vote: ${artifact.summary}`, claim ? `Reason: ${claim}` : undefined, risk ? `Reservation: ${risk}` : undefined, confidence].filter(Boolean).join(' ')
  }

  if (blueprint.kind === 'verdict') {
    return [`Verdict of the court: ${artifact.summary}`, claim ? `Finding: ${claim}` : undefined, risk ? `Constraint: ${risk}` : undefined, confidence].filter(Boolean).join(' ')
  }

  if (blueprint.kind === 'receipt') {
    return [`Settlement record: ${artifact.summary}`, claim ? `Receipt event: ${claim}` : undefined, risk ? `Settlement caveat: ${risk}` : undefined].filter(Boolean).join(' ')
  }

  return artifact.summary
}

function sanitizeTranscriptRequest(request?: string) {
  if (!request) return undefined

  const cleaned = request
    .replace(/\s*Case context\/resolution criteria for all agents:[\s\S]*?(?=\. Treat this as|$)/, '')
    .replace(/\s*Treat this as resolution context, not as a separate claim already proven\./g, '')
    .replace(/\s*Tie every factual claim to supplied tool evidence\./g, '')
    .replace(/\s*Do not [^.]+\./g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return undefined
  if (/courtInstruction|resolution criteria for all agents|supplied tool evidence|not yet in evidence/i.test(cleaned)) return undefined
  if (cleaned.length > 220) return `${cleaned.slice(0, 217).trim()}...`

  return cleaned
}
