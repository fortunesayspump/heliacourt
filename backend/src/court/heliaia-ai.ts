import { runRiskBailiff } from '../agents/local/bailiffs/phylax-risk-bailiff'
import { runCourtClerk } from '../agents/local/clerks/mnemon-court-clerk'
import { runEvidenceClerk } from '../agents/local/clerks/kleio-evidence-clerk'
import { runBearCounsel } from '../agents/local/counsel/draco-bear-counsel'
import { runBullCounsel } from '../agents/local/counsel/solon-bull-counsel'
import { runDikastMomentum } from '../agents/local/dikasts/kallias-momentum-juror'
import { runDikastRisk } from '../agents/local/dikasts/sophon-risk-juror'
import { runDikastSkeptic } from '../agents/local/dikasts/thraso-skeptic-juror'
import { runHeadJudge } from '../agents/local/magistrates/archon-presiding-magistrate'
import { runSettlementClerk } from '../agents/local/settlement/nomisma-settlement-clerk'
import { runArgosOnchainWitness } from '../agents/local/witnesses/argos-onchain-witness'
import { runAletheiaWebScraperWitness } from '../agents/local/witnesses/aletheia-web-scraper-witness'
import { runChronosTimelineWitness } from '../agents/local/witnesses/chronos-timeline-witness'
import { runEikonVisualEvidenceWitness } from '../agents/local/witnesses/eikon-visual-evidence-witness'
import { runHermesNewsWitness } from '../agents/local/witnesses/hermes-news-witness'
import { runNotusWeatherDataWitness } from '../agents/local/witnesses/notus-weather-data-witness'
import { runNumerosQuantWitness } from '../agents/local/witnesses/numeros-quant-witness'
import { runPythiaPredictionWitness } from '../agents/local/witnesses/pythia-prediction-witness'
import { runSkepsisSourceQualityWitness } from '../agents/local/witnesses/skepsis-source-quality-witness'
import { runSophiaResearchWitness } from '../agents/local/witnesses/sophia-research-witness'
import { runThalesSocialCountWitness } from '../agents/local/witnesses/thales-social-count-witness'
import { isCourtModelConfigured } from '../agents/model'
import { runPromptedAgent } from '../agents/run-agent'
import { getWitnessToolEvidence } from '../agents/tools'
import { buildEvidenceLedger } from './evidence-ledger'
import { buildEvidenceAgenda } from './evidence-agenda'
import { applyProcedureHandoff, buildCourtProcedure, buildMagistrateDirectionTurn, getTurnKindForPhase } from './group-chat'
import type { CourtProcedureStep } from './group-chat'
import { planInitialHearing, planNextCourtMove } from './hearing-strategist'
import { evaluateHearingTrajectory, recommendedTrajectoryMove } from './hearing-trajectory'
import type { AgentContext, CourtArtifact, CourtTranscriptTurn, MarketCase } from './types'
import { buildCourtTranscriptTurn } from './transcript'

type HearingRunOptions = {
  onArtifact?: (artifact: CourtArtifact) => void | Promise<void>
  onTurn?: (turn: CourtTranscriptTurn) => void | Promise<void>
  initialArtifacts?: CourtArtifact[]
  initialTranscript?: CourtTranscriptTurn[]
}

const fallbackFactories: Record<string, (agentContext: AgentContext) => CourtArtifact> = {
  'court-clerk': runCourtClerk,
  'pythia-prediction-witness': runPythiaPredictionWitness,
  'hermes-news-witness': runHermesNewsWitness,
  'argos-onchain-witness': runArgosOnchainWitness,
  'notus-weather-data-witness': runNotusWeatherDataWitness,
  'web-scraper-witness': runAletheiaWebScraperWitness,
  'visual-evidence-witness': runEikonVisualEvidenceWitness,
  'skepsis-source-quality-witness': runSkepsisSourceQualityWitness,
  'chronos-timeline-witness': runChronosTimelineWitness,
  'sophia-research-witness': runSophiaResearchWitness,
  'numeros-quant-witness': runNumerosQuantWitness,
  'social-count-witness': runThalesSocialCountWitness,
  'evidence-clerk': runEvidenceClerk,
  'bull-counsel': runBullCounsel,
  'bear-counsel': runBearCounsel,
  'risk-bailiff': runRiskBailiff,
  'dikast-momentum': runDikastMomentum,
  'dikast-skeptic': runDikastSkeptic,
  'dikast-risk': runDikastRisk,
  'head-judge': runHeadJudge,
  'settlement-clerk': runSettlementClerk,
}

