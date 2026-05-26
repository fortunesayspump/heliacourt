'use client'

import { useEffect } from 'react'
import { formatUnits, zeroAddress } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { arcTestnet } from '../../../lib/arc'
import { contractAddresses, gatewayWalletAbi } from '../../../lib/contracts'

type GatewayBalanceProps = {
  className?: string
  compact?: boolean
}

const usdcDecimals = 6

export function GatewayBalance({ className, compact = false }: GatewayBalanceProps) {
  const { address, isConnected } = useAccount()
  const balances = useReadContracts({
    chainId: arcTestnet.id,
    contracts: address ? [
      {
        abi: gatewayWalletAbi,
        address: contractAddresses.gatewayWallet,
        functionName: 'availableBalance',
        args: [contractAddresses.usdc, address],
      },
      {
        abi: gatewayWalletAbi,
        address: contractAddresses.gatewayWallet,
        functionName: 'totalBalance',
        args: [contractAddresses.usdc, address],
      },
    ] : [],
    query: {
      enabled: Boolean(address && isConnected && contractAddresses.gatewayWallet !== zeroAddress),
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      staleTime: 0,
    },
  })

  useEffect(() => {
    const refresh = () => {
      if (!address || !isConnected) return
      void balances.refetch()
    }
    window.addEventListener('helia:gateway-balance-updated', refresh)
    window.addEventListener('helia:x402-paid-read', refresh)
    return () => {
      window.removeEventListener('helia:gateway-balance-updated', refresh)
      window.removeEventListener('helia:x402-paid-read', refresh)
    }
  }, [address, balances, isConnected])

  if (!isConnected || !address) return null

  const available = balances.data?.[0]?.result
  const total = balances.data?.[1]?.result
  const value = typeof available === 'bigint' ? Number(formatUnits(available, usdcDecimals)) : undefined
  const totalValue = typeof total === 'bigint' ? Number(formatUnits(total, usdcDecimals)) : undefined
  const label = value === undefined ? 'Gateway' : `${formatBalance(value)} USDC`

  return (
    <span className={className ?? `wallet-balance gateway-balance${compact ? ' wallet-balance-compact' : ''}`} title={totalValue === undefined ? 'Circle Gateway balance' : `Gateway total ${formatBalance(totalValue)} USDC`}>
      <small>Gateway</small>
      <span>{label}</span>
    </span>
  )
}

function formatBalance(value: number) {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
