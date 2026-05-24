import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
import { runPromptedAgent } from '../agents/run-agent'
import { getWitnessToolEvidence } from '../agents/tools'
import { agentRegistry } from '../agents/registry'
import { buildEvidenceAgenda } from '../court/evidence-agenda'
import { buildEvidenceLedger } from '../court/evidence-ledger'
import type { AgentContext, CourtArtifact, MarketCase } from '../court/types'

type WitnessCase = {
  case: MarketCase
  instruction: string
}

const fallbackFactories: Record<string, (context: AgentContext) => CourtArtifact> = {
  'pythia-prediction-witness': runPythiaPredictionWitness,
  'hermes-news-witness': runHermesNewsWitness,
  'web-scraper-witness': runAletheiaWebScraperWitness,
  'visual-evidence-witness': runEikonVisualEvidenceWitness,
  'argos-onchain-witness': runArgosOnchainWitness,
  'notus-weather-data-witness': runNotusWeatherDataWitness,
  'skepsis-source-quality-witness': runSkepsisSourceQualityWitness,
  'chronos-timeline-witness': runChronosTimelineWitness,
  'sophia-research-witness': runSophiaResearchWitness,
  'numeros-quant-witness': runNumerosQuantWitness,
  'social-count-witness': runThalesSocialCountWitness,
}

const now = new Date().toISOString()

const cases: Record<string, WitnessCase> = {
  'pythia-prediction-witness': {
    case: marketCase('smoke-pythia', 'Hantavirus lab leak confirmed by June 30?', 'prediction-market', 'Use Polymarket/Kalshi context for the MV Hondius lab-origin market.'),
    instruction: 'Testify on prediction-market odds, liquidity, active market status, and what the market can or cannot prove.',
  },
  'hermes-news-witness': {
    case: marketCase('smoke-hermes', 'Hantavirus lab leak confirmed by June 30?', 'prediction-market', 'Search for credible reporting on MV Hondius hantavirus lab-origin claims.'),
    instruction: 'Search fresh news and official sources for MV Hondius lab-origin reporting. Separate background from direct resolution evidence.',
  },
  'web-scraper-witness': {
    case: marketCase('smoke-aletheia', 'Scrape WHO Ebola disease page', 'real-world-event', 'Reference URL: https://www.who.int/news-room/fact-sheets/detail/ebola-disease'),
    instruction: 'Scrape https://www.who.int/news-room/fact-sheets/detail/ebola-disease and testify on exact source identity, page claims, and limits.',
  },
  'visual-evidence-witness': {
    case: marketCase('smoke-eikon', 'Read visible market page for Hantavirus lab leak confirmed by June 30?', 'prediction-market', 'Reference URL: https://polymarket.com/event/hantavirus-lab-leak-confirmed-by-june-30-1'),
    instruction: 'Inspect a rendered screenshot of https://polymarket.com/event/hantavirus-lab-leak-confirmed-by-june-30-1 for visible market text, odds, title, and limits.',
  },
  'argos-onchain-witness': {
    case: marketCase('smoke-argos', 'Audit Ethereum address 0xdAC17F958D2ee523a2206206994597C13D831ec7 for onchain context', 'crypto-market'),
    instruction: 'Use public RPC to testify on ETH balance and transaction-count context for the supplied EVM address. Do not invent indexed transaction history.',
  },
  'notus-weather-data-witness': {
    case: marketCase('smoke-notus', 'Will heavy rain disrupt Lagos port logistics in the next 48h?', 'real-world-event', 'Location: Lagos, Nigeria. Horizon: 48h.'),
    instruction: 'Use weather/calendar data for Lagos and state measured conditions, timing, and whether the data can support disruption claims.',
  },
  'skepsis-source-quality-witness': {
    case: marketCase('smoke-skepsis', 'Hantavirus lab leak confirmed by June 30?', 'prediction-market', 'Resolution needs consensus of credible reporting about MV Hondius lab-origin connection.'),
    instruction: 'Grade source authority, freshness, directness, and whether the evidence satisfies the exact consensus standard.',
  },
  'chronos-timeline-witness': {
    case: marketCase('smoke-chronos', 'Hantavirus lab leak confirmed by June 30?', 'prediction-market', 'Deadline: June 30, 2026, 11:59 PM ET.'),
    instruction: 'Build the timeline, deadline fit, source dates, and timing gaps for lab-origin consensus by June 30.',
  },
  'sophia-research-witness': {
    case: marketCase('smoke-sophia', 'Hantavirus lab leak confirmed by June 30?', 'prediction-market', 'Research broad MV Hondius outbreak context and lab-origin claims.'),
    instruction: 'Synthesize search, scrape, and market context into direct proof, Yes drivers, No blockers, and missing evidence.',
  },
  'numeros-quant-witness': {
    case: marketCase('smoke-numeros', 'Hantavirus lab leak confirmed by June 30?', 'prediction-market', 'Use prediction-market odds and any numerical evidence. Do not invent base rates.'),
    instruction: 'Testify on market-implied probability, liquidity, numerical constraints, and what cannot be quantified from supplied evidence.',
  },
  'social-count-witness': {
    case: marketCase('smoke-thales', 'How many followers does @mrbeast have on TikTok?', 'real-world-event', 'Profile URL: https://www.tiktok.com/@mrbeast'),
    instruction: 'Audit the public TikTok profile/fallback sources for visible follower count or state exactly why the count cannot be read.',
  },
}

