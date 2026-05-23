import { createHash } from 'node:crypto'
import { createPublicClient, createWalletClient, http, keccak256, parseAbiItem, parseUnits, toBytes, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getAgentRegistryWithOnchainProfiles } from '../agents/registry.js'
import { env } from '../config/env.js'
import type { CourtArtifact, CourtTranscriptTurn, MarketCase } from '../court/types.js'
import { arcTestnet } from './arc-testnet.js'

const caseEscrowAbi = [
  {
    type: 'function',
    name: 'cases',
    stateMutability: 'view',
    inputs: [{ name: 'caseId', type: 'uint256' }],
    outputs: [
      { name: 'petitioner', type: 'address' },
      { name: 'budget', type: 'uint96' },
      { name: 'paidOut', type: 'uint96' },
      { name: 'status', type: 'uint8' },
      { name: 'questionHash', type: 'bytes32' },
      { name: 'metadataURI', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'payAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'caseId', type: 'uint256' },
      { name: 'agentWallet', type: 'address' },
      { name: 'amount', type: 'uint96' },
      { name: 'reasonHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'closeCase',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'caseId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelCase',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'caseId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'AgentPaid',
    inputs: [
      { name: 'caseId', type: 'uint256', indexed: true },
      { name: 'agentWallet', type: 'address', indexed: true },
      { name: 'amount', type: 'uint96', indexed: false },
      { name: 'reasonHash', type: 'bytes32', indexed: false },
    ],
  },
] as const

const courtReceiptsAbi = [
  {
    type: 'function',
    name: 'recordCaseEvent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'caseId', type: 'uint256' },
      { name: 'eventType', type: 'bytes32' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'recordVerdict',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'caseId', type: 'uint256' },
      { name: 'verdictHash', type: 'bytes32' },
      { name: 'confidenceBps', type: 'uint16' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [],
  },
] as const

const agentPaidEvent = parseAbiItem('event AgentPaid(uint256 indexed caseId, address indexed agentWallet, uint96 amount, bytes32 reasonHash)')

export type OnchainSettlementReceipt = {
  type: 'case-event' | 'verdict' | 'agent-payout' | 'case-close' | 'case-cancel'
  txHash: Hex
  chainId: string
  caseId: string
  recordHash?: Hex
  amountUsdc?: string
  agentId?: string
  wallet?: Address
}

export type OnchainSettlementResult = {
  status: 'skipped' | 'recorded' | 'refunded' | 'error'
  reason?: string
  receipts: OnchainSettlementReceipt[]
  recordHash?: Hex
  verdictHash?: Hex
  totalBudgetUsdc?: string
  protocolFeeUsdc?: string
  totalPayoutUsdc?: string
  capped?: boolean
}

export async function settleHearingOnchain(input: {
  marketCase: MarketCase
  artifacts: CourtArtifact[]
  transcript: CourtTranscriptTurn[]
  recordHash?: string
}): Promise<OnchainSettlementResult> {
  const onchainCase = input.marketCase.onchain
  if (!onchainCase) return { status: 'skipped', reason: 'case was not opened onchain', receipts: [] }
  const signerKey = env.SETTLEMENT_PRIVATE_KEY ?? env.PRIVATE_KEY
  if (!signerKey) return { status: 'skipped', reason: 'SETTLEMENT_PRIVATE_KEY or PRIVATE_KEY is not configured for backend settlement', receipts: [] }
  if (!env.CASE_ESCROW_ADDRESS || !env.COURT_RECEIPTS_ADDRESS) {
    return { status: 'skipped', reason: 'escrow or receipts contract address is missing', receipts: [] }
  }

  const account = privateKeyToAccount(signerKey as Hex)
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(env.ARC_RPC_URL),
  })
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(env.ARC_RPC_URL),
  })

  const caseId = BigInt(onchainCase.caseId)
  const escrowState = await publicClient.readContract({
    address: env.CASE_ESCROW_ADDRESS as Address,
    abi: caseEscrowAbi,
    functionName: 'cases',
    args: [caseId],
  })
  const escrowBudget = escrowState[1]
  const alreadyPaidOut = escrowState[2]
  const escrowStatus = Number(escrowState[3])
  const fundingReceipt = await publicClient.getTransactionReceipt({ hash: onchainCase.txHash as Hex }).catch(() => undefined)
  const fromBlock = fundingReceipt?.blockNumber ?? 0n
  const recordHash = toBytes32(input.recordHash) ?? hashStable({
    case: input.marketCase,
    artifacts: input.artifacts.map((artifact) => ({
      id: artifact.id,
      agentId: artifact.agentId,
      type: artifact.type,
      summary: artifact.summary,
      confidence: artifact.confidence,
      createdAt: artifact.createdAt,
    })),
    transcript: input.transcript.map((turn) => ({
      id: turn.id,
      agentId: turn.agentId,
      kind: turn.kind,
      stage: turn.stage,
      message: turn.message,
      createdAt: turn.createdAt,
    })),
  })
  const verdict = input.artifacts.filter((artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge').at(-1)
  const verdictHash = hashStable(verdict ?? { verdict: 'pending', caseId: input.marketCase.id })
  const confidenceBps = Math.max(0, Math.min(10_000, Math.round((verdict?.confidence ?? 0) * 10_000)))
  const uriBase = onchainCase.metadataURI || `helia-case://${input.marketCase.id}`
  const receipts: OnchainSettlementReceipt[] = []

  const eventHash = await writeAndWait(walletClient, publicClient, {
    address: env.COURT_RECEIPTS_ADDRESS as Address,
    abi: courtReceiptsAbi,
    functionName: 'recordCaseEvent',
    args: [
      caseId,
      keccak256(toBytes('HEARING_RECORD')),
      recordHash,
      `${uriBase}#hearing-record`,
    ],
  })
  receipts.push({
    type: 'case-event',
    txHash: eventHash,
    chainId: String(env.ARC_CHAIN_ID),
    caseId: onchainCase.caseId,
    recordHash,
  })

  const verdictTx = await writeAndWait(walletClient, publicClient, {
    address: env.COURT_RECEIPTS_ADDRESS as Address,
    abi: courtReceiptsAbi,
    functionName: 'recordVerdict',
    args: [
      caseId,
      verdictHash,
      confidenceBps,
      `${uriBase}#verdict`,
    ],
  })
  receipts.push({
    type: 'verdict',
    txHash: verdictTx,
    chainId: String(env.ARC_CHAIN_ID),
    caseId: onchainCase.caseId,
    recordHash: verdictHash,
  })

  const payoutPlan = buildPayoutPlan(input.artifacts, escrowBudget, alreadyPaidOut)
  for (const payout of payoutPlan.payouts) {
    const txHash = await writeAndWait(walletClient, publicClient, {
      address: env.CASE_ESCROW_ADDRESS as Address,
      abi: caseEscrowAbi,
      functionName: 'payAgent',
      args: [
        caseId,
        payout.wallet,
        payout.amount,
        hashStable({
          caseId: input.marketCase.id,
          agentId: payout.agentId,
          amount: payout.amount.toString(),
          reason: 'hearing-agent-payout',
        }),
      ],
    })
    receipts.push({
      type: 'agent-payout',
      txHash,
      chainId: String(env.ARC_CHAIN_ID),
      caseId: onchainCase.caseId,
      amountUsdc: formatUsdc(payout.amount),
      agentId: payout.agentId,
      wallet: payout.wallet,
    })
  }

  receipts.push(...await readAgentPayoutReceipts(publicClient, caseId, onchainCase.caseId, fromBlock))

  if (escrowStatus === 1) {
    const closeTx = await writeAndWait(walletClient, publicClient, {
      address: env.CASE_ESCROW_ADDRESS as Address,
      abi: caseEscrowAbi,
      functionName: 'closeCase',
      args: [caseId],
    })
    receipts.push({
      type: 'case-close',
      txHash: closeTx,
      chainId: String(env.ARC_CHAIN_ID),
      caseId: onchainCase.caseId,
    })
  }

  return {
    status: 'recorded',
    receipts: dedupeReceipts(receipts),
    recordHash,
    verdictHash,
    totalBudgetUsdc: formatUsdc(escrowBudget),
    protocolFeeUsdc: formatUsdc(payoutPlan.protocolFee),
    totalPayoutUsdc: formatUsdc(payoutPlan.totalPaid),
    capped: payoutPlan.capped,
  }
}

export async function cancelHearingOnchain(input: {
  marketCase: MarketCase
  reason: string
}): Promise<OnchainSettlementResult> {
  const onchainCase = input.marketCase.onchain
  if (!onchainCase) return { status: 'skipped', reason: 'case was not opened onchain', receipts: [] }
  const signerKey = env.SETTLEMENT_PRIVATE_KEY ?? env.PRIVATE_KEY
  if (!signerKey) return { status: 'skipped', reason: 'SETTLEMENT_PRIVATE_KEY or PRIVATE_KEY is not configured for backend settlement', receipts: [] }
  if (!env.CASE_ESCROW_ADDRESS) return { status: 'skipped', reason: 'escrow contract address is missing', receipts: [] }

  const account = privateKeyToAccount(signerKey as Hex)
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(env.ARC_RPC_URL),
  })
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(env.ARC_RPC_URL),
  })

  const caseId = BigInt(onchainCase.caseId)
  const escrowState = await publicClient.readContract({
    address: env.CASE_ESCROW_ADDRESS as Address,
    abi: caseEscrowAbi,
    functionName: 'cases',
    args: [caseId],
  })
  const petitioner = escrowState[0]
  const escrowBudget = escrowState[1]
  const alreadyPaidOut = escrowState[2]
  const escrowStatus = Number(escrowState[3])
  const refundableAmount = escrowBudget > alreadyPaidOut ? escrowBudget - alreadyPaidOut : 0n

  if (escrowStatus === 3) {
    return {
      status: 'refunded',
      reason: 'case was already cancelled onchain',
      receipts: [],
      totalBudgetUsdc: formatUsdc(escrowBudget),
      totalPayoutUsdc: formatUsdc(alreadyPaidOut),
    }
  }

  if (escrowStatus !== 1) {
    return {
      status: 'skipped',
      reason: `case status ${escrowStatus} cannot be cancelled`,
      receipts: [],
      totalBudgetUsdc: formatUsdc(escrowBudget),
      totalPayoutUsdc: formatUsdc(alreadyPaidOut),
    }
  }

  const txHash = await writeAndWait(walletClient, publicClient, {
    address: env.CASE_ESCROW_ADDRESS as Address,
    abi: caseEscrowAbi,
    functionName: 'cancelCase',
    args: [caseId],
  })

  return {
    status: 'refunded',
    reason: input.reason,
    receipts: [{
      type: 'case-cancel',
      txHash,
      chainId: String(env.ARC_CHAIN_ID),
      caseId: onchainCase.caseId,
      recordHash: hashStable({ caseId: input.marketCase.id, reason: input.reason, action: 'hearing-auto-refund' }),
      amountUsdc: formatUsdc(refundableAmount),
      wallet: petitioner,
    }],
    totalBudgetUsdc: formatUsdc(escrowBudget),
    totalPayoutUsdc: formatUsdc(alreadyPaidOut),
  }
}

