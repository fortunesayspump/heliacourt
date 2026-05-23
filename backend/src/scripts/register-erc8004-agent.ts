import '../config/env.js'
import { registerErc8004Agent } from '../chains/erc8004.js'

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined
const rpcUrl = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const agentURI = process.env.HELIA_ERC8004_AGENT_URI ?? 'https://heliacourt.xyz/.well-known/erc8004-agent.json'

if (!privateKey?.startsWith('0x')) throw new Error('PRIVATE_KEY is required')

const result = await registerErc8004Agent({
  privateKey,
  rpcUrl,
  agentURI,
})

console.log(JSON.stringify(result, null, 2))
