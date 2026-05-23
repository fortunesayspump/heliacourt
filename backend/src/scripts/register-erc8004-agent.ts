import '../config/env.js'
import { getErc8004AgentDetails, registerErc8004Agent, updateErc8004AgentURI } from '../chains/erc8004.js'

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined
const rpcUrl = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const agentId = BigInt(process.env.HELIA_ERC8004_AGENT_ID ?? '20245')
const agentURI = process.env.HELIA_ERC8004_AGENT_URI ?? 'https://heliacourt.xyz/.well-known/erc8004-agent.json'
const flags = new Set(process.argv.slice(2).filter((arg) => arg !== '--'))

if (flags.has('--info')) {
  const result = await getErc8004AgentDetails({ rpcUrl, agentId })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

if (!privateKey?.startsWith('0x')) throw new Error('PRIVATE_KEY is required')

const result = flags.has('--update-uri')
  ? await updateErc8004AgentURI({
    privateKey,
    rpcUrl,
    agentId,
    agentURI,
  })
  : await registerErc8004Agent({
    privateKey,
    rpcUrl,
    agentURI,
  })

console.log(JSON.stringify(result, null, 2))
