import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runHeliaiaConfiguredHearing } from '../court/heliaia-ai.js'
import type { CourtArtifact, CourtTranscriptTurn, MarketCase } from '../court/types.js'

type HearingInput = Partial<MarketCase> & {
  question: string
}

const rawCase = process.env.HELIA_HEARING_CASE_JSON

if (!rawCase) {
  throw new Error('HELIA_HEARING_CASE_JSON is required')
}

const input = JSON.parse(rawCase) as HearingInput
const marketCase: MarketCase = {
  id: input.id ?? slugCaseId(input.question),
  question: input.question,
  context: input.context,
  links: input.links,
  type: input.type ?? 'prediction-market',
  filer: input.filer,
  createdAt: input.createdAt ?? new Date().toISOString(),
}

const outputDir = process.env.HELIA_HEARING_OUTPUT_DIR ?? 'tmp/hearings'
mkdirSync(outputDir, { recursive: true })

const basename = marketCase.id.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
const transcriptPath = join(outputDir, `${basename}-transcript.md`)
const eventsPath = join(outputDir, `${basename}-events.jsonl`)
const summaryPath = join(outputDir, `${basename}-summary.json`)

writeFileSync(transcriptPath, `# ${marketCase.question}\n\n`)
writeFileSync(eventsPath, '')

const startedAt = Date.now()
const partialTurns: CourtTranscriptTurn[] = []
const partialArtifacts: CourtArtifact[] = []

try {
  const result = await runHeliaiaConfiguredHearing(marketCase, {
    onTurn: (turn) => {
      partialTurns.push(turn)
      appendFileSync(transcriptPath, formatTurn(turn))
      appendFileSync(eventsPath, `${JSON.stringify({ type: 'turn', turn })}\n`)
      console.log(`[turn ${turn.id}] ${turn.stage} / ${turn.speaker ?? turn.agentName}`)
    },
    onArtifact: (artifact) => {
      partialArtifacts.push(artifact)
      appendFileSync(eventsPath, `${JSON.stringify({ type: 'artifact', artifact: summarizeArtifactForLog(artifact) })}\n`)
    },
  })

  const summary = buildSummary(result.artifacts, result.transcript, result.recordHash)
  writeSummaryAndExit(summary)
} catch (error) {
  const summary = buildSummary(partialArtifacts, partialTurns, undefined, error)
  writeSummaryAndExit(summary, 1)
}

function buildSummary(artifacts: CourtArtifact[], transcript: CourtTranscriptTurn[], recordHash?: string, error?: unknown) {
  const finalVerdict = artifacts.filter((artifact) => artifact.agentId === 'head-judge' && artifact.type === 'verdict').at(-1)

  return {
    transcriptPath: `backend/${transcriptPath}`,
    eventsPath: `backend/${eventsPath}`,
    summaryPath: `backend/${summaryPath}`,
    elapsedMs: Date.now() - startedAt,
    recordHash,
    turns: transcript.length,
    witnesses: Array.from(new Set(artifacts.filter((artifact) => artifact.type === 'witness-testimony').map((artifact) => artifact.agentId))),
    finalVerdict,
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
    artifacts: artifacts.map(summarizeArtifactForLog),
    toolEvidence: artifacts.flatMap((artifact) =>
      artifact.toolEvidence?.map((evidence) => ({
        agent: artifact.agentId,
        capability: evidence.capability,
        status: evidence.status,
        provider: evidence.provider,
        relevance: evidence.relevance,
        observations: evidence.observations,
        sources: evidence.sources?.slice(0, 8),
        error: evidence.error,
      })) ?? [],
    ),
  }
}

function writeSummaryAndExit(summary: ReturnType<typeof buildSummary>, code = 0) {
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({
    transcriptPath: summary.transcriptPath,
    eventsPath: summary.eventsPath,
    summaryPath: summary.summaryPath,
    elapsedMs: summary.elapsedMs,
    recordHash: summary.recordHash,
    turns: summary.turns,
    witnesses: summary.witnesses,
    error: summary.error,
    finalVerdict: summary.finalVerdict
      ? {
          summary: summary.finalVerdict.summary,
          confidence: summary.finalVerdict.confidence,
          claims: summary.finalVerdict.claims,
          risks: summary.finalVerdict.risks,
        }
      : undefined,
  }, null, 2))
  process.exit(code)
}

function formatTurn(turn: CourtTranscriptTurn) {
  return [
    `## ${turn.id} / ${turn.speaker ?? turn.agentName}`,
    `Stage: ${turn.stage}`,
    `Kind: ${turn.kind}`,
    turn.replyToId ? `Reply to: ${turn.replyToId}` : undefined,
    turn.requestedAgentId ? `Requested: ${turn.requestedAgentId}` : undefined,
    '',
    turn.message,
    '',
    '---',
    '',
  ].filter((line) => line !== undefined).join('\n')
}

function summarizeArtifactForLog(artifact: CourtArtifact) {
  return {
    id: artifact.id,
    agentId: artifact.agentId,
    type: artifact.type,
    summary: artifact.summary,
    confidence: artifact.confidence,
    claims: artifact.claims,
    risks: artifact.risks,
    notes: artifact.notes,
    requestedAgentId: artifact.requestedAgentId,
    request: artifact.request,
    model: artifact.model,
    runMode: artifact.runMode,
    testimony: artifact.testimony,
    argumentNodes: artifact.argumentNodes,
    leadBranches: artifact.leadBranches,
    argumentQuality: artifact.argumentQuality,
    evidenceItems: artifact.evidenceItems?.slice(0, 8),
    evidenceScores: artifact.evidenceScores,
  }
}

function slugCaseId(question: string) {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)

  return slug || `case-${Date.now()}`
}
