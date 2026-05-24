import type { MarketCase, ToolEvidence } from '../../../court/types'
import { fetchJson, postJson } from '../http'
import { getAddresses, getCaseSearchQuery, getSolanaAddresses } from '../text'

type JsonRpcResponse<T> = {
  result?: T
  error?: {
    message?: string
  }
}

type EtherscanTxResponse = {
  status?: string
  message?: string
  result?: Array<{
    hash?: string
    timeStamp?: string
    from?: string
    to?: string
    value?: string
  }> | string
}

type SolanaSignature = {
  signature?: string
  slot?: number
  blockTime?: number
  err?: unknown
}

const evmRpcUrls = (process.env.EVM_PUBLIC_RPC_URLS ?? process.env.EVM_PUBLIC_RPC_URL ?? 'https://ethereum.publicnode.com,https://eth.llamarpc.com,https://cloudflare-eth.com')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)
const solanaRpcUrl = process.env.SOLANA_PUBLIC_RPC_URL ?? 'https://api.mainnet-beta.solana.com'

export async function getOnchainEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const onchainText = [marketCase.question, marketCase.context, marketCase.links?.join(' '), instruction].filter(Boolean).join(' ')
  const query = getCaseSearchQuery(onchainText)
  const fetchedAt = new Date().toISOString()
  const evmAddresses = getAddresses(onchainText)
  const solanaAddresses = getSolanaAddresses(onchainText)

  if (!evmAddresses.length && !solanaAddresses.length) {
    return {
      capability: 'onchain_data',
      provider: 'public-rpc',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['No EVM or Solana address was found in the case question, context, links, or witness instruction, so address-level onchain reads were skipped.'],
      sources: [],
    }
  }

  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []
  const errors: string[] = []

  for (const address of evmAddresses.slice(0, 2)) {
    const evidence = await getEvmPublicRpcEvidence(address)
    observations.push(...evidence.observations)
    sources.push(...evidence.sources)
    if (evidence.error) errors.push(evidence.error)

    const txEvidence = await getEtherscanEvidence(address)
    observations.push(...txEvidence.observations)
    sources.push(...txEvidence.sources)
    if (txEvidence.error) errors.push(txEvidence.error)
  }

  for (const address of solanaAddresses.slice(0, 2)) {
    const evidence = await getSolanaPublicRpcEvidence(address)
    observations.push(...evidence.observations)
    sources.push(...evidence.sources)
    if (evidence.error) errors.push(evidence.error)
  }

  return {
    capability: 'onchain_data',
    provider: getProviderName(),
    query,
    fetchedAt,
    status: observations.length ? 'ok' : 'error',
    observations,
    sources,
    error: errors.length ? errors.join('; ') : undefined,
  }
}

async function getEvmPublicRpcEvidence(address: string): Promise<Pick<ToolEvidence, 'observations' | 'sources' | 'error'>> {
  const errors: string[] = []

  for (const rpcUrl of evmRpcUrls) {
    const result = await tryGetEvmPublicRpcEvidence(rpcUrl, address)
    if (result.observations.length) return result
    if (result.error) errors.push(`${new URL(rpcUrl).hostname}: ${result.error}`)
  }

  return {
    observations: [],
    sources: [{ title: `${address} on Etherscan`, url: `https://etherscan.io/address/${address}` }],
    error: errors.join('; ') || 'All EVM public RPC endpoints failed',
  }
}

