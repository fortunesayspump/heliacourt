import type { MarketCase, ToolEvidence } from '../../../court/types'
import { env } from '../../../config/env'

export function getSettlementAccountingEvidence(marketCase: MarketCase): ToolEvidence {
  const fetchedAt = new Date().toISOString()
  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []

  if (marketCase.onchain) {
    const protocolFee = Number(marketCase.onchain.budgetUsdc) * (env.PROTOCOL_FEE_BPS / 10_000)
    observations.push(
      `Case funding exists: ${marketCase.onchain.budgetUsdc} USDC was opened in CaseEscrow on Arc chain ${marketCase.onchain.chainId} for onchain case ${marketCase.onchain.caseId}. Funding tx ${marketCase.onchain.txHash}.`,
    )
    observations.push(
      `Final settlement is separate from funding: witness payouts, protocol fee, and case-close receipts are pending until the court closes or settlement is executed. Estimated protocol fee at current config is ${protocolFee.toFixed(6)} USDC.`,
    )
    sources.push({
      title: 'CaseEscrow funding transaction',
      url: `https://testnet.arcscan.app/tx/${marketCase.onchain.txHash}`,
      observedAt: marketCase.createdAt,
      value: `${marketCase.onchain.budgetUsdc} USDC funded`,
    })
  } else {
    observations.push('No onchain funding metadata is attached to this case record; settlement clerk should treat funding status as unknown and request onchain evidence before discussing payouts.')
  }

  return {
    capability: 'settlement_accounting',
    provider: 'helia-case-accounting',
    query: marketCase.question,
    fetchedAt,
    status: observations.length ? 'ok' : 'empty',
    observations,
    sources,
  }
}
