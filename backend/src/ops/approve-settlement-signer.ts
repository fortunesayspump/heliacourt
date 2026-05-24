import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from '../chains/arc-testnet.js'
import '../config/env.js'

const caseEscrowAbi = [
  {
    type: 'function',
    name: 'setClerk',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'clerk', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const

const courtReceiptsAbi = [
  {
    type: 'function',
    name: 'setRecorder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recorder', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const

const ownerPrivateKey = process.env.PRIVATE_KEY as Hex | undefined
const settlementPrivateKey = process.env.SETTLEMENT_PRIVATE_KEY as Hex | undefined
const caseEscrowAddress = asAddress(process.env.CASE_ESCROW_ADDRESS)
const courtReceiptsAddress = asAddress(process.env.COURT_RECEIPTS_ADDRESS)
const rpcUrl = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'

if (!ownerPrivateKey?.startsWith('0x')) throw new Error('PRIVATE_KEY owner/admin key is required')
if (!settlementPrivateKey?.startsWith('0x')) throw new Error('SETTLEMENT_PRIVATE_KEY is required')
if (!caseEscrowAddress) throw new Error('CASE_ESCROW_ADDRESS is required')
if (!courtReceiptsAddress) throw new Error('COURT_RECEIPTS_ADDRESS is required')

const owner = privateKeyToAccount(ownerPrivateKey)
const settlement = privateKeyToAccount(settlementPrivateKey)
const walletClient = createWalletClient({
  account: owner,
  chain: arcTestnet,
  transport: http(rpcUrl),
})
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl),
})

const clerkTx = await walletClient.writeContract({
  address: caseEscrowAddress,
  abi: caseEscrowAbi,
  functionName: 'setClerk',
  args: [settlement.address, true],
})
await publicClient.waitForTransactionReceipt({ hash: clerkTx })

const recorderTx = await walletClient.writeContract({
  address: courtReceiptsAddress,
  abi: courtReceiptsAbi,
  functionName: 'setRecorder',
  args: [settlement.address, true],
})
await publicClient.waitForTransactionReceipt({ hash: recorderTx })

console.log(JSON.stringify({
  settlementSigner: settlement.address,
  caseEscrowClerkTx: clerkTx,
  courtReceiptsRecorderTx: recorderTx,
}, null, 2))

function asAddress(value: string | undefined): Address | undefined {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value as Address : undefined
}
