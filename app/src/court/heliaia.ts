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
import { runHermesNewsWitness } from '../agents/local/witnesses/hermes-news-witness'
import { runPythiaPredictionWitness } from '../agents/local/witnesses/pythia-prediction-witness'
import type { AgentContext, CourtArtifact, MarketCase } from './types'

export function runHeliaiaHearing(marketCase: MarketCase) {
  const artifacts: CourtArtifact[] = []

  const context = (): AgentContext => ({
    marketCase,
    artifacts,
  })

  artifacts.push(runCourtClerk(context()))
  artifacts.push(runPythiaPredictionWitness(context()))
  artifacts.push(runHermesNewsWitness(context()))
  artifacts.push(runArgosOnchainWitness(context()))
  artifacts.push(runEvidenceClerk(context()))
  artifacts.push(runBullCounsel(context()))
  artifacts.push(runBearCounsel(context()))
  artifacts.push(runRiskBailiff(context()))
  artifacts.push(runDikastMomentum(context()))
  artifacts.push(runDikastSkeptic(context()))
  artifacts.push(runDikastRisk(context()))
  artifacts.push(runHeadJudge(context()))
  artifacts.push(runSettlementClerk(context()))

  return {
    marketCase,
    artifacts,
    recordHash: createDemoRecordHash(marketCase.id, artifacts),
  }
}

function createDemoRecordHash(caseId: string, artifacts: CourtArtifact[]) {
  const seed = `${caseId}:${artifacts.map((artifact) => artifact.id).join(':')}`
  let hash = 0

  for (const char of seed) {
    hash = (hash << 5) - hash + char.charCodeAt(0)
    hash |= 0
  }

  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`
}