function marketCase(id: string, question: string, type: MarketCase['type'], context?: string): MarketCase {
  return {
    id,
    question,
    type,
    context,
    links: context?.match(/https?:\/\/\S+/g) ?? undefined,
    createdAt: now,
  }
}

async function smokeWitness(agentId: string) {
  const agent = agentRegistry.find((entry) => entry.id === agentId)
  const factory = fallbackFactories[agentId]
  const witnessCase = cases[agentId]
  if (!agent || !factory || !witnessCase) throw new Error(`No smoke setup for ${agentId}`)

  const startedAt = Date.now()
  const toolEvidence = await getWitnessToolEvidence(agentId, witnessCase.case, witnessCase.instruction)
  const evidenceLedger = buildEvidenceLedger({
    marketCase: witnessCase.case,
    artifacts: [],
    toolEvidence,
    agentId,
  })
  const context: AgentContext = {
    marketCase: witnessCase.case,
    artifacts: [],
    transcript: [],
    evidenceAgenda: buildEvidenceAgenda(witnessCase.case),
    evidenceLedger,
    toolEvidence,
    courtInstruction: witnessCase.instruction,
    courtPhase: 'direct',
  }
  const artifact = await runPromptedAgent({
    agentId,
    context,
    fallback: factory(context),
    allowToolBackedWitnesses: true,
  })

  return {
    agentId,
    name: agent.name,
    ok: true,
    elapsedMs: Date.now() - startedAt,
    toolEvidence: toolEvidence.map((evidence) => ({
      capability: evidence.capability,
      provider: evidence.provider,
      status: evidence.status,
      relevance: evidence.relevance,
      observations: evidence.observations.length,
      sources: evidence.sources.length,
      error: evidence.error,
    })),
    artifact: {
      type: artifact.type,
      model: artifact.model,
      runMode: artifact.runMode,
      confidence: artifact.confidence,
      summary: artifact.summary,
      message: artifact.transcriptMessage,
      evidenceIds: artifact.testimony?.evidenceIds,
      risks: artifact.risks?.slice(0, 3),
      notes: artifact.notes?.slice(0, 3),
    },
  }
}

async function main() {
  const requested = process.argv.slice(2)
  const witnessIds = requested.length
    ? requested
    : Object.keys(fallbackFactories)

  const results = []
  for (const agentId of witnessIds) {
    try {
      const result = await smokeWitness(agentId)
      results.push(result)
      console.log(`[ok] ${agentId} ${result.elapsedMs}ms`)
    } catch (error) {
      const result = {
        agentId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
      results.push(result)
      console.log(`[fail] ${agentId}: ${result.error}`)
    }
  }

  const payload = {
    ok: results.every((result) => result.ok),
    generatedAt: new Date().toISOString(),
    results,
  }
  const outputDir = join(process.cwd(), 'tmp')
  await mkdir(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'witness-smoke-latest.json')
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...payload, outputPath }, null, 2))

  // Some browser/search clients keep sockets open. The smoke script is a CLI
  // diagnostic, so exit once the report is flushed.
  process.exit(payload.ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
