import { generateRawJson } from '../agents/model'
import { agentRegistry } from '../agents/registry'
import type { CourtArtifact, CourtTranscriptTurn, EvidenceScore, MarketCase } from './types'
import { witnessAgentIds } from './group-chat'
import type { CourtProcedurePlan, CourtProcedureStep } from './group-chat'
import { buildCourtClock, describeCourtClock } from './court-time'
import { buildClaimMap } from './claim-map'
import { buildEvidenceAgenda, summarizeEvidenceAgenda } from './evidence-agenda'
import { evaluateHearingTrajectory, recommendedTrajectoryMove, summarizeTrajectoryEvaluation } from './hearing-trajectory'

export type StrategistDecision = {
  action: 'proceed' | 'ask-judge' | 'call-witness' | 'ask-counsel' | 'admit-evidence'
  agentId?: string
  phase?: CourtProcedureStep['phase']
  stage?: string
  request?: string
  rationale?: string
}

type RawStrategistDecision = Partial<StrategistDecision>
type RawHearingPlan = Partial<CourtProcedurePlan>

const allowedAgentIds = new Set(agentRegistry.map((agent) => agent.id))
const allowedWitnessPlanIds = new Set(witnessAgentIds)
const allowedWitnessIds = new Set(
  agentRegistry
    .filter((agent) => agent.seat === 'expert-witness')
    .map((agent) => agent.id),
)

export async function planInitialHearing(marketCase: MarketCase): Promise<CourtProcedurePlan | undefined> {
  if (process.env.HELIA_ENABLE_AI_STRATEGIST === 'false') return undefined
  if (process.env.HELIA_DISABLE_MODEL === 'true') return undefined

  const result = await generateRawJson<RawHearingPlan>({
    model: process.env.HELIA_STRATEGIST_MODEL ?? process.env.HELIA_DEFAULT_MODEL ?? process.env.OPENROUTER_MODEL,
    temperature: Number(process.env.HELIA_STRATEGIST_TEMPERATURE ?? 0.12),
    system: initialPlannerSystemPrompt,
    user: JSON.stringify({
      marketCase,
      courtClock: describeCourtClock(buildCourtClock(marketCase)),
      evidenceAgenda: summarizeEvidenceAgenda(buildEvidenceAgenda(marketCase), 10),
      availableWitnesses: agentRegistry
        .filter((agent) => agent.seat === 'expert-witness')
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
        })),
    }, null, 2),
  })

  if (!result.ok) return undefined

  return normalizeInitialPlan(result.content)
}

export async function planNextCourtMove(params: {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript: CourtTranscriptTurn[]
  lastArtifact: CourtArtifact
  parentStep: CourtProcedureStep
  nextStep?: CourtProcedureStep
}): Promise<StrategistDecision | undefined> {
  if (process.env.HELIA_ENABLE_AI_STRATEGIST === 'false') return undefined
  if (params.parentStep.phase === 'docket' || params.parentStep.phase === 'judge-framing' || params.parentStep.phase === 'opening') return undefined

  const trajectoryMove = buildTrajectoryStrategistMove(params)
  if (trajectoryMove) return trajectoryMove

  if (process.env.HELIA_DISABLE_MODEL === 'true') return undefined

  const result = await generateRawJson<RawStrategistDecision>({
    model: process.env.HELIA_STRATEGIST_MODEL ?? process.env.HELIA_DEFAULT_MODEL ?? process.env.OPENROUTER_MODEL,
    temperature: Number(process.env.HELIA_STRATEGIST_TEMPERATURE ?? 0.12),
    system: strategistSystemPrompt,
    user: JSON.stringify(buildStrategistPayload(params), null, 2),
  })

  if (!result.ok) return undefined

  return normalizeStrategistDecision(result.content, params)
}