export async function runHeliaiaConfiguredHearing(marketCase: MarketCase, options: HearingRunOptions = {}) {
  const artifacts: CourtArtifact[] = [...(options.initialArtifacts ?? [])]
  const transcript: CourtTranscriptTurn[] = [...(options.initialTranscript ?? [])]
  const evidenceAgenda = buildEvidenceAgenda(marketCase)
  const allowToolBackedWitnesses =
    process.env.HELIA_ENABLE_LLM_WITNESSES === 'true' ||
    (process.env.HELIA_ENABLE_LLM_WITNESSES !== 'false' && isCourtModelConfigured())
  const initialPlan = await planInitialHearing(marketCase)
  const procedure = limitProcedure(buildCourtProcedure(marketCase, initialPlan))
  let dynamicHandoffs = 0
  let adaptiveInterjections = 0
  const configuredMaxDynamicHandoffs = Number(process.env.HELIA_MAX_DYNAMIC_HANDOFFS ?? 4)
  const maxDynamicHandoffs = Number.isFinite(configuredMaxDynamicHandoffs) && configuredMaxDynamicHandoffs >= 0
    ? configuredMaxDynamicHandoffs
    : 6
  const configuredMaxAdaptiveInterjections = Number(process.env.HELIA_MAX_ADAPTIVE_INTERJECTIONS ?? 3)
  const maxAdaptiveInterjections = Number.isFinite(configuredMaxAdaptiveInterjections) && configuredMaxAdaptiveInterjections >= 0
    ? configuredMaxAdaptiveInterjections
    : 4
  const adaptiveJudgeEnabled = process.env.HELIA_ENABLE_ADAPTIVE_JUDGE !== 'false'

  const context = (): AgentContext => ({
    marketCase,
    artifacts,
    transcript,
    evidenceAgenda,
  })

  async function appendTurn(turn?: CourtTranscriptTurn | null) {
    if (!turn) return
    transcript.push(turn)
    await options.onTurn?.(turn)
  }

  async function push(step: (typeof procedure)[number]) {
    const agentId = step.agentId
    const fallbackFactory = fallbackFactories[agentId]
    if (!fallbackFactory) throw new Error(`No fallback runner for ${agentId}`)

    const effectiveInstruction = appendSourceTrailInstruction(
      agentId,
      buildEffectiveInstruction(agentId, step, transcript),
      artifacts,
    )
    const toolEvidence = await getWitnessToolEvidence(agentId, marketCase, effectiveInstruction)
    const evidenceLedger = buildEvidenceLedger({
      marketCase,
      artifacts,
      toolEvidence,
      agentId,
    })
    const agentContext = {
      ...context(),
      toolEvidence,
      evidenceLedger,
      courtInstruction: effectiveInstruction,
      courtPhase: step.phase,
    }

    const artifact = await runPromptedAgent({
      agentId,
      context: agentContext,
      fallback: fallbackFactory(agentContext),
      allowToolBackedWitnesses,
    })
    artifact.replyToTurnId = transcript.at(-1)?.id
    if (toolEvidence.length) artifact.toolEvidence = toolEvidence
    applyProcedureHandoff(artifact, step)
    enforcePhaseShape(artifact, step)
    artifacts.push(artifact)
    await options.onArtifact?.(artifact)

    const turn = buildCourtTranscriptTurn(marketCase, artifact, transcript)
    if (turn) {
      turn.kind = getTurnKindForPhase(step)
      turn.stage = step.stage
      turn.tags = [step.phase, ...(turn.tags ?? [])]
      await appendTurn(turn)
    }

    return artifact
  }

  async function pushRequestedHandoff(artifact: CourtArtifact, parentStep: (typeof procedure)[number], nextStep?: (typeof procedure)[number]) {
    if (isRecordReadyForVerdict(artifacts)) return undefined
    if (parentStep.phase === 'docket' || parentStep.phase === 'judge-framing' || parentStep.phase === 'opening') return undefined
    if (!artifact.requestedAgentId || !artifact.request || dynamicHandoffs >= maxDynamicHandoffs) return undefined
    if (artifact.requestedAgentId === parentStep.agentId) return undefined
    if (!fallbackFactories[artifact.requestedAgentId]) return undefined
    if (isPrematureJurorHandoff(artifact.requestedAgentId, parentStep)) return undefined
    if (nextStep?.agentId === artifact.requestedAgentId) return undefined
    if (isDuplicativeHandoff(artifact.requestedAgentId, artifact.request, artifacts)) return undefined

    dynamicHandoffs += 1
    const dynamicStep: (typeof procedure)[number] = {
      agentId: artifact.requestedAgentId,
      phase: 'direct',
      stage: `Court-requested follow-up: ${artifact.requestedAgentId}`,
      issue: parentStep.issue,
      request: artifact.request,
    }
    const direction = buildMagistrateDirectionTurn(marketCase, dynamicStep, transcript)
    await appendTurn(direction)
    const followUpArtifact = await push(dynamicStep)
    if (shouldRunDynamicExamination(dynamicStep, parentStep)) {
      await pushDynamicWitnessExamination(dynamicStep, parentStep)
    }

    return { artifact: followUpArtifact, step: dynamicStep }
  }

  async function pushDynamicWitnessExamination(witnessStep: CourtProcedureStep, parentStep: CourtProcedureStep) {
    const witnessId = witnessStep.agentId
    const issue = witnessStep.issue ?? parentStep.issue ?? 'the live forecast issue'
    const witnessName = witnessId
    const pushExamTurn = async (step: CourtProcedureStep) => {
      const artifact = await push(step)
      const followUp = await pushRequestedHandoff(artifact, step)
      return Boolean(followUp)
    }

    if (parentStep.agentId !== 'bull-counsel') {
      if (await pushExamTurn({
        agentId: 'bull-counsel',
        phase: 'direct',
        stage: `Direct examination by Solon`,
        issue,
        targetAgentId: witnessId,
        request: `Question ${witnessName} on the strongest Yes pathway for ${issue}. Keep it natural: what fact or mechanism would actually move the forecast?`,
      })) return
      if (await pushExamTurn({
        agentId: witnessId,
        phase: 'direct',
        stage: `${witnessName} answers Solon`,
        issue,
        request: 'Answer Solon directly from the evidence and name what remains uncertain.',
      })) return
    }

    if (parentStep.agentId !== 'bear-counsel') {
      if (await pushExamTurn({
        agentId: 'bear-counsel',
        phase: 'cross',
        stage: `Cross-examination by Draco`,
        issue,
        targetAgentId: witnessId,
        request: `Cross-examine ${witnessName} on the weakest link in the Yes pathway for ${issue}. Keep it natural and specific.`,
      })) return
      if (await pushExamTurn({
        agentId: witnessId,
        phase: 'cross',
        stage: `${witnessName} answers Draco`,
        issue,
        request: 'Answer Draco directly from the evidence and concede any real limits.',
      })) return
    }

    await push({
      agentId: 'head-judge',
      phase: 'admission',
      stage: `Ruling on ${witnessName} testimony`,
      issue,
      request: `Admit or limit ${witnessName}'s testimony. Name the useful point, the live gap, and whether counsel should keep fighting this branch or move on.`,
    })
  }

  async function pushAdaptiveJudgeReview(artifact: CourtArtifact, parentStep: (typeof procedure)[number], nextStep?: (typeof procedure)[number]) {
    if (!adaptiveJudgeEnabled || adaptiveInterjections >= maxAdaptiveInterjections) return
    if (artifact.agentId === 'head-judge' || artifact.agentId === 'court-clerk' || artifact.agentId === 'settlement-clerk') return
    if (shouldLetCounselClashFirst(artifact, nextStep)) return
    if (!shouldReviewAdaptively(artifact, parentStep)) return
    if (nextStep?.agentId === 'head-judge' && (nextStep.phase === 'judge-question' || nextStep.phase === 'admission')) return

    adaptiveInterjections += 1
    const aiMove = await planNextCourtMove({
      marketCase,
      artifacts,
      transcript,
      lastArtifact: artifact,
      parentStep,
      nextStep,
    })
    const reviewStep = buildAdaptiveReviewStep(artifact, parentStep, aiMove)
    const reviewArtifact = await push(reviewStep)
    const plannedFollowUp = aiMove?.action === 'proceed'
      ? undefined
      : aiMove?.agentId && aiMove.agentId !== 'head-judge'
        ? { agentId: aiMove.agentId, request: aiMove.request ?? `Clarify ${parentStep.issue ?? 'the active issue'} from the current record.` }
        : planAdaptiveFollowUp(artifact, parentStep, artifacts)
    if (!reviewArtifact.requestedAgentId && plannedFollowUp) {
      reviewArtifact.requestedAgentId = plannedFollowUp.agentId
      reviewArtifact.request = plannedFollowUp.request
      reviewArtifact.notes = [
        ...(reviewArtifact.notes ?? []),
        `Adaptive planner selected ${plannedFollowUp.agentId} from structured evidence scores.`,
      ]
    }
    const followUp = await pushRequestedHandoff(reviewArtifact, reviewStep, nextStep)
    if (followUp && shouldContinueTruthSeeking(followUp.artifact, followUp.step)) {
      await pushAdaptiveJudgeReview(followUp.artifact, followUp.step, nextStep)
    }
  }

  for (const [index, step] of procedure.entries()) {
    if (isRecordReadyForVerdict(artifacts) && step.phase !== 'verdict' && step.phase !== 'settlement') continue
    if (hasCompletedScheduledStep(transcript, step)) continue
    await pushPreVerdictRescue(step)
    if (shouldSkipRedundantPlannedStep(step, procedure[index + 1], transcript)) continue
    const direction = buildMagistrateDirectionTurn(marketCase, step, transcript)
    await appendTurn(direction)
    const artifact = await push(step)
    await pushRequestedHandoff(artifact, step, procedure[index + 1])
    await pushAdaptiveJudgeReview(artifact, step, procedure[index + 1])
  }

  return {
    marketCase,
    artifacts,
    transcript,
    recordHash: createDemoRecordHash(marketCase.id, artifacts),
  }

  async function pushPreVerdictRescue(step: CourtProcedureStep) {
    if (!['closing', 'risk-instruction', 'calibration', 'verdict'].includes(step.phase)) return
    if (dynamicHandoffs >= maxDynamicHandoffs) return
    if (isRecordReadyForVerdict(artifacts)) return

    const rescue = planPreVerdictRescue(step, marketCase, artifacts, transcript)
    if (!rescue) return
    if (isDuplicativeHandoff(rescue.agentId, rescue.request, artifacts)) return

    dynamicHandoffs += 1
    const rescueStep: CourtProcedureStep = {
      agentId: rescue.agentId,
      phase: 'direct',
      stage: `Pre-verdict evidence rescue: ${rescue.agentId}`,
      issue: step.issue ?? 'critical pre-verdict evidence gap',
      request: rescue.request,
    }
    const direction = buildMagistrateDirectionTurn(marketCase, rescueStep, transcript)
    await appendTurn(direction)
    await push(rescueStep)
  }
}