async function readAgentPayoutReceipts(
  publicClient: ReturnType<typeof createPublicClient>,
  caseId: bigint,
  displayCaseId: string,
  fromBlock: bigint,
): Promise<OnchainSettlementReceipt[]> {
  const agentsByWallet = new Map(
    getAgentRegistryWithOnchainProfiles()
      .map((agent) => [agent.onchain.payoutWallet?.toLowerCase(), agent.id] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[0])),
  )
  const latestBlock = await publicClient.getBlockNumber()
  const logs: Array<{
    transactionHash: Hex
    args: {
      amount?: bigint
      agentWallet?: Address
    }
  }> = []
  const step = 9_000n
  for (let start = fromBlock; start <= latestBlock; start += step + 1n) {
    const end = start + step > latestBlock ? latestBlock : start + step
    const chunk = await publicClient.getLogs({
      address: env.CASE_ESCROW_ADDRESS as Address,
      event: agentPaidEvent,
      args: { caseId },
      fromBlock: start,
      toBlock: end,
    }).catch(() => []) as typeof logs
    logs.push(...chunk)
  }

  return logs.map((log) => ({
    type: 'agent-payout' as const,
    txHash: log.transactionHash,
    chainId: String(env.ARC_CHAIN_ID),
    caseId: displayCaseId,
    amountUsdc: formatUsdc(log.args.amount ?? 0n),
    agentId: agentsByWallet.get(log.args.agentWallet?.toLowerCase() ?? ''),
    wallet: log.args.agentWallet,
  }))
}