const initialPlannerSystemPrompt = `
You are Heliaia, the pre-hearing strategy planner for Helia Court.
Design a compact evidence strategy for a prediction-market hearing.

Core principle:
- Most prediction markets are unresolved future-event questions. Do not plan as if the court merely verifies whether the event already happened.
- Plan for forecasting: reference class/base rate, current catalysts, current blockers, time remaining, source directness, and what would update the probability.
- Plan for investigative depth: when the question contains ambiguous terms, hidden data, blocked pages, charts, or weak source coverage, include a discovery step, a source-inspection step, and a synthesis/quant/source-quality step instead of one shallow search.
- For event pages with multiple contracts, candidates, dates, thresholds, or outcomes, plan around the specific filed contract and compare sibling outcomes for calibration pressure.
- "No direct evidence that it happened yet" is status context, not a final No, unless the deadline passed, the market/source resolved, or current non-occurrence satisfies the rule.
- For markets with public odds, include the market witness or quant witness unless the question has no plausible market context; an API miss is not proof that no market exists.
- Include a quantitative/scenario issue whenever the question has a deadline, countable pathway, known catalyst, or market price.
- Keep the hearing lean. Choose only witnesses that materially reduce uncertainty.
- Prefer a claim-by-claim strategy over a witness parade. Pick witnesses because they can update a direct proof, pathway, blocker, timing, source-quality, or quant bridge claim.
- Market odds are context/calibration, not proof.
- Prefer broad reasoning witnesses only when needed; do not call every specialist.

Return strict JSON only:
{
  "witnessIds": ["exact witness ids, in the order the court should call them"],
  "issues": ["4-6 concise forecast issues"],
  "rationale": "one concise sentence explaining the strategy"
}
`

const strategistSystemPrompt = `
You are Heliaia, the hearing strategist for Helia Court. You are not a witness and not counsel.
Your job is to advise Archon on the next best discretionary courtroom move inside the normal court schedule.

Reasoning policy:
- Preserve normal court order: docket, framing, openings, witness direct, cross, redirect, judicial clarification, evidentiary ruling, evidence filing, closing, risk instruction, jury vote, verdict, settlement.
- Do not skip scheduled phases or move straight to closing/verdict.
- Prefer truth-seeking inside the current procedural moment.
- If the last turn is enough, choose proceed.
- If the last turn says a term, data source, chart, table, market structure, or mechanism is unclear, do not accept the gap immediately. Prefer a focused discovery, scrape/visual inspection, structured-data check, source-quality review, or quant proxy step.
- If a witness found generic or off-context sources, redirect with a narrower context query or a different witness/tool instead of letting counsel argue from junk.
- Use trajectoryEvaluation as a higher-level eval of the whole hearing. Critical/high issues there mean the path is bad, even if the last single answer sounded plausible.
- If trajectoryEvaluation flags acronym/context drift, market recovery, calendar anchoring, election data, timeout strategy, or missing proxy issues, choose the suggested witness/action unless the next scheduled step already resolves that exact issue.
- When a high-signal catalyst or blocker appears, do not let the court glide past it. Prefer an Archon drill-down unless the transcript already answered exact event, source directness, timing/window fit, mechanism/failure mode, reference class/base rate, and probability movement.
- If a probability bridge is weak, choose ask-judge or ask-counsel.
- If direct source text is missing or source quality is disputed, choose call-witness with web-scraper-witness or skepsis-source-quality-witness.
- If timing/window/deadline is unclear, choose call-witness with chronos-timeline-witness.
- If counsel or witnesses are looping on "no confirmation yet" for an unresolved future event, ask for a scenario branch and probability bridge instead of more confirmation searching.
- If a multi-outcome event is being flattened into one generic Yes/No, ask Pythia or counsel to name the filed contract, sibling outcomes, and why probability should land on this outcome.
- If a witness treats non-occurrence as decisive while time remains, ask counsel to test catalysts, loopholes, sequence, incentives, and deadline fit.
- If public market context seems missing or contradicted by search snippets, call pythia-prediction-witness or numeros-quant-witness to separate API failure from real market absence.
- If visual/social/market/onchain/sports/weather evidence is needed, choose the matching specialist.
- Do not call a duplicate witness unless the new request is materially different.
- Do not request broad research when a precise witness question can resolve the gap.
- Keep requests short, adversarial, and tied to the resolution criteria.
- Use the claim map like a router: if a claim is supported, proceed; if contested, ask counsel to clash; if missing, call exactly the witness that can update it; if limited, cap confidence.

Return strict JSON only:
{
  "action": "proceed | ask-judge | call-witness | ask-counsel | admit-evidence",
  "agentId": "optional exact agent id",
  "phase": "optional court phase",
  "stage": "optional short stage",
  "request": "optional precise courtroom instruction",
  "rationale": "one sentence"
}
`

