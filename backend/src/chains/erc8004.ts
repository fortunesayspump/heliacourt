import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from './arc-testnet.js'

export const arcErc8004 = {
  chainId: arcTestnet.id,
  caip2: `eip155:${arcTestnet.id}`,
  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address,
  reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as Address,
  validationRegistry: '0x8004Cb1BF31DAf7788923b405b754f57acEB4272' as Address,
}

export const erc8004IdentityRegistryAbi = parseAbi([
  'function register(string agentURI) external returns (uint256)',
  'function setAgentURI(uint256 agentId, string newURI) external',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])

export type RegisterErc8004AgentOptions = {
  privateKey: `0x${string}`
  rpcUrl: string
  agentURI: string
}

export async function registerErc8004Agent(options: RegisterErc8004AgentOptions) {
  const account = privateKeyToAccount(options.privateKey)
  const transport = http(options.rpcUrl)
  const publicClient = createPublicClient({ chain: arcTestnet, transport })
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport })

  const { request, result } = await publicClient.simulateContract({
    address: arcErc8004.identityRegistry,
    abi: erc8004IdentityRegistryAbi,
    functionName: 'register',
    args: [options.agentURI],
    account,
  })

  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  const logs = parseEventLogs({
    abi: erc8004IdentityRegistryAbi,
    logs: receipt.logs,
  })
  const registered = logs.find((log) => log.eventName === 'Registered')
  const transfer = logs.find((log) => log.eventName === 'Transfer')
  const agentId = registered?.args.agentId ?? transfer?.args.tokenId ?? result

  return {
    agentId: agentId.toString(),
    owner: account.address,
    agentURI: options.agentURI,
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    chainId: arcTestnet.id,
    caip2: arcErc8004.caip2,
    identityRegistry: arcErc8004.identityRegistry,
    reputationRegistry: arcErc8004.reputationRegistry,
    validationRegistry: arcErc8004.validationRegistry,
  }
}