function dedupeReceipts(receipts: OnchainSettlementReceipt[]) {
  const seen = new Set<string>()
  return receipts.filter((receipt) => {
    const key = `${receipt.type}:${receipt.txHash}:${receipt.agentId ?? ''}:${receipt.amountUsdc ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildPayoutPlan(artifacts: CourtArtifact[], budget: bigint, alreadyPaidOut = 0n) {
  const agents = new Map(getAgentRegistryWithOnchainProfiles().map((agent) => [agent.id, agent]))
  const requested = new Map<string, bigint>()

  for (const artifact of artifacts) {
    if (!artifact.costUsd || artifact.costUsd <= 0) continue
    const agent = agents.get(artifact.agentId)
    const wallet = agent?.onchain.payoutWallet
    if (!wallet) continue

    const feeUsd = agent.priceUsd > 0 ? agent.priceUsd : artifact.costUsd
    if (feeUsd <= 0) continue

    requested.set(artifact.agentId, (requested.get(artifact.agentId) ?? 0n) + parseUsdc(feeUsd))
  }

  const protocolFee = (budget * BigInt(env.PROTOCOL_FEE_BPS)) / 10_000n
  const totalPayableBudget = budget > protocolFee ? budget - protocolFee : 0n
  const payableBudget = totalPayableBudget > alreadyPaidOut ? totalPayableBudget - alreadyPaidOut : 0n
  const requestedTotal = [...requested.values()].reduce((total, amount) => total + amount, 0n)
  const capped = requestedTotal > payableBudget || alreadyPaidOut > 0n
  const payouts = [...requested.entries()]
    .map(([agentId, amount]) => {
      const agent = agents.get(agentId)
      const wallet = agent?.onchain.payoutWallet
      if (!wallet) return undefined
      const scaledAmount = capped && requestedTotal > 0n ? (amount * payableBudget) / requestedTotal : amount
      if (scaledAmount <= 0n) return undefined

      return {
        agentId,
        wallet,
        amount: scaledAmount,
      }
    })
    .filter((payout): payout is { agentId: string; wallet: Address; amount: bigint } => Boolean(payout))

  return {
    payouts,
    totalPaid: alreadyPaidOut + payouts.reduce((total, payout) => total + payout.amount, 0n),
    protocolFee,
    capped,
  }
}

async function writeAndWait(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  request: Record<string, unknown>,
) {
  const txHash = await walletClient.writeContract({
    ...request,
    account: walletClient.account!,
    chain: arcTestnet,
  } as never)
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return txHash
}

function hashStable(value: unknown): Hex {
  const json = JSON.stringify(sortForHash(value))
  return keccak256(toBytes(json))
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortForHash(item)]),
  )
}

function toBytes32(value?: string): Hex | undefined {
  if (value && /^0x[a-fA-F0-9]{64}$/.test(value)) return value as Hex
  if (!value) return undefined

  return `0x${createHash('sha256').update(value).digest('hex')}` as Hex
}

function parseUsdc(value: number) {
  return parseUnits(value.toFixed(6), 6)
}

function formatUsdc(value: bigint) {
  const whole = value / 1_000_000n
  const decimals = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return decimals ? `${whole}.${decimals}` : whole.toString()
}
