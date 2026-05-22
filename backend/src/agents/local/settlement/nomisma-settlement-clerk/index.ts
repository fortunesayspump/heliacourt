import { agentRegistry } from '../../../registry.js'
import { env } from '../../../../config/env.js'
import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runSettlementClerk(context: AgentContext): CourtArtifact {
  const prices = new Map(agentRegistry.map((agent) => [agent.id, agent.priceUsd]))
  const agentCosts = context.artifacts.reduce((total, artifact) => {
    const registryPrice = prices.get(artifact.agentId)
    return total + (registryPrice && registryPrice > 0 ? registryPrice : artifact.costUsd)
  }, 0)
  const budget = Number(context.marketCase.onchain?.budgetUsdc ?? 0)
  const protocolFee = budget > 0 ? budget * (env.PROTOCOL_FEE_BPS / 10_000) : 0

  return {
    id: `${context.marketCase.id}-settlement-plan`,
    caseId: context.marketCase.id,
    agentId: 'settlement-clerk',
    type: 'settlement-plan',
    summary: `Prepared an estimated ${agentCosts.toFixed(2)} USDC in registry-priced agent payouts and ${protocolFee.toFixed(2)} USDC protocol fee.`,
    claims: ['Payment plan created', 'Arc event timeline ready for anchoring'],
    risks: ['Final payout can be pro-rated if requested agent fees exceed the escrow budget'],
    costUsd: 0.02,
    createdAt: new Date().toISOString(),
  }
}
