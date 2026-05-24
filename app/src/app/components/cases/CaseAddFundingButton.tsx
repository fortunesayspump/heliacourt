'use client'

import { CurrencyDollar } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { formatUnits, parseEventLogs, parseUnits } from 'viem'
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { arcTestnet } from '../../../lib/arc'
import { caseEscrowAbi, contractAddresses, erc20Abi } from '../../../lib/contracts'
import { ActionStatus, type ActionStatusState } from '../ui/ActionStatus'
import { WalletButton } from '../wallet/WalletButton'

type CaseOnchain = {
  chainId: string
  escrowAddress: `0x${string}`
  caseId: string
}

const usdcDecimals = 6
const zero = BigInt(0)

export function CaseAddFundingButton({ caseId, onchain }: { caseId: string; onchain?: CaseOnchain }) {
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const { address, chainId, isConnected } = useAccount()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync, isPending } = useWriteContract()
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<ActionStatusState | undefined>()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const amountUnits = useMemo(() => safeAmount(amount), [amount])
  const escrowAddress = onchain?.escrowAddress ?? contractAddresses.caseEscrow
  const balance = useReadContract({
    abi: erc20Abi,
    address: contractAddresses.usdc,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })
  const allowance = useReadContract({
    abi: erc20Abi,
    address: contractAddresses.usdc,
    functionName: 'allowance',
    args: address && escrowAddress ? [address, escrowAddress] : undefined,
    query: { enabled: Boolean(address && escrowAddress) },
  })

  const balanceValue = typeof balance.data === 'bigint' ? balance.data : zero
  const allowanceValue = typeof allowance.data === 'bigint' ? allowance.data : zero
  const needsApproval = amountUnits > zero && allowanceValue < amountUnits
  const wrongChain = isConnected && chainId !== arcTestnet.id

  const addFunding = async () => {
    if (!onchain || !escrowAddress) {
      setStatus({ text: 'This case does not have an Arc escrow record.', tone: 'error' })
      return
    }
    if (!isConnected || !address) {
      setStatus({ text: 'Connect a wallet first.', tone: 'error' })
      return
    }
    if (!publicClient) {
      setStatus({ text: 'Arc RPC client is not ready.', tone: 'error' })
      return
    }
    if (wrongChain) {
      setStatus({ text: 'Switching wallet to Arc testnet...', tone: 'loading' })
      await switchChainAsync({ chainId: arcTestnet.id })
      return
    }
    if (amountUnits <= zero) {
      setStatus({ text: 'Enter a USDC amount to add.', tone: 'error' })
      return
    }
    if (balanceValue < amountUnits) {
      setStatus({ text: `Wallet balance is ${formatUnits(balanceValue, usdcDecimals)} USDC.`, tone: 'error' })
      return
    }

    try {
      if (needsApproval) {
        setStatus({ text: 'Approving USDC for CaseEscrow...', tone: 'loading' })
        const approveHash = await writeContractAsync({
          abi: erc20Abi,
          address: contractAddresses.usdc,
          functionName: 'approve',
          args: [escrowAddress, amountUnits],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }

      setStatus({ text: 'Adding funding to the escrow...', tone: 'loading' })
      const txHash = await writeContractAsync({
        abi: caseEscrowAbi,
        address: escrowAddress,
        functionName: 'addFunding',
        args: [BigInt(onchain.caseId), amountUnits],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      const [funded] = parseEventLogs({
        abi: caseEscrowAbi,
        logs: receipt.logs,
        eventName: 'CaseFunded',
      })
      if (!funded) throw new Error('CaseFunded event was not found in the transaction receipt.')

      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/funding`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          wallet: address,
          chainId: String(arcTestnet.id),
          txHash,
          amountUsdc: formatUnits(amountUnits, usdcDecimals),
        }),
      })
      const payload = await response.json().catch(() => ({ error: 'funding API returned a non-json response' }))
      if (!response.ok) throw new Error(payload.error ?? 'funding receipt was not recorded')

      setAmount('')
      setStatus({ text: `Added ${payload.amountUsdc} USDC to this case.`, tone: 'success' })
      void balance.refetch()
      void allowance.refetch()
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Funding failed.', tone: 'error' })
    }
  }

  if (!mounted) {
    return (
      <div className="case-add-funding-control case-add-funding-skeleton">
        <input aria-label="Additional USDC funding loading" disabled placeholder="0.10 USDC" />
        <button className="secondary-button compact-back" disabled type="button">
          Join funding
        </button>
      </div>
    )
  }

  if (!isConnected) {
    return <WalletButton className="secondary-button compact-back" label="Connect to join" />
  }

  return (
    <div className="case-add-funding-control">
      <input
        aria-label="Additional USDC funding"
        inputMode="decimal"
        onChange={(event) => setAmount(event.target.value)}
        placeholder="0.10 USDC"
        value={amount}
      />
      <button className="secondary-button compact-back" disabled={isPending || isSwitching} type="button" onClick={addFunding}>
        <CurrencyDollar size={16} />
        {wrongChain ? 'Switch to Arc' : needsApproval ? 'Approve + join' : 'Join funding'}
      </button>
      <ActionStatus status={status} compact />
    </div>
  )
}

function safeAmount(value: string) {
  try {
    const parsed = parseUnits(value || '0', usdcDecimals)
    return parsed > zero ? parsed : zero
  } catch {
    return zero
  }
}
