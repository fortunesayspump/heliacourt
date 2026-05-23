'use client'

import { formatUnits } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { contractAddresses, gatewayWalletAbi } from '../../lib/contracts'

type GatewayBalanceProps = {
  className?: string
  compact?: boolean
}

const usdcDecimals = 6

export function GatewayBalance({ className, compact = false }: GatewayBalanceProps) {
  const { address, isConnected } = useAccount()
  const balances = useReadContracts({
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
    query: { enabled: Boolean(address && isConnected) },
  })

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
