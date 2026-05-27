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
  const fundingText = context.marketCase.onchain
    ? `Funding receipt exists: ${context.marketCase.onchain.budgetUsdc} USDC opened in CaseEscrow on Arc tx ${context.marketCase.onchain.txHash}.`
    : 'No funding metadata is attached to this case record.'
  const settlementText = 'Final payout/protocol settlement is separate from funding and remains pending until close/payout receipts are recorded.'

  return {
    id: `${context.marketCase.id}-settlement-plan`,
    caseId: context.marketCase.id,
    agentId: 'settlement-clerk',
    type: 'settlement-plan',
    summary: `${fundingText} Estimated registry-priced agent payouts are ${agentCosts.toFixed(2)} USDC and configured protocol fee is ${protocolFee.toFixed(6)} USDC.`,
    transcriptMessage: `${fundingText} ${settlementText} Estimated registry-priced agent costs are ${agentCosts.toFixed(2)} USDC; configured protocol fee is ${protocolFee.toFixed(6)} USDC. I am not recording payout receipts unless settlement/close events exist.`,
    claims: [fundingText, 'Payment plan created', 'Arc event timeline ready for anchoring'],
    risks: [settlementText, 'Final payout can be pro-rated if requested agent fees exceed the escrow budget'],
    costUsd: 0.02,
    createdAt: new Date().toISOString(),
  }
}
