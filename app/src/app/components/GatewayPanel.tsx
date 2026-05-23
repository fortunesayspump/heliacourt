'use client'

import { ArrowClockwise, Bank, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { formatUnits, parseUnits, zeroAddress } from 'viem'
import { useState } from 'react'
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { contractAddresses, erc20Abi, gatewayWalletAbi } from '../../lib/contracts'

const usdcDecimals = 6
const zero = BigInt(0)

export function GatewayPanel() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [depositAmount, setDepositAmount] = useState('0.01')
  const [withdrawAmount, setWithdrawAmount] = useState('0.01')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const allowance = useReadContract({
    abi: erc20Abi,
    address: contractAddresses.usdc,
    functionName: 'allowance',
    args: address ? [address, contractAddresses.gatewayWallet] : undefined,
    query: { enabled: Boolean(address && isConnected) },
  })

  const balances = useReadContracts({
    contracts: address ? [
      { abi: erc20Abi, address: contractAddresses.usdc, functionName: 'balanceOf', args: [address] },
      { abi: gatewayWalletAbi, address: contractAddresses.gatewayWallet, functionName: 'availableBalance', args: [contractAddresses.usdc, address] },
      { abi: gatewayWalletAbi, address: contractAddresses.gatewayWallet, functionName: 'withdrawingBalance', args: [contractAddresses.usdc, address] },
      { abi: gatewayWalletAbi, address: contractAddresses.gatewayWallet, functionName: 'withdrawableBalance', args: [contractAddresses.usdc, address] },
    ] : [],
    query: { enabled: Boolean(address && isConnected) },
  })

  const walletBalance = getBigint(balances.data?.[0]?.result)
  const gatewayAvailable = getBigint(balances.data?.[1]?.result)
  const gatewayWithdrawing = getBigint(balances.data?.[2]?.result)
  const gatewayWithdrawable = getBigint(balances.data?.[3]?.result)

  async function refresh() {
    await Promise.all([allowance.refetch(), balances.refetch()])
  }

  async function deposit() {
    if (!isConnected || !address || !publicClient) {
      setStatus('Connect wallet first.')
      return
    }

    const amount = parseSafeAmount(depositAmount)
    if (amount <= zero) {
      setStatus('Enter a USDC amount to deposit.')
      return
    }
    if (walletBalance < amount) {
      setStatus(`Wallet balance is ${formatUnits(walletBalance, usdcDecimals)} USDC.`)
      return
    }

    setBusy(true)
    try {
      if (getBigint(allowance.data) < amount) {
        setStatus('Approving Gateway wallet...')
        const approvalHash = await writeContractAsync({
          abi: erc20Abi,
          address: contractAddresses.usdc,
          functionName: 'approve',
          args: [contractAddresses.gatewayWallet, amount],
        })
        await publicClient.waitForTransactionReceipt({ hash: approvalHash })
      }

      setStatus('Depositing to Gateway...')
      const depositHash = await writeContractAsync({
        abi: gatewayWalletAbi,
        address: contractAddresses.gatewayWallet,
        functionName: 'deposit',
        args: [contractAddresses.usdc, amount],
      })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })
      setStatus(`Deposited ${formatUnits(amount, usdcDecimals)} USDC to Gateway.`)
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Gateway deposit failed.')
    } finally {
      setBusy(false)
    }
  }

  async function requestWithdraw() {
    if (!isConnected || !address || !publicClient) {
      setStatus('Connect wallet first.')
      return
    }
    const amount = parseSafeAmount(withdrawAmount)
    if (amount <= zero) {
      setStatus('Enter a USDC amount to withdraw.')
      return
    }
    if (gatewayAvailable < amount) {
      setStatus(`Gateway available balance is ${formatUnits(gatewayAvailable, usdcDecimals)} USDC.`)
      return
    }

    setBusy(true)
    try {
      setStatus('Requesting Gateway withdrawal...')
      const hash = await writeContractAsync({
        abi: gatewayWalletAbi,
        address: contractAddresses.gatewayWallet,
        functionName: 'initiateWithdrawal',
        args: [contractAddresses.usdc, amount],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus('Withdrawal requested. Complete it when the withdrawable balance is ready.')
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Gateway withdrawal request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function completeWithdraw() {
    if (!isConnected || !address || !publicClient) {
      setStatus('Connect wallet first.')
      return
    }
    if (gatewayWithdrawable <= zero) {
      setStatus('No withdrawable Gateway balance yet.')
      return
    }

    setBusy(true)
    try {
      setStatus('Completing Gateway withdrawal...')
      const hash = await writeContractAsync({
        abi: gatewayWalletAbi,
        address: contractAddresses.gatewayWallet,
        functionName: 'withdraw',
        args: [contractAddresses.usdc],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus('Gateway withdrawal completed.')
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Gateway withdrawal failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel gateway-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Gateway</p>
          <h2>Circle Gateway balance</h2>
        </div>
        <Bank size={19} />
      </div>

      <div className="gateway-balance-grid">
        <GatewayStat label="Wallet USDC" value={`${formatGatewayAmount(walletBalance)} USDC`} />
        <GatewayStat label="Gateway available" value={`${formatGatewayAmount(gatewayAvailable)} USDC`} />
        <GatewayStat label="Withdrawing" value={`${formatGatewayAmount(gatewayWithdrawing)} USDC`} />
        <GatewayStat label="Withdrawable" value={`${formatGatewayAmount(gatewayWithdrawable)} USDC`} />
      </div>

      <div className="gateway-action-grid">
        <label>
          <span>Deposit to Gateway</span>
          <input inputMode="decimal" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="0.01" />
          <button className="primary-button compact-back" type="button" onClick={deposit} disabled={busy || !isConnected}>
            <UploadSimple size={16} /> Deposit
          </button>
        </label>
        <label>
          <span>Withdraw from Gateway</span>
          <input inputMode="decimal" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="0.01" />
          <button className="secondary-button compact-back" type="button" onClick={requestWithdraw} disabled={busy || !isConnected}>
            <DownloadSimple size={16} /> Request
          </button>
        </label>
        <button className="secondary-button compact-back gateway-complete-button" type="button" onClick={completeWithdraw} disabled={busy || !isConnected || gatewayWithdrawable <= zero}>
          <ArrowClockwise size={16} /> Complete withdraw
        </button>
      </div>

      <p className="gateway-explainer">
        Case filing and join funding spend wallet USDC through CaseEscrow. Paid agent/API reads use Gateway balance for gas-free x402 settlement.
      </p>
      {status ? <p className="gateway-status">{status}</p> : null}
      {!isConnected ? <p className="gateway-status">Connect wallet to manage Gateway funds.</p> : null}
    </section>
  )
}

function GatewayStat({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function parseSafeAmount(value: string) {
  try {
    return parseUnits(value || '0', usdcDecimals)
  } catch {
    return zero
  }
}

function getBigint(value: unknown) {
  return typeof value === 'bigint' ? value : zero
}

function formatGatewayAmount(value: bigint) {
  if (value === zero || contractAddresses.gatewayWallet === zeroAddress) return '0'
  const parsed = Number(formatUnits(value, usdcDecimals))
  if (parsed >= 1) return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return parsed.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
