import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runSettlementClerk(context: AgentContext): CourtArtifact {
  const agentCosts = context.artifacts.reduce((total, artifact) => total + artifact.costUsd, 0)
  const protocolFee = 0.03

  return {
    id: `${context.marketCase.id}-settlement-plan`,
    caseId: context.marketCase.id,
    agentId: 'settlement-clerk',
    type: 'settlement-plan',
    summary: `Prepared ${agentCosts.toFixed(2)} USDC in agent payouts and ${protocolFee.toFixed(2)} USDC protocol fee.`,
    claims: ['Payment plan created', 'Arc event timeline ready for anchoring'],
    risks: ['Current payments are simulated until Arc Testnet contract writes are wired'],
    costUsd: 0.02,
    createdAt: new Date().toISOString(),
  }
}
