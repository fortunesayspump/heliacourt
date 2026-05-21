import { createPublicClient, createWalletClient, http, parseUnits, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from '../chains/arc-testnet.js'
import '../config/env.js'
import { getAgentRegistryWithOnchainProfiles } from '../agents/registry.js'

const agentRegistryAbi = [
  {
    type: 'function',
    name: 'registerAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentOwner', type: 'address' },
      { name: 'payoutWallet', type: 'address' },
      { name: 'role', type: 'string' },
      { name: 'metadataURI', type: 'string' },
      { name: 'feeQuote', type: 'uint96' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
] as const

const registryAddress = asAddress(process.env.AGENT_REGISTRY_ADDRESS)
const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined
const rpcUrl = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'

if (!registryAddress) throw new Error('AGENT_REGISTRY_ADDRESS is required')
if (!privateKey?.startsWith('0x')) throw new Error('PRIVATE_KEY is required')

const account = privateKeyToAccount(privateKey)
const client = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(rpcUrl),
})
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl),
})

const agents = getAgentRegistryWithOnchainProfiles()
  .filter((agent) => agent.enabled)
  .filter((agent) => agent.onchain.registrationStatus === 'protocol-wallet-ready' || agent.onchain.registrationStatus === 'external-wallet-ready')

if (!agents.length) {
  console.log('No wallet-ready agents to register. Set HELIA_PROTOCOL_AGENT_OWNER_WALLET and HELIA_PROTOCOL_AGENT_PAYOUT_WALLET for first-party agents.')
  process.exit(0)
}

for (const agent of agents) {
  const ownerWallet = agent.onchain.ownerWallet
  const payoutWallet = agent.onchain.payoutWallet
  if (!ownerWallet || !payoutWallet) continue

  const feeQuote = parseUnits(agent.priceUsd.toFixed(6), 6)
  if (feeQuote > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${agent.id} fee quote is too large for the current sync guard`)
  }

  const hash = await client.writeContract({
    abi: agentRegistryAbi,
    address: registryAddress,
    functionName: 'registerAgent',
    args: [
      ownerWallet,
      payoutWallet,
      agent.seat,
      agent.onchain.metadataURI ?? `helia-agent://${agent.id}@${agent.version}`,
      feeQuote,
    ],
  })

  console.log(`${agent.id} -> register tx ${hash}`)
  await publicClient.waitForTransactionReceipt({ hash })
}

function asAddress(value: string | undefined): Address | undefined {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value as Address : undefined
}
