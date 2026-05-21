'use client'

import { ArrowRight, BookOpenText, CurrencyDollar, GitFork, MagnifyingGlass, Scales, ShieldCheck, UserCircleCheck, Wallet } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { formatUnits, keccak256, parseEventLogs, parseUnits, stringToBytes } from 'viem'
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { arcTestnet } from '../../lib/arc'
import { caseEscrowAbi, contractAddresses, erc20Abi, hasCaseEscrowAddress } from '../../lib/contracts'
import { WalletButton } from './WalletButton'

type WitnessOption = {
  id: string
  category: string
  agent: string
  detail: string
  priceUsd: number
}

type FilingStatus = {
  tone: 'muted' | 'good' | 'bad'
  text: string
}

const usdcDecimals = 6
const zero = BigInt(0)
const supportedMarkets = ['polymarket.com', 'kalshi.com', 'manifold.markets']

export function CaseFilingFlow({
  witnessOptions,
  likelyBench,
  estimatedWitnessSpend,
}: {
  witnessOptions: WitnessOption[]
  likelyBench: WitnessOption[]
  estimatedWitnessSpend: number
}) {
  const router = useRouter()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const { address, chainId, isConnected } = useAccount()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync, isPending } = useWriteContract()

  const [question, setQuestion] = useState('')
  const [context, setContext] = useState('')
  const [sourceLinks, setSourceLinks] = useState('')
  const [horizon, setHorizon] = useState('')
  const [budget, setBudget] = useState('')
  const [hearingType, setHearingType] = useState('Verdict hearing')
  const [visibility, setVisibility] = useState('Public verdict, private payer')
  const [metadataURI, setMetadataURI] = useState('')
  const [status, setStatus] = useState<FilingStatus | undefined>()
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>()

  const budgetUnits = useMemo(() => safeBudget(budget), [budget])
  const escrowAddress = contractAddresses.caseEscrow
  const canRead = Boolean(address && escrowAddress)

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
    query: { enabled: canRead },
  })
  const nextCaseId = useReadContract({
    abi: caseEscrowAbi,
    address: escrowAddress,
    functionName: 'nextCaseId',
    query: { enabled: Boolean(escrowAddress) },
  })

  const allowanceValue = typeof allowance.data === 'bigint' ? allowance.data : zero
  const balanceValue = typeof balance.data === 'bigint' ? balance.data : zero
  const needsApproval = Boolean(budgetUnits && allowanceValue < budgetUnits)
  const wrongChain = isConnected && chainId !== arcTestnet.id
  const questionHash = question.trim() ? keccak256(stringToBytes(question.trim())) : undefined
  const links = sourceLinks
    .split(/\s+/)
    .map((link) => link.trim())
    .filter(Boolean)
  const predictionMarketLink = links.find(isSupportedPredictionMarketLink)
  const composedContext = [
    context.trim(),
    predictionMarketLink ? `Prediction market: ${predictionMarketLink}` : '',
    horizon.trim() ? `Time horizon: ${horizon.trim()}` : '',
    hearingType.trim() ? `Hearing type: ${hearingType.trim()}` : '',
    visibility.trim() ? `Visibility: ${visibility.trim()}` : '',
  ].filter(Boolean).join('\n\n')

  const fileCase = async () => {
    setStatus(undefined)
    setLastTx(undefined)

    if (!hasCaseEscrowAddress || !escrowAddress) {
      setStatus({ tone: 'bad', text: 'CaseEscrow is not configured. Set the proxy address first.' })
      return
    }
    if (!isConnected || !address) {
      setStatus({ tone: 'bad', text: 'Connect a wallet first.' })
      return
    }
    if (!publicClient) {
      setStatus({ tone: 'bad', text: 'Arc RPC client is not ready.' })
      return
    }
    if (wrongChain) {
      setStatus({ tone: 'muted', text: 'Switching wallet to Arc testnet...' })
      await switchChainAsync({ chainId: arcTestnet.id })
      return
    }
    if (!question.trim()) {
      setStatus({ tone: 'bad', text: 'Paste the market question first.' })
      return
    }
    if (!links.length) {
      setStatus({ tone: 'bad', text: 'Add the actual prediction market URL before filing.' })
      return
    }
    if (!predictionMarketLink) {
      setStatus({ tone: 'bad', text: `Add a supported market link: ${supportedMarkets.join(', ')}.` })
      return
    }
    if (budgetUnits <= zero) {
      setStatus({ tone: 'bad', text: 'Enter a USDC budget before filing.' })
      return
    }
    if (balanceValue < budgetUnits) {
      setStatus({ tone: 'bad', text: `Wallet balance is ${formatUnits(balanceValue, usdcDecimals)} USDC, below the requested budget.` })
      return
    }
    if (!questionHash) return

    const uri = metadataURI.trim() || `helia-case://${questionHash}`

    try {
      if (needsApproval) {
        setStatus({ tone: 'muted', text: 'Approving USDC for CaseEscrow...' })
        const approveHash = await writeContractAsync({
          abi: erc20Abi,
          address: contractAddresses.usdc,
          functionName: 'approve',
          args: [escrowAddress, budgetUnits],
        })
        setLastTx(approveHash)
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }

      setStatus({ tone: 'muted', text: 'Opening escrow on Arc...' })
      const txHash = await writeContractAsync({
        abi: caseEscrowAbi,
        address: escrowAddress,
        functionName: 'openCase',
        args: [budgetUnits, questionHash, uri],
      })
      setLastTx(txHash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      const [caseOpened] = parseEventLogs({
        abi: caseEscrowAbi,
        logs: receipt.logs,
        eventName: 'CaseOpened',
      })
      const onchainCaseId = caseOpened?.args.caseId?.toString()
      if (!onchainCaseId) {
        throw new Error('Escrow opened, but CaseOpened event was not found in the receipt.')
      }

      setStatus({ tone: 'muted', text: 'Escrow opened. Starting Heliaia hearing...' })
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: txHash,
          question: question.trim(),
          context: composedContext || undefined,
          links,
          type: 'prediction-market',
          filer: address,
          onchain: {
            chainId: String(arcTestnet.id),
            escrowAddress,
            caseId: onchainCaseId,
            txHash,
            budgetUsdc: formatUnits(budgetUnits, usdcDecimals),
            questionHash,
            metadataURI: uri,
          },
        }),
      })
      const payload = await response.json().catch(() => ({ error: 'case backend returned a non-json response' }))
      if (!response.ok) {
        throw new Error(payload.error ?? 'case filing failed after escrow opened')
      }

      setStatus({ tone: 'good', text: `Case ${txHash.slice(0, 10)}...${txHash.slice(-6)} funded and queued.` })
      void allowance.refetch()
      void balance.refetch()
      void nextCaseId.refetch()
      router.push(`/cases/${txHash}`)
    } catch (error) {
      setStatus({ tone: 'bad', text: error instanceof Error ? error.message : 'Case filing failed.' })
    }
  }

  return (
    <>
      <section className="form-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Case brief</p>
              <h2>Market question</h2>
            </div>
          </div>
          <div className="case-box case-form">
            <label htmlFor="question">Question</label>
            <textarea id="question" placeholder="Paste the market question exactly as it appears." value={question} onChange={(event) => setQuestion(event.target.value)} />
            <label htmlFor="case-context">Case context</label>
            <textarea
              id="case-context"
              placeholder="Resolution rules, primary sources, exclusions, and exact contract text the court must preserve."
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
            <label htmlFor="source-links">Market and source links</label>
            <textarea
              id="source-links"
              placeholder={`Polymarket, Kalshi, or Manifold market URL required\nPrimary resolution source URL`}
              value={sourceLinks}
              onChange={(event) => setSourceLinks(event.target.value)}
            />
            <label htmlFor="horizon">Time horizon</label>
            <input id="horizon" placeholder="e.g. June 30, 2026, 11:59 PM ET" value={horizon} onChange={(event) => setHorizon(event.target.value)} />
            <label htmlFor="budget">Maximum court budget</label>
            <input id="budget" inputMode="decimal" placeholder="5.00" value={budget} onChange={(event) => setBudget(event.target.value)} />
            <label htmlFor="hearing-type">Hearing type</label>
            <input id="hearing-type" value={hearingType} onChange={(event) => setHearingType(event.target.value)} />
            <label htmlFor="visibility">Visibility</label>
            <input id="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)} />
          </div>
        </section>

        <aside className="panel similar-case-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Similarity check</p>
              <h2>Existing hearings found</h2>
            </div>
            <MagnifyingGlass size={19} />
          </div>
          <p className="panel-copy">
            Before funding, the court checks whether this question already has an active or recent record.
          </p>
          <div className="similar-case-list">
            <div className="empty-state">
              <strong>Similarity check will run on submit</strong>
              <p>The MVP waits for a real case brief before checking nearby hearings.</p>
            </div>
          </div>
        </aside>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Witness bench</p>
              <h2>Court-selected agents</h2>
            </div>
            <UserCircleCheck size={19} />
          </div>
          <p className="panel-copy">
            Heliaia seats witnesses from the case brief, market type, horizon, and budget. Users do not manually pick agents for the MVP.
          </p>
          <div className="compact-list">
            {witnessOptions.length ? witnessOptions.map(({ id, category, agent, detail }) => (
              <article className="witness-option" key={id}>
                <span>{category}</span>
                <strong>{agent}</strong>
                <p>{detail}</p>
              </article>
            )) : (
              <div className="empty-state">
                <strong>Backend registry unavailable</strong>
                <p>Set BACKEND_URL to preview the live witness bench.</p>
              </div>
            )}
          </div>
        </aside>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Settlement</p>
              <h2>Budget and escrow</h2>
            </div>
            <CurrencyDollar size={19} />
          </div>
          <div className="settlement-table">
            <div>
              <span>Visible witness quote</span>
              <strong>{estimatedWitnessSpend ? `${estimatedWitnessSpend.toFixed(2)} USDC` : 'Pending'}</strong>
            </div>
            <div>
              <span>Escrow route</span>
              <strong>{hasCaseEscrowAddress ? 'Arc CaseEscrow' : 'Not configured'}</strong>
            </div>
            <div>
              <span>Wallet balance</span>
              <strong>{address ? `${formatUnits(balanceValue, usdcDecimals)} USDC` : 'Connect wallet'}</strong>
            </div>
            <div>
              <span>Next onchain case</span>
              <strong>{typeof nextCaseId.data === 'bigint' ? `#${nextCaseId.data.toString()}` : 'Pending'}</strong>
            </div>
          </div>
          <div className="onchain-widget">
            <div>
              <ShieldCheck size={18} />
              <strong>Arc escrow</strong>
            </div>
            <div className="onchain-grid">
              <label>
                <span>Metadata URI</span>
                <input placeholder="ipfs://... or https://..." value={metadataURI} onChange={(event) => setMetadataURI(event.target.value)} />
              </label>
            </div>
            <div className="onchain-facts">
              <span>Allowance: {address ? `${formatUnits(allowanceValue, usdcDecimals)} USDC` : 'Connect wallet'}</span>
              <span>Budget: {budgetUnits > zero ? `${formatUnits(budgetUnits, usdcDecimals)} USDC` : 'Pending'}</span>
            </div>
            {isConnected ? (
              <button className="primary-button full-width" disabled={isPending || isSwitching} type="button" onClick={fileCase}>
                <Wallet size={16} />
                {wrongChain ? 'Switch to Arc' : needsApproval ? 'Approve, fund, and file' : 'Fund and file case'}
              </button>
            ) : (
              <WalletButton className="primary-button full-width" label="Connect wallet" />
            )}
            {status ? <p className={`onchain-status ${status.tone}`}>{status.text}</p> : null}
            {lastTx ? (
              <a className="onchain-tx" href={`${arcTestnet.blockExplorers.default.url}/tx/${lastTx}`} target="_blank" rel="noreferrer">
                {lastTx.slice(0, 10)}...{lastTx.slice(-6)}
              </a>
            ) : null}
          </div>
          <div className="direction-strip inline-strip">
            <ShieldCheck size={19} />
            <p>Funding opens escrow first. Once confirmed, Heliaia queues the hearing and writes the transcript to the backend.</p>
          </div>
        </aside>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Case routing</p>
            <h2>Choose how this question should proceed</h2>
          </div>
          <GitFork size={19} />
        </div>
        <div className="route-choice-grid">
          <article>
            <span>01</span>
            <h3>Join existing case</h3>
            <p>Add funding, follow updates, and receive access to the shared verdict without duplicating work.</p>
            <button type="button">Join active hearing</button>
          </article>
          <article>
            <span>02</span>
            <h3>Request fresh hearing</h3>
            <p>Run an updated hearing when market conditions changed after the original court record.</p>
            <button type="button">Refresh verdict</button>
          </article>
          <article>
            <span>03</span>
            <h3>Open private fork</h3>
            <p>Keep the same market question private with custom context, budget, resolution notes, or constraints.</p>
            <button type="button">Fork privately</button>
          </article>
        </div>
      </section>

      <section className="panel case-preview-panel" id="case-preview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Draft preview</p>
            <h2>Review before filing</h2>
          </div>
          <BookOpenText size={19} />
        </div>

        <div className="case-preview-grid">
          <article className="case-box preview-summary">
            {question.trim() ? (
              <>
                <p className="eyebrow">Question</p>
                <h3>{question.trim()}</h3>
                {composedContext ? <p>{composedContext}</p> : null}
              </>
            ) : (
              <div className="empty-state">
                <strong>Draft preview will render from your case brief</strong>
                <p>No sample market is prefilled. The court should only preview the question, context, links, horizon, and budget the filer actually provides.</p>
              </div>
            )}
          </article>

          <article className="case-box">
            <p className="eyebrow">Auto-seated bench</p>
            <div className="preview-witness-list">
              {likelyBench.length ? likelyBench.map(({ id, category, agent }) => (
                <div key={id}>
                  <span>{category}</span>
                  <strong>{agent}</strong>
                </div>
              )) : (
                <div>
                  <span>Registry</span>
                  <strong>Pending backend</strong>
                </div>
              )}
            </div>
          </article>

          <article className="case-box">
            <p className="eyebrow">Settlement route</p>
            <div className="preview-route">
              <Scales size={19} />
              <p>Wallet funds CaseEscrow, backend stores the case, Heliaia runs the hearing, then settlement and receipt actions can be recorded onchain.</p>
            </div>
          </article>

          <article className="case-box">
            <p className="eyebrow">Budget check</p>
            <div className="settlement-table preview-budget">
              <div>
                <span>Quoted visible bench</span>
                <strong>{estimatedWitnessSpend ? `${estimatedWitnessSpend.toFixed(2)} USDC` : 'Pending'}</strong>
              </div>
              <div>
                <span>Requested budget</span>
                <strong>{budgetUnits > zero ? `${formatUnits(budgetUnits, usdcDecimals)} USDC` : 'Pending'}</strong>
              </div>
            </div>
          </article>
        </div>

        <div className="preview-actions">
          <Link className="secondary-button" href="#question">Back to edit</Link>
          {isConnected ? (
            <button className="primary-button wallet-primary" disabled={isPending || isSwitching} type="button" onClick={fileCase}>
              {wrongChain ? 'Switch to Arc' : 'File funded case'}
              <ArrowRight size={16} />
            </button>
          ) : (
            <WalletButton className="primary-button wallet-primary" label="Connect wallet" />
          )}
        </div>
      </section>
    </>
  )
}

function safeBudget(value: string) {
  try {
    const parsed = parseUnits(value || '0', usdcDecimals)
    return parsed > zero ? parsed : zero
  } catch {
    return zero
  }
}

function isSupportedPredictionMarketLink(link: string) {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '').toLowerCase()
    return supportedMarkets.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}
