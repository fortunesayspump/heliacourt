'use client'

import { CurrencyDollar } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { formatUnits, parseEventLogs, parseUnits } from 'viem'
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { arcTestnet } from '../../lib/arc'
import { caseEscrowAbi, contractAddresses, erc20Abi } from '../../lib/contracts'
import { WalletButton } from './WalletButton'

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
  const [status, setStatus] = useState('')

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
      setStatus('This case does not have an Arc escrow record.')
      return
    }
    if (!isConnected || !address) {
      setStatus('Connect a wallet first.')
      return
    }
    if (!publicClient) {
      setStatus('Arc RPC client is not ready.')
      return
    }
    if (wrongChain) {
      setStatus('Switching wallet to Arc testnet...')
      await switchChainAsync({ chainId: arcTestnet.id })
      return
    }
    if (amountUnits <= zero) {
      setStatus('Enter a USDC amount to add.')
      return
    }
    if (balanceValue < amountUnits) {
      setStatus(`Wallet balance is ${formatUnits(balanceValue, usdcDecimals)} USDC.`)
      return
    }

    try {
      if (needsApproval) {
        setStatus('Approving USDC for CaseEscrow...')
        const approveHash = await writeContractAsync({
          abi: erc20Abi,
          address: contractAddresses.usdc,
          functionName: 'approve',
          args: [escrowAddress, amountUnits],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }

      setStatus('Adding funding to the escrow...')
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
      setStatus(`Added ${payload.amountUsdc} USDC to this case.`)
      void balance.refetch()
      void allowance.refetch()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Funding failed.')
    }
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
      {status ? <span>{status}</span> : null}
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