function buildStrategistPayload({
  marketCase,
  artifacts,
  transcript,
  lastArtifact,
  parentStep,
  nextStep,
}: {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript: CourtTranscriptTurn[]
  lastArtifact: CourtArtifact
  parentStep: CourtProcedureStep
  nextStep?: CourtProcedureStep
}) {
  const recentScores = artifacts
    .flatMap((artifact) => (artifact.evidenceScores ?? []).map((score) => ({ ...score, agentId: artifact.agentId })))
    .slice(-20)
  const trajectoryEvaluation = evaluateHearingTrajectory({ marketCase, artifacts, transcript, lastArtifact, parentStep })

  return {
    marketCase,
    evidenceAgenda: summarizeEvidenceAgenda(buildEvidenceAgenda(marketCase), 10),
    trajectoryEvaluation: summarizeTrajectoryEvaluation(trajectoryEvaluation),
    claimMap: buildClaimMap({ marketCase, artifacts, transcript }),
    currentStep: parentStep,
    scheduledNextStep: nextStep,
    lastTurn: {
      agentId: lastArtifact.agentId,
      type: lastArtifact.type,
      summary: lastArtifact.summary,
      claims: lastArtifact.claims?.slice(0, 4),
      risks: lastArtifact.risks?.slice(0, 4),
      testimony: lastArtifact.testimony,
      argumentNodes: lastArtifact.argumentNodes?.slice(0, 3),
      leadBranches: lastArtifact.leadBranches?.slice(0, 5),
      argumentQuality: lastArtifact.argumentQuality?.slice(0, 6),
      evidenceScores: lastArtifact.evidenceScores?.slice(0, 8),
      evidenceItems: lastArtifact.evidenceItems?.slice(0, 8).map((item) => ({
        id: item.id,
        supports: item.supports,
        directness: item.directness,
        reliability: item.reliability,
        sourceTitle: item.sourceTitle,
        claim: compact(item.claim, 220),
      })),
    },
    recentTranscript: transcript.slice(-10).map((turn) => ({
      id: turn.id,
      speaker: turn.speaker ?? turn.agentName,
      agentId: turn.agentId,
      kind: turn.kind,
      stage: turn.stage,
      message: compact(turn.message, 360),
    })),
    scoreMap: summarizeScoreMap(recentScores),
    alreadyCalledAgents: Array.from(new Set(artifacts.map((artifact) => artifact.agentId))),
    availableAgents: agentRegistry.map((agent) => ({
      id: agent.id,
      name: agent.name,
      seat: agent.seat,
      description: agent.description,
    })),
  }
}

function buildTrajectoryStrategistMove(params: {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript: CourtTranscriptTurn[]
  lastArtifact: CourtArtifact
  parentStep: CourtProcedureStep
  nextStep?: CourtProcedureStep
}): StrategistDecision | undefined {
  if (process.env.HELIA_ENABLE_TRAJECTORY_GUARDRAIL === 'false') return undefined

  const evaluation = evaluateHearingTrajectory(params)
  const move = recommendedTrajectoryMove(evaluation)
  if (!move) return undefined
  if (!allowedAgentIds.has(move.agentId)) return undefined
  if (move.agentId === params.parentStep.agentId) return undefined
  if (params.nextStep?.agentId === move.agentId) return undefined

  const action: StrategistDecision['action'] = move.agentId === 'head-judge'
    ? 'ask-judge'
    : move.agentId === 'bull-counsel' || move.agentId === 'bear-counsel'
      ? 'ask-counsel'
      : 'call-witness'

  return {
    action,
    agentId: move.agentId,
    phase: normalizePhase(undefined, action),
    stage: compact(`Trajectory rescue: ${move.issue}`, 90),
    request: compact(move.request, 520),
    rationale: compact(`Trajectory evaluator score ${evaluation.score}; ${move.issue}`, 240),
  }
}

