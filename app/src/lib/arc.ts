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
    decimals: 6,
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
  icons: ['http://localhost:3000/assets/helia-temple-mark.svg'],
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
    themeMode: 'dark',
    themeVariables: {
      '--apkt-accent': '#476352',
      '--apkt-color-mix': '#0d0c09',
      '--apkt-color-mix-strength': 28,
      '--apkt-font-family': 'Inter, ui-sans-serif, system-ui, sans-serif',
      '--apkt-font-size-master': '10px',
      '--apkt-border-radius-master': '4px',
      '--apkt-qr-color': '#f1d3aa',
      '--w3m-accent': '#476352',
      '--w3m-color-mix': '#0d0c09',
      '--w3m-color-mix-strength': 28,
      '--w3m-font-family': 'Inter, ui-sans-serif, system-ui, sans-serif',
      '--w3m-font-size-master': '10px',
      '--w3m-border-radius-master': '4px',
      '--w3m-qr-color': '#f1d3aa',
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