async function tryGetEvmPublicRpcEvidence(rpcUrl: string, address: string): Promise<Pick<ToolEvidence, 'observations' | 'sources' | 'error'>> {
  try {
    const [balance, transactionCount] = await Promise.all([
      postJson<JsonRpcResponse<string>>(rpcUrl, {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
      postJson<JsonRpcResponse<string>>(rpcUrl, {
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: [address, 'latest'],
        id: 2,
      }),
    ])

    if (balance.error || transactionCount.error) {
      throw new Error(balance.error?.message ?? transactionCount.error?.message ?? 'EVM RPC error')
    }

    const eth = balance.result ? Number(BigInt(balance.result)) / 1e18 : 0
    const nonce = transactionCount.result ? Number(BigInt(transactionCount.result)) : 0

    return {
      observations: [
        `${address} has about ${eth.toFixed(4)} ETH on Ethereum public RPC (${new URL(rpcUrl).hostname}). Public RPC also reports account nonce ${nonce.toLocaleString('en-US')}; for contracts this is not token-transfer volume or full contract activity.`,
      ],
      sources: [{ title: `${address} on Etherscan`, url: `https://etherscan.io/address/${address}`, value: `${eth}` }],
    }
  } catch (error) {
    return {
      observations: [],
      sources: [],
      error: error instanceof Error ? error.message : 'EVM public RPC failed',
    }
  }
}

async function getEtherscanEvidence(address: string): Promise<Pick<ToolEvidence, 'observations' | 'sources' | 'error'>> {
  if (!process.env.ETHERSCAN_API_KEY) {
    return {
      observations: [],
      sources: [],
      error: 'ETHERSCAN_API_KEY is not configured; skipped indexed EVM transaction history.',
    }
  }

  try {
    const payload = await fetchJson<EtherscanTxResponse>(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&page=1&offset=5&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`,
    )

    if (payload.status === '0' || typeof payload.result === 'string') {
      throw new Error(payload.message ?? String(payload.result))
    }

    const transactions = payload.result ?? []

    return {
      observations: transactions.map((tx) => {
        const eth = tx.value ? Number(tx.value) / 1e18 : 0
        return `${tx.hash ?? 'transaction'} moved ${eth.toFixed(4)} ETH from ${tx.from ?? 'unknown'} to ${tx.to ?? 'unknown'}.`
      }),
      sources: transactions.map((tx) => ({
        title: tx.hash ?? 'Etherscan transaction',
        url: tx.hash ? `https://etherscan.io/tx/${tx.hash}` : undefined,
        observedAt: tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : undefined,
        value: tx.value,
      })),
    }
  } catch (error) {
    return {
      observations: [],
      sources: [],
      error: error instanceof Error ? error.message : 'Etherscan indexed history failed',
    }
  }
}

async function getSolanaPublicRpcEvidence(address: string): Promise<Pick<ToolEvidence, 'observations' | 'sources' | 'error'>> {
  try {
    const [balance, signatures] = await Promise.all([
      postJson<JsonRpcResponse<{ value?: number }>>(solanaRpcUrl, {
        jsonrpc: '2.0',
        method: 'getBalance',
        params: [address],
        id: 1,
      }),
      postJson<JsonRpcResponse<SolanaSignature[]>>(solanaRpcUrl, {
        jsonrpc: '2.0',
        method: 'getSignaturesForAddress',
        params: [address, { limit: 5 }],
        id: 2,
      }),
    ])

    if (balance.error || signatures.error) {
      throw new Error(balance.error?.message ?? signatures.error?.message ?? 'Solana RPC error')
    }

    const sol = (balance.result?.value ?? 0) / 1e9
    const recent = signatures.result ?? []

    return {
      observations: [
        `${address} has about ${sol.toFixed(4)} SOL and ${recent.length} recent signatures from Solana public RPC.`,
        ...recent.slice(0, 2).map((item) => `${item.signature ?? 'signature'} at slot ${item.slot ?? 'unknown slot'}.`),
      ],
      sources: [
        { title: `${address} on Solscan`, url: `https://solscan.io/account/${address}`, value: `${sol}` },
        ...recent.map((item) => ({
          title: item.signature ?? 'Solana signature',
          url: item.signature ? `https://solscan.io/tx/${item.signature}` : undefined,
          observedAt: item.blockTime ? new Date(item.blockTime * 1000).toISOString() : undefined,
        })),
      ],
    }
  } catch (error) {
    return {
      observations: [],
      sources: [{ title: `${address} on Solscan`, url: `https://solscan.io/account/${address}` }],
      error: error instanceof Error ? error.message : 'Solana public RPC failed',
    }
  }
}

function getProviderName() {
  const providers = ['public-evm-rpc', 'public-solana-rpc']

  if (process.env.ETHERSCAN_API_KEY) {
    providers.push('etherscan-v2')
  }

  return providers.join('+')
}