function appendSourceTrailInstruction(agentId: string, instruction: string, artifacts: CourtArtifact[]) {
  if (agentId !== 'web-scraper-witness' && agentId !== 'skepsis-source-quality-witness' && agentId !== 'chronos-timeline-witness' && agentId !== 'sophia-research-witness') {
    return instruction
  }

  const sourceUrls = artifacts
    .flatMap((artifact) => artifact.toolEvidence ?? [])
    .filter((evidence) => evidence.capability === 'web_news_search' || evidence.capability === 'prediction_market_data' || evidence.capability === 'web_page_scrape')
    .flatMap((evidence) => evidence.sources.flatMap((source) => {
      if (!source.url || !/^https?:\/\//i.test(source.url)) return []
      return [{
        capability: evidence.capability,
        title: source.title,
        url: source.url,
        observedAt: source.observedAt,
      }]
    }))
    .sort((left, right) => scoreReusableSource(right) - scoreReusableSource(left))

  const seen = new Set<string>()
  const reusable = sourceUrls.filter((source) => {
    const key = normalizeSourceUrl(source.url)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 8)

  if (!reusable.length) return instruction

  const sourceTrail = reusable
    .map((source, index) => `${index + 1}. ${source.title} (${source.capability}) ${source.url}`)
    .join('\n')

  return `${instruction}\n\nCandidate source URLs already discovered in the evidence ledger. If the live request asks for cited, discovered, catalyst, blocker, source-quality, or date verification, inspect these before asking the user for a URL:\n${sourceTrail}`
}

function scoreReusableSource(source: { capability: string; title: string; url: string; observedAt?: string }) {
  const host = getHostname(source.url)
  let score = 0
  if (source.capability === 'web_news_search') score += 8
  if (source.capability === 'web_page_scrape') score += 5
  if (source.capability === 'prediction_market_data') score += 2
  if (!/polymarket\.com|kalshi\.com|manifold\.markets/i.test(host)) score += 5
  if (/\b(reuters|apnews|state\.gov|defense|gov|fifa|uefa|official|xinhua|mnd|congress|sec|cftc)\b/i.test(`${host} ${source.title}`)) score += 4
  if (source.observedAt && !Number.isNaN(Date.parse(source.observedAt))) score += 1
  return score
}

function normalizeSourceUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return ''
  }
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function buildEffectiveInstruction(
  agentId: string,
  step: CourtProcedureStep,
  transcript: CourtTranscriptTurn[],
) {
  const lastTurn = transcript.at(-1)
  const directedRequest = lastTurn?.requestedAgentId === agentId
    ? [
      lastTurn.request
        ? `${lastTurn.agentName ?? lastTurn.agentId} directed this witness request: ${lastTurn.request}`
        : undefined,
      lastTurn.message ? `Spoken examination/context: ${lastTurn.message}` : undefined,
    ].filter(Boolean).join(' ')
    : undefined

  if (!directedRequest) return step.request

  return [
    directedRequest,
    `Scheduled court task: ${step.request}`,
    'Important: numbers or factual premises inside a lawyer question are hypotheses unless they are already in supplied tool evidence or the evidence ledger; do not adopt them as facts.',
    'Use the directed request as the primary tool/search instruction. Use the scheduled task only as role context.',
  ].join(' ')
}

function isPrematureJurorHandoff(agentId: string, parentStep: CourtProcedureStep) {
  if (agentId !== 'dikast-momentum' && agentId !== 'dikast-skeptic' && agentId !== 'dikast-risk') return false

  return parentStep.phase !== 'jury-instruction' && parentStep.phase !== 'deliberation'
}

function shouldRunDynamicExamination(witnessStep: CourtProcedureStep, parentStep: CourtProcedureStep) {
  const dynamicMode = process.env.HELIA_DYNAMIC_WITNESSES === 'true' || process.env.HELIA_HEARING_MODE === 'dynamic'
  if (!dynamicMode) return false
  if (!fallbackFactories[witnessStep.agentId]) return false
  if (parentStep.phase === 'closing' || parentStep.phase === 'risk-instruction' || parentStep.phase === 'verdict' || parentStep.phase === 'settlement') return false

  return witnessStep.agentId.includes('witness')
}

function shouldSkipRedundantPlannedStep(
  step: CourtProcedureStep,
  nextStep: CourtProcedureStep | undefined,
  transcript: CourtTranscriptTurn[],
) {
  const lastTurn = transcript.at(-1)
  if (!lastTurn) return false

  if (
    step.agentId === 'head-judge'
    && step.phase === 'direct'
    && step.stage === 'Witness called'
    && nextStep
    && lastTurn.requestedAgentId === nextStep.agentId
  ) {
    return true
  }

  if (
    step.agentId === 'head-judge'
    && lastTurn.agentId === 'head-judge'
    && textSimilarity(`${step.stage} ${step.request}`, `${lastTurn.stage} ${lastTurn.message} ${lastTurn.request ?? ''}`) >= 0.72
  ) {
    return true
  }

  return false
}

function buildAdaptiveReviewStep(
  artifact: CourtArtifact,
  parentStep: CourtProcedureStep,
  aiMove?: Awaited<ReturnType<typeof planNextCourtMove>>,
): CourtProcedureStep {
  if (aiMove && aiMove.action !== 'proceed' && aiMove.agentId === 'head-judge') {
    return {
      agentId: 'head-judge',
      phase: aiMove.phase ?? 'judge-question',
      stage: aiMove.stage ?? `AI-guided judicial review: ${artifact.agentId}`,
      issue: parentStep.issue,
      request: [
        aiMove.request ?? `Review the prior ${artifact.agentId} turn in context.`,
        aiMove.rationale ? `Strategist rationale: ${aiMove.rationale}` : undefined,
        `Do not merely announce the next stage.`,
      ].filter(Boolean).join(' '),
    }
  }

  if (aiMove && aiMove.action !== 'proceed' && aiMove.agentId) {
    return {
      agentId: 'head-judge',
      phase: 'judge-question',
      stage: `AI-guided judicial review: ${artifact.agentId}`,
      issue: parentStep.issue,
      request: [
        `Review the prior ${artifact.agentId} turn in context.`,
        `The AI strategist recommends ${aiMove.agentId}: ${aiMove.request ?? aiMove.rationale ?? 'a focused follow-up.'}`,
        `Decide whether to allow that follow-up and state the narrow evidentiary reason.`,
      ].join(' '),
    }
  }

  return {
    agentId: 'head-judge',
    phase: 'judge-question',
    stage: `Adaptive judicial review: ${artifact.agentId}`,
    issue: parentStep.issue,
    request: [
      `Review the prior ${artifact.agentId} turn in context.`,
      `If the turn contains usable evidence or argument, admit the narrow fact or argument weight and identify the missing probability bridge.`,
      `If a follow-up would materially improve truth-seeking, request exactly one best next agent with a precise question; otherwise say the court will proceed.`,
      `Do not merely announce the next stage.`,
    ].join(' '),
  }
}

function shouldReviewAdaptively(artifact: CourtArtifact, step: CourtProcedureStep) {
  if (step.phase === 'opening') return false
  if (step.phase === 'redirect') return false
  if (step.phase === 'closing' || step.phase === 'risk-instruction') return true
  if (artifact.requestedAgentId && artifact.request) return true
  if (artifact.argumentQuality?.some((warning) => warning.severity === 'high' && warning.issue !== 'low-novelty')) return true
  if (artifact.evidenceScores?.some((score) =>
    score.weight >= 0.62
    && (score.tag === 'yes-catalyst'
      || score.tag === 'no-blocker'
      || score.tag === 'direct-proof'
      || score.tag === 'timing'
      || score.tag === 'source-quality'),
  )) return true

  const riskText = (artifact.risks ?? []).join(' ')
  const message = artifact.transcriptMessage ?? ''

  return /\b(missing|gap|cannot prove|unsupported|low confidence|source quality|inference|blocked|unclear|mechanism|failure mode|screening|bridge|what would move)\b/i.test(`${riskText} ${message}`)
}

function shouldLetCounselClashFirst(artifact: CourtArtifact, nextStep?: CourtProcedureStep) {
  if (!nextStep) return false
  if (artifact.type !== 'witness-testimony') return false
  if (nextStep.agentId !== 'bull-counsel' && nextStep.agentId !== 'bear-counsel') return false

  const text = `${artifact.summary} ${artifact.transcriptMessage ?? ''} ${(artifact.risks ?? []).join(' ')}`
  const urgent = /\b(direct proof|confirmed|resolution source|contradiction|fraud|fake|unsupported source|source conflict|tool failed|blocked)\b/i.test(text)

  return !urgent
}

function shouldContinueTruthSeeking(artifact: CourtArtifact, step: CourtProcedureStep) {
  if (step.phase === 'opening' || step.phase === 'closing' || step.phase === 'verdict' || step.phase === 'settlement') return false
  if (isTerminalArtifact(artifact)) return false
  if (artifact.agentId === 'head-judge' || artifact.agentId === 'settlement-clerk') return false
  if (artifact.requestedAgentId && artifact.request && !isDuplicativeHandoff(artifact.requestedAgentId, artifact.request, [])) return true
  if (artifact.argumentQuality?.some((warning) => warning.severity === 'high' && warning.issue !== 'low-novelty')) return true

  const scores = artifact.evidenceScores ?? []
  const hasHighSignal = scores.some((score) =>
    score.weight >= 0.62
    && (score.tag === 'yes-catalyst'
      || score.tag === 'no-blocker'
      || score.tag === 'direct-proof'
      || score.tag === 'timing'
      || score.tag === 'source-quality'),
  )
  const hasOpenGap = scores.some((score) => score.weight >= 0.45 && score.tag === 'missing')
  const text = `${artifact.summary} ${(artifact.risks ?? []).join(' ')} ${artifact.transcriptMessage ?? ''}`
  const asksForMore = /\b(need|needs|missing|unclear|unresolved|cannot prove|cannot determine|would need|requires|gap|not enough)\b/i.test(text)

  return hasHighSignal || hasOpenGap || asksForMore
}

function hasCompletedScheduledStep(transcript: CourtTranscriptTurn[], step: CourtProcedureStep) {
  return transcript.some((turn) =>
    turn.agentId === step.agentId &&
    turn.stage === step.stage &&
    turn.tags?.includes(step.phase),
  )
}

function isRecordReadyForVerdict(artifacts: CourtArtifact[]) {
  const recent = artifacts.slice(-8)
  if (recent.some((artifact) => artifact.type === 'verdict' || artifact.agentId === 'head-judge' && isTerminalArtifact(artifact))) return true

  const text = recent.map((artifact) => `${artifact.agentId} ${artifact.summary} ${artifact.transcriptMessage ?? ''}`).join(' ')
  return /\b(both counsel (?:have )?(?:rested|conceded)|both sides (?:rest|concede|have conceded)|record is exhausted|I will now issue the verdict|ready to issue the verdict|no further evidence to admit)\b/i.test(text)
}

function isTerminalArtifact(artifact: CourtArtifact) {
  const text = `${artifact.summary} ${artifact.transcriptMessage ?? ''}`.replace(/\s+/g, ' ')
  return /\b(I rest|I concede|both counsel (?:have )?(?:rested|conceded)|both sides (?:rest|concede|have conceded)|record is exhausted|I will now issue the verdict|ready to issue the verdict|no further evidence or argument|no further evidence to admit)\b/i.test(text)
}

function planAdaptiveFollowUp(
  artifact: CourtArtifact,
  step: CourtProcedureStep,
  artifacts: CourtArtifact[],
): { agentId: string; request: string } | undefined {
  const scores = artifact.evidenceScores ?? []
  if (!scores.length) return undefined

  const agentCallCount = (agentId: string) => artifacts.filter((item) => item.agentId === agentId).length
  const hasMissing = scores.some((score) => score.tag === 'missing' && score.weight >= 0.5)
  const hasSourceDispute = scores.some((score) => score.tag === 'source-quality' && score.weight >= 0.45)
  const hasTimingIssue = scores.some((score) => score.tag === 'timing' && score.weight >= 0.45)
  const hasYesCatalyst = scores.some((score) => score.tag === 'yes-catalyst')
  const hasNoBlocker = scores.some((score) => score.tag === 'no-blocker')
  const hasHighSignalCatalyst = scores.some((score) => score.tag === 'yes-catalyst' && score.weight >= 0.45)
  const hasHighSignalBlocker = scores.some((score) => score.tag === 'no-blocker' && score.weight >= 0.45)
  const hasOnlyBackground = scores.length > 0 && scores.every((score) => score.tag === 'background' || score.tag === 'source-quality')
  const issue = step.issue ?? 'the active forecast issue'

  if ((hasHighSignalCatalyst || hasHighSignalBlocker) && agentCallCount('chronos-timeline-witness') < 2) {
    return {
      agentId: 'chronos-timeline-witness',
      request: `Chronos, drill the high-signal ${hasHighSignalCatalyst ? 'Yes catalyst' : 'No blocker'} for ${issue}. Establish exact date, window fit, reporting lag, sequence, unresolved timing gaps, and how the timeline should move or cap probability.`,
    }
  }

  if ((hasMissing || hasSourceDispute) && agentCallCount('web-scraper-witness') < 2) {
    return {
      agentId: 'web-scraper-witness',
      request: `Aletheia, inspect the best cited or discovered source for ${issue}. Extract exact text, date, source identity, and whether it resolves the missing/directness problem rather than merely adding background.`,
    }
  }

  if (hasTimingIssue && agentCallCount('chronos-timeline-witness') < 2) {
    return {
      agentId: 'chronos-timeline-witness',
      request: `Chronos, build the timeline for ${issue}. Identify publication dates, event window, resolution deadline, and whether timing creates a Yes catalyst, No blocker, or only background context.`,
    }
  }

  if ((hasYesCatalyst && hasNoBlocker) || hasOnlyBackground) {
    if (agentCallCount('sophia-research-witness') < 1) {
      return {
        agentId: 'sophia-research-witness',
        request: `Sophia, synthesize the competing score map for ${issue}. Separate direct proof, Yes catalysts, No blockers, background, and missing evidence, then state which bridge counsel still needs to argue.`,
      }
    }

    if (agentCallCount('skepsis-source-quality-witness') < 1) {
      return {
        agentId: 'skepsis-source-quality-witness',
        request: `Skepsis, grade whether the sources for ${issue} are official, fresh, direct to the resolution rule, or merely background. Name what forecast weight the court should allow.`,
      }
    }
  }

  return undefined
}

function planPreVerdictRescue(
  step: CourtProcedureStep,
  marketCase: MarketCase,
  artifacts: CourtArtifact[],
  transcript: CourtTranscriptTurn[],
): { agentId: string; request: string } | undefined {
  const trajectoryMove = recommendedTrajectoryMove(evaluateHearingTrajectory({ marketCase, artifacts, transcript, parentStep: step }))
  if (trajectoryMove && trajectoryMove.agentId !== step.agentId) {
    return {
      agentId: trajectoryMove.agentId,
      request: trajectoryMove.request,
    }
  }

  const recent = artifacts.slice(-10)
  const text = recent
    .map((artifact) => `${artifact.agentId} ${artifact.summary} ${artifact.transcriptMessage ?? ''} ${(artifact.risks ?? []).join(' ')} ${artifact.request ?? ''}`)
    .join(' ')
  if (!/\b(missing|gap|need|needs|unresolved|not found|empty|cannot confirm|no official|not ready|blocker|no data|lacks? data|reference class|base rate|historical data|how fast|ranking|leaderboard|elo)\b/i.test(text)) return undefined

  const called = (agentId: string) => artifacts.filter((artifact) => artifact.agentId === agentId).length
  const phaseContext = step.phase === 'verdict'
    ? 'Final chance before verdict.'
    : 'Before closing and risk calibration.'

  if (/\b(no data|lacks? data|reference class|base rate|historical data|how fast|speed|climb|ranking|leaderboard|elo|update cadence|no historical)\b/i.test(text)) {
    if (called('sophia-research-witness') < 2) {
      return {
        agentId: 'sophia-research-witness',
        request: `${phaseContext} Do not stop at "no data". Search the supplied evidence and source trail for a proxy/reference class: historical analogs, update cadence, leaderboard/ranking movement, release-to-rank timing, or adjacent events. Return the best supported proxy, range, and remaining caveat.`,
      }
    }

    if (called('numeros-quant-witness') < 3) {
      return {
        agentId: 'numeros-quant-witness',
        request: `${phaseContext} Build a bounded estimate from available evidence instead of saying the record lacks exact data. Use market odds, liquidity/freshness if available, timelines, sibling markets, and any proxy/reference class Sophia/Hermes found. State range, assumptions, and confidence cap.`,
      }
    }
  }

  if (/\b(primary calendar|filing deadline|ballot access|election calendar|deadline|days remain|days remaining|schedule|event window)\b/i.test(text) && called('chronos-timeline-witness') < 3) {
    return {
      agentId: 'chronos-timeline-witness',
      request: `${phaseContext} Resolve the timing gap with search, scrape, and calendar evidence: exact deadline/window, official source checked, days remaining, and whether the missing date should cap confidence or change probability.`,
    }
  }

  if (/\b(order\s*book|bid[- ]?ask|spread|depth|volume history|recent trade|market freshness|stale quote|price moved)\b/i.test(text) && called('pythia-prediction-witness') < 3) {
    return {
      agentId: 'pythia-prediction-witness',
      request: `${phaseContext} Resolve the market microstructure gap: top bid/ask, spread/depth, volume/activity if available, sibling outcomes, and whether freshness supports copying, fading, or only lightly weighting the price.`,
    }
  }

  if (/\b(sports|scoreboard|bracket|playoff|standings|roster|squad|fixture|match status|game status|nba|mlb|fifa|tennis|atp|wta|ipl)\b/i.test(text) && called('notus-weather-data-witness') < 3) {
    return {
      agentId: 'notus-weather-data-witness',
      request: `${phaseContext} Resolve the sports data gap using structured sports sources and fallbacks: live/final status, schedule/standings/bracket context, official source path checked, and whether an empty provider result is a technical gap or evidence.`,
    }
  }

  if (/\b(official source|resolution rule|exact rule|source quality|source directness|page source|scrape|blocked|js-rendered|primary source)\b/i.test(text) && called('skepsis-source-quality-witness') < 3) {
    return {
      agentId: 'skepsis-source-quality-witness',
      request: `${phaseContext} Resolve the source-quality gap: grade officialness, freshness, directness to the resolution rule, blocked/JS limitations, and what forecast weight the court may safely allow.`,
    }
  }

  if (/\b(catalyst|mechanism|pathway|trigger|blocker|loophole|background only)\b/i.test(text) && called('sophia-research-witness') < 2) {
    return {
      agentId: 'sophia-research-witness',
      request: `${phaseContext} Synthesize the remaining forecast gap: concrete Yes catalysts, No blockers, source trail, timing fit, and whether the record supports a verdict or only a confidence cap.`,
    }
  }

  return undefined
}

function isDuplicativeHandoff(agentId: string, request: string | undefined, artifacts: CourtArtifact[]) {
  if (!request) return true
  const priorSameAgent = artifacts.filter((artifact) => artifact.agentId === agentId)
  const maxCalls = Number(process.env.HELIA_MAX_SAME_AGENT_HANDOFFS ?? (process.env.HELIA_HEARING_MODE === 'exhaustive' ? 6 : 4))
  if (priorSameAgent.length >= maxCalls) return true

  return priorSameAgent.some((artifact) =>
    textSimilarity(request, `${artifact.summary} ${artifact.transcriptMessage ?? ''} ${(artifact.risks ?? []).join(' ')}`) >= 0.62,
  )
}

function textSimilarity(a: string, b: string) {
  const left = textTokens(a)
  const right = textTokens(b)
  if (!left.size || !right.size) return 0

  let overlap = 0
  for (const token of left) {
    if (right.has(token)) overlap += 1
  }

  return overlap / Math.min(left.size, right.size)
}

function textTokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 4 && !handoffStopWords.has(token)),
  )
}

