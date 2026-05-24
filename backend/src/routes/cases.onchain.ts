import { createPublicClient, formatUnits, http, parseEventLogs, parseUnits } from 'viem'
import { arcTestnet } from '../chains/arc-testnet.js'
import { env } from '../config/env.js'
import { normalizeWallet } from './cases.utils.js'

const usdcDecimals = 6
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(env.ARC_RPC_URL),
})

const caseEscrowFundingAbi = [
  {
    type: 'event',
    name: 'CaseOpened',
    inputs: [
      { name: 'caseId', type: 'uint256', indexed: true },
      { name: 'petitioner', type: 'address', indexed: true },
      { name: 'budget', type: 'uint96', indexed: false },
      { name: 'questionHash', type: 'bytes32', indexed: false },
      { name: 'metadataURI', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CaseFunded',
    inputs: [
      { name: 'caseId', type: 'uint256', indexed: true },
      { name: 'funder', type: 'address', indexed: true },
      { name: 'amount', type: 'uint96', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CaseCancelled',
    inputs: [
      { name: 'caseId', type: 'uint256', indexed: true },
      { name: 'refund', type: 'uint96', indexed: false },
    ],
  },
] as const

export async function verifyCaseFundingReceipt({
  txHash,
  wallet,
  onchainCaseId,
  escrowAddress,
  expectedAmountUsdc,
}: {
  txHash: `0x${string}`
  wallet: string
  onchainCaseId: string
  escrowAddress: `0x${string}`
  expectedAmountUsdc?: string
}) {
  if (env.CASE_ESCROW_ADDRESS && normalizeWallet(escrowAddress) !== normalizeWallet(env.CASE_ESCROW_ADDRESS)) {
    return { ok: false as const, error: 'funding escrow address does not match backend escrow configuration' }
  }
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') return { ok: false as const, error: 'funding transaction did not succeed' }

  const logs = parseEventLogs({
    abi: caseEscrowFundingAbi,
    logs: receipt.logs.filter((log) => normalizeWallet(log.address) === normalizeWallet(escrowAddress)),
    eventName: 'CaseFunded',
  })
  const event = logs.find((log) => {
    const args = log.args
    return args.caseId?.toString() === onchainCaseId && args.funder?.toLowerCase() === wallet
  })
  if (!event) return { ok: false as const, error: 'CaseFunded event was not found for this wallet and case' }

  const amount = event.args.amount
  if (expectedAmountUsdc) {
    const expected = parseUnits(expectedAmountUsdc, usdcDecimals)
    if (amount !== expected) return { ok: false as const, error: 'funding amount does not match the transaction event' }
  }

  return {
    ok: true as const,
    amountUsdc: formatUnits(amount, usdcDecimals),
  }
}

export async function verifyCaseCancellationReceipt({
  txHash,
  wallet,
  onchainCaseId,
  escrowAddress,
  expectedRefundUsdc,
}: {
  txHash: `0x${string}`
  wallet: string
  onchainCaseId: string
  escrowAddress: `0x${string}`
  expectedRefundUsdc?: string
}) {
  if (env.CASE_ESCROW_ADDRESS && normalizeWallet(escrowAddress) !== normalizeWallet(env.CASE_ESCROW_ADDRESS)) {
    return { ok: false as const, error: 'cancellation escrow address does not match backend escrow configuration' }
  }
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') return { ok: false as const, error: 'cancellation transaction did not succeed' }
  if (normalizeWallet(receipt.from) !== wallet) return { ok: false as const, error: 'cancellation transaction sender does not match wallet' }

  const logs = parseEventLogs({
    abi: caseEscrowFundingAbi,
    logs: receipt.logs.filter((log) => normalizeWallet(log.address) === normalizeWallet(escrowAddress)),
    eventName: 'CaseCancelled',
  })
  const event = logs.find((log) => log.args.caseId?.toString() === onchainCaseId)
  if (!event) return { ok: false as const, error: 'CaseCancelled event was not found for this case' }

  const refund = event.args.refund
  if (expectedRefundUsdc) {
    const expected = parseUnits(expectedRefundUsdc, usdcDecimals)
    if (refund !== expected) return { ok: false as const, error: 'refund amount does not match the transaction event' }
  }

  return {
    ok: true as const,
    refundUsdc: formatUnits(refund, usdcDecimals),
  }
}

export async function verifyCaseOpenedReceipt({
  txHash,
  chainId,
  escrowAddress,
  onchainCaseId,
  budgetUsdc,
  questionHash,
  filer,
}: {
  txHash: `0x${string}`
  chainId: string
  escrowAddress: `0x${string}`
  onchainCaseId: string
  budgetUsdc: string
  questionHash: `0x${string}`
  filer?: `0x${string}`
}) {
  if (String(env.ARC_CHAIN_ID) !== chainId) return { ok: false as const, error: 'case opening chain does not match Arc chain configuration' }
  if (env.CASE_ESCROW_ADDRESS && normalizeWallet(escrowAddress) !== normalizeWallet(env.CASE_ESCROW_ADDRESS)) {
    return { ok: false as const, error: 'case opening escrow address does not match backend escrow configuration' }
  }

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') return { ok: false as const, error: 'case opening transaction did not succeed' }

  const logs = parseEventLogs({
    abi: caseEscrowFundingAbi,
    logs: receipt.logs.filter((log) => normalizeWallet(log.address) === normalizeWallet(escrowAddress)),
    eventName: 'CaseOpened',
  })
  const expectedBudget = parseUnits(budgetUsdc, usdcDecimals)
  const event = logs.find((log) => {
    const args = log.args
    return args.caseId?.toString() === onchainCaseId
      && args.budget === expectedBudget
      && normalizeWallet(args.questionHash ?? '') === normalizeWallet(questionHash)
      && (!filer || args.petitioner?.toLowerCase() === normalizeWallet(filer))
  })
  if (!event) return { ok: false as const, error: 'CaseOpened event was not found with the supplied case id, budget, question hash, and filer' }

  return {
    ok: true as const,
    petitioner: normalizeWallet(event.args.petitioner),
    budgetUsdc: formatUnits(event.args.budget, usdcDecimals),
    metadataURI: event.args.metadataURI,
  }
}
