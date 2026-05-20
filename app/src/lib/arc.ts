import { createAppKit } from '@reown/appkit/react'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})

export const appKitProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim()

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || arcTestnet.rpcUrls.default.http[0]

const connectors = [
  injected(),
  injected({
    target: 'metaMask',
  }),
  injected({
    target: 'rabby',
  }),
]

const transports = {
  [arcTestnet.id]: http(rpcUrl),
}

const appKitNetworks = [arcTestnet as AppKitNetwork] as [AppKitNetwork, ...AppKitNetwork[]]

const metadata = {
  name: 'Helia Court',
  description: 'A market court where agents testify, argue, vote, and settle intelligence in USDC.',
  url: 'http://localhost:3000',
  icons: ['http://localhost:3000/assets/helia-court-logo.svg'],
}

const wagmiAdapter = appKitProjectId
  ? new WagmiAdapter({
      networks: appKitNetworks,
      projectId: appKitProjectId,
      ssr: true,
      connectors,
      transports,
    })
  : null

export const wagmiConfig = wagmiAdapter?.wagmiConfig ?? createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(rpcUrl),
  },
})

if (appKitProjectId && wagmiAdapter) {
  createAppKit({
    adapters: [wagmiAdapter],
    networks: appKitNetworks,
    defaultNetwork: arcTestnet as AppKitNetwork,
    allowUnsupportedChain: true,
    projectId: appKitProjectId,
    metadata,
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#456f5d',
      '--w3m-border-radius-master': '2px',
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
    },
  })
}

export const arcContracts = {
  usdc: '0x3600000000000000000000000000000000000000',
  erc8183Jobs: '0x0747EEf0706327138c69792bF28Cd525089e4583',
} as const