const handoffStopWords = new Set([
  'about',
  'active',
  'agent',
  'court',
  'evidence',
  'forecast',
  'issue',
  'market',
  'probability',
  'request',
  'source',
  'testimony',
  'witness',
])

function enforcePhaseShape(artifact: CourtArtifact, step: CourtProcedureStep) {
  if (step.phase !== 'verdict' || artifact.agentId !== 'head-judge') return

  const message = artifact.transcriptMessage ?? ''
  const hasVerdictPosture = /\bVerdict\s*:|\b(leaning Yes|leaning No|no-edge|No\b|Yes\b)/i.test(message)
  const soundsLikeInstruction = /\bplease reflect\b|\bprepare to vote\b|\bas you deliberate\b|\bDikasts\b/i.test(message)

  if (hasVerdictPosture && !soundsLikeInstruction) return

  const findings = compactSentenceList(artifact.claims, 2) || artifact.summary
  const limits = compactSentenceList(artifact.risks, 2) || 'remaining uncertainty and source limits still cap confidence'
  artifact.transcriptMessage =
    `Verdict: ${artifact.summary}. Relied-upon findings: ${findings}. Limits: ${limits}. This is a calibrated forecast posture, not certainty and not a trading instruction.`
  artifact.notes = [
    ...(artifact.notes ?? []),
    'Verdict guard: final Archon turn was normalized to enter a forecast posture rather than another jury instruction.',
  ]
}

function compactSentenceList(items: string[] | undefined, limit: number) {
  return items
    ?.map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit)
    .join(' / ')
}

function limitProcedure(procedure: CourtProcedureStep[]) {
  const configuredMaxSteps = Number(process.env.HELIA_MAX_HEARING_STEPS ?? procedure.length)
  const maxSteps = Number.isFinite(configuredMaxSteps) && configuredMaxSteps > 0
    ? Math.floor(configuredMaxSteps)
    : procedure.length

  return procedure.slice(0, maxSteps)
}

function createDemoRecordHash(caseId: string, artifacts: CourtArtifact[]) {
  const seed = `${caseId}:${artifacts.map((artifact) => `${artifact.id}:${artifact.summary}`).join(':')}`
  let hash = 0

  for (const char of seed) {
    hash = (hash << 5) - hash + char.charCodeAt(0)
    hash |= 0
  }

  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`
}
