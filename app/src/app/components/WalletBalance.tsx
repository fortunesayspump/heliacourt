'use client'

import { formatUnits } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { contractAddresses, erc20Abi } from '../../lib/contracts'

type WalletBalanceProps = {
  className?: string
  compact?: boolean
  label?: string
}

const usdcDecimals = 6

export function WalletBalance({ className, compact = false, label }: WalletBalanceProps) {
  const { address, isConnected } = useAccount()
  const balance = useReadContract({
    abi: erc20Abi,
    address: contractAddresses.usdc,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && isConnected) },
  })

  if (!isConnected || !address) return null

  const value = typeof balance.data === 'bigint' ? Number(formatUnits(balance.data, usdcDecimals)) : undefined
  const balanceLabel = value === undefined ? 'USDC' : `${formatBalance(value)} USDC`

  return (
    <span className={className ?? `wallet-balance${compact ? ' wallet-balance-compact' : ''}`}>
      {label ? <small>{label}</small> : null}
      <span>{balanceLabel}</span>
    </span>
  )
}

function formatBalance(value: number) {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