function normalizeStrategistDecision(
  raw: RawStrategistDecision,
  params: {
    artifacts: CourtArtifact[]
    parentStep: CourtProcedureStep
    nextStep?: CourtProcedureStep
  },
): StrategistDecision | undefined {
  const action = raw.action
  if (!action || !['proceed', 'ask-judge', 'call-witness', 'ask-counsel', 'admit-evidence'].includes(action)) return undefined
  if (action === 'proceed') return { action: 'proceed', rationale: compact(raw.rationale ?? 'Strategist chose to continue.', 240) }

  const agentId = chooseAgentForAction(raw, action)
  if (!agentId || !allowedAgentIds.has(agentId)) return undefined
  if (agentId === params.parentStep.agentId) return undefined
  if (params.nextStep?.agentId === agentId) return undefined

  const request = compact(raw.request ?? raw.rationale ?? 'Clarify the active forecast issue using the current court record.', 520)
  if (!request) return undefined

  return {
    action,
    agentId,
    phase: normalizePhase(raw.phase, action),
    stage: compact(raw.stage ?? buildStage(action, agentId), 90),
    request,
    rationale: compact(raw.rationale ?? '', 240),
  }
}

function normalizeInitialPlan(raw: RawHearingPlan): CourtProcedurePlan | undefined {
  const witnessIds = Array.isArray(raw.witnessIds)
    ? raw.witnessIds.filter((id): id is string => typeof id === 'string' && allowedWitnessPlanIds.has(id)).slice(0, 6)
    : undefined
  const issues = Array.isArray(raw.issues)
    ? raw.issues
      .filter((issue): issue is string => typeof issue === 'string')
      .map((issue) => compact(issue, 180))
      .filter(Boolean)
      .slice(0, 6)
    : undefined
  const rationale = typeof raw.rationale === 'string' ? compact(raw.rationale, 260) : undefined

  if (!witnessIds?.length && !issues?.length && !rationale) return undefined

  return {
    witnessIds,
    issues,
    rationale,
  }
}

function chooseAgentForAction(raw: RawStrategistDecision, action: StrategistDecision['action']) {
  if (action === 'ask-judge' || action === 'admit-evidence') return 'head-judge'
  if (action === 'ask-counsel') {
    return raw.agentId === 'bear-counsel' ? 'bear-counsel' : 'bull-counsel'
  }
  if (action === 'call-witness' && raw.agentId && allowedWitnessIds.has(raw.agentId)) return raw.agentId

  return raw.agentId
}

function normalizePhase(phase: CourtProcedureStep['phase'] | undefined, action: StrategistDecision['action']): CourtProcedureStep['phase'] {
  if (phase && ['direct', 'cross', 'redirect', 'judge-question', 'admission', 'closing'].includes(phase)) return phase
  if (action === 'ask-judge') return 'judge-question'
  if (action === 'admit-evidence') return 'admission'
  if (action === 'ask-counsel') return 'direct'

  return 'direct'
}

function buildStage(action: StrategistDecision['action'], agentId: string) {
  if (action === 'ask-judge') return 'AI strategist asks Archon to clarify'
  if (action === 'admit-evidence') return 'AI strategist asks Archon to rule'
  if (action === 'ask-counsel') return `AI strategist asks ${agentId} to argue`
  return `AI strategist calls ${agentId}`
}

function summarizeScoreMap(scores: Array<EvidenceScore & { agentId?: string }>) {
  return scores.slice(-12).map((score) => ({
    agentId: score.agentId,
    tag: score.tag,
    polarity: score.polarity,
    weight: score.weight,
    basis: score.basis,
    text: compact(score.text, 180),
  }))
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, ' ').trim()

  if (text.length <= maxLength) return text

  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}
