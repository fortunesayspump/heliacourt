'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '../lib/arc'
import { SiteAutoRefresh } from './components/layout/SiteAutoRefresh'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <SiteAutoRefresh />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
