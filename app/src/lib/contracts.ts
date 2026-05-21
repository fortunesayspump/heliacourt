import { isAddress, zeroAddress, type Address } from 'viem'

function publicAddress(value?: string): Address | undefined {
  const trimmed = value?.trim()
  return trimmed && isAddress(trimmed) ? trimmed : undefined
}

export const contractAddresses = {
  usdc: publicAddress(process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS) ?? '0x3600000000000000000000000000000000000000',
  agentRegistry: publicAddress(process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS),
  caseEscrow: publicAddress(process.env.NEXT_PUBLIC_CASE_ESCROW_ADDRESS),
  courtReceipts: publicAddress(process.env.NEXT_PUBLIC_COURT_RECEIPTS_ADDRESS),
} as const

export const hasCaseEscrowAddress = Boolean(contractAddresses.caseEscrow && contractAddresses.caseEscrow !== zeroAddress)

export const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const caseEscrowAbi = [
  {
    type: 'function',
    name: 'nextCaseId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'openCase',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'budget', type: 'uint96' },
      { name: 'questionHash', type: 'bytes32' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [{ name: 'caseId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'addFunding',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'caseId', type: 'uint256' },
      { name: 'amount', type: 'uint96' },
    ],
    outputs: [],
  },
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
] as const
