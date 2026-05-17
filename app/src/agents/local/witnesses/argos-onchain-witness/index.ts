import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runArgosOnchainWitness(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-argos-testimony`,
    caseId: context.marketCase.id,
    agentId: 'argos-onchain-witness',
    type: 'witness-testimony',
    summary: 'Testifies on wallet flow, exchange movement, and onchain behavior relevant to the case.',
    confidence: 0.65,
    claims: [
      'Onchain flow should confirm whether large wallets support the thesis',
      'Exchange inflows can weaken a bullish verdict',
    ],
    risks: ['Wallet labels and flow interpretation can be stale or incomplete'],
    costUsd: 0.04,
    createdAt: new Date().toISOString(),
  }
}
