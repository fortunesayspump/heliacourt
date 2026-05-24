'use client'

import { CheckCircle, Scales, Stamp } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, keccak256, parseEventLogs, parseUnits, stringToBytes } from 'viem'
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { arcTestnet } from '../../lib/arc'
import type { ApiCase } from '../../lib/backend-data'
import { caseEscrowAbi, contractAddresses, erc20Abi, hasCaseEscrowAddress } from '../../lib/contracts'
import { WalletButton } from './WalletButton'

type ExistingCase = {
  id: string
  title: string
  status: string
  probability?: string
  imageUrl?: string
  links: string[]
  updated?: string
}

type FilingStatus = {
  tone: 'muted' | 'good' | 'bad'
  text: string
}

type LinkPreview = {
  title?: string
  image?: string
  description?: string
  rules?: string
  endDate?: string
  market?: string
  multipleContracts?: boolean
  contracts?: Array<{
    title: string
    ticker?: string
    price?: string
    horizon?: string
    rules?: string
  }>
}

type AutofilledFields = {
  question?: string
  context?: string
  horizon?: string
}

const usdcDecimals = 6
const zero = BigInt(0)
const supportedMarkets = ['polymarket.com', 'kalshi.com', 'manifold.markets']

export function CaseFilingFlow({
  parentCase,
  filingKind = 'original',
  initialMarketUrl,
  existingCases,
}: {
  parentCase?: ApiCase
  filingKind?: 'original' | 'fresh-hearing' | 'private-fork'
  initialMarketUrl?: string
  existingCases: ExistingCase[]
}) {
  const router = useRouter()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const { address, chainId, isConnected } = useAccount()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync, isPending } = useWriteContract()
  const filingMainRef = useRef<HTMLElement | null>(null)

  const [question, setQuestion] = useState(parentCase?.title ?? '')
  const [context, setContext] = useState(parentCase?.resolution ?? '')
  const [sourceLinks, setSourceLinks] = useState(parentCase ? (parentCase.links ?? []).join('\n') : initialMarketUrl?.trim() ?? '')
  const [horizon, setHorizon] = useState(parentCase?.horizon ?? '')
  const [budget, setBudget] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>(filingKind === 'private-fork' ? 'private' : 'public')
  const [payerVisibility, setPayerVisibility] = useState<'public' | 'private'>('private')
  const [status, setStatus] = useState<FilingStatus | undefined>()
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>()
  const [marketPreview, setMarketPreview] = useState<LinkPreview | undefined>()
  const [autofilledFields, setAutofilledFields] = useState<AutofilledFields>({})
  const [autofillStatus, setAutofillStatus] = useState<FilingStatus | undefined>()
  const [filingMainHeight, setFilingMainHeight] = useState<number | undefined>()

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
  const relatedCases = useMemo(
    () => findRelatedCases(question, predictionMarketLink, existingCases),
    [existingCases, predictionMarketLink, question],
  )
  const composedContext = [
    parentCase ? `Linked parent case: ${parentCase.id}` : '',
    parentCase && filingKind !== 'original' ? `Filing kind: ${formatFilingKind(filingKind)}` : '',
    context.trim(),
    predictionMarketLink ? `Prediction market: ${predictionMarketLink}` : '',
    horizon.trim() ? `Time horizon: ${horizon.trim()}` : '',
  ].filter(Boolean).join('\n\n')

  useEffect(() => {
    const element = filingMainRef.current
    if (!element) return

    const updateHeight = () => setFilingMainHeight(Math.ceil(element.getBoundingClientRect().height))
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    window.addEventListener('resize', updateHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  useEffect(() => {
    if (!predictionMarketLink) {
      setMarketPreview(undefined)
      setAutofillStatus(undefined)
      return
    }

    let cancelled = false
    setAutofillStatus({ tone: 'muted', text: 'Reading market details...' })
    const params = new URLSearchParams({ url: predictionMarketLink })
    params.set('image', 'og')
    if (question.trim()) params.set('title', question.trim())
    fetch(`/api/market-image?${params.toString()}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: LinkPreview) => {
        if (cancelled) return
        setMarketPreview(payload)

        const nextQuestion = payload.title?.trim()
        const nextContext = buildAutofillContext(payload, predictionMarketLink)
        const nextHorizon = formatMarketHorizon(payload.endDate)

        setQuestion((current) => canAutofill(current, autofilledFields.question) && nextQuestion ? nextQuestion : current)
        setContext((current) => canAutofill(current, autofilledFields.context) && nextContext ? nextContext : current)
        setHorizon((current) => canAutofill(current, autofilledFields.horizon) && nextHorizon ? nextHorizon : current)
        setAutofilledFields({
          question: nextQuestion,
          context: nextContext,
          horizon: nextHorizon,
        })
        setAutofillStatus(
          nextQuestion || nextContext || nextHorizon
            ? { tone: 'good', text: payload.multipleContracts ? 'Market event bundle filled from the pasted link.' : 'Market details filled from the pasted link.' }
            : { tone: 'muted', text: 'Market linked. Add any missing details before filing.' },
        )
      })
      .catch(() => {
        if (!cancelled) {
          setMarketPreview(undefined)
          setAutofillStatus({ tone: 'bad', text: 'Could not read that market automatically. You can still fill it manually.' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [predictionMarketLink])

  const fileCase = async () => {
    setStatus(undefined)
    setLastTx(undefined)

    if (!hasCaseEscrowAddress || !escrowAddress) {
      setStatus({ tone: 'bad', text: 'Case filing is not ready yet.' })
      return
    }
    if (!isConnected || !address) {
      setStatus({ tone: 'bad', text: 'Connect a wallet first.' })
      return
    }
    if (!publicClient) {
      setStatus({ tone: 'bad', text: 'Arc connection is not ready yet.' })
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

    const uri = `helia-case://${questionHash}`

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
          imageUrl: marketPreview?.image,
          type: 'prediction-market',
          parentCaseId: parentCase?.id,
          filingKind,
          filer: address,
          visibility,
          payerVisibility,
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
      const payload = await response.json().catch(() => ({ error: 'No case data returned.' }))
      if (!response.ok) {
        throw new Error(payload.error ?? 'case filing failed after escrow opened')
      }

      setStatus({ tone: 'good', text: `Case ${txHash.slice(0, 10)}...${txHash.slice(-6)} funded and queued.` })
      void allowance.refetch()
      void balance.refetch()
      router.push(`/cases/${txHash}`)
    } catch (error) {
      setStatus({ tone: 'bad', text: error instanceof Error ? error.message : 'Case filing failed.' })
    }
  }

  const checklistItems = [
    { label: 'Market question', ready: Boolean(question.trim()) },
    { label: 'Supported market link', ready: Boolean(predictionMarketLink) },
    { label: 'Time horizon', ready: Boolean(horizon.trim()) },
    { label: 'USDC budget', ready: budgetUnits > zero },
  ]

  return (
    <>
      <section className="case-filing-shell">
        <section className="panel case-filing-main" ref={filingMainRef}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Petition desk</p>
              <h2>File a prediction case</h2>
            </div>
          </div>
          {parentCase ? (
            <div className="direction-strip inline-strip lineage-strip">
              <p>{formatFilingKind(filingKind)} linked to {shortCaseId(parentCase.id)}. This opens a new funded escrow and keeps the parent relationship in the case record.</p>
            </div>
          ) : null}
          <div className="case-box case-form">
            <label htmlFor="source-links">Market link</label>
            <input
              id="source-links"
              placeholder="Paste a Polymarket, Kalshi, or Manifold market URL"
              value={sourceLinks}
              onChange={(event) => setSourceLinks(event.target.value)}
            />
            {autofillStatus ? <p className={`autofill-status ${autofillStatus.tone}`}>{autofillStatus.text}</p> : null}
            <label htmlFor="question">Question</label>
            <input id="question" placeholder="Paste the market question exactly as it appears." value={question} onChange={(event) => setQuestion(event.target.value)} />
            <label htmlFor="case-context">Case context</label>
            <textarea
              id="case-context"
              placeholder="Resolution rules, primary sources, exclusions, and exact contract text the court must preserve."
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
            <label htmlFor="horizon">Time horizon</label>
            <input id="horizon" placeholder="e.g. June 30, 2026, 11:59 PM ET" value={horizon} onChange={(event) => setHorizon(event.target.value)} />
            <label htmlFor="budget">Maximum court budget</label>
            <input id="budget" inputMode="decimal" placeholder="5.00" value={budget} onChange={(event) => setBudget(event.target.value)} />
            <label htmlFor="visibility">Case visibility</label>
            <select id="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'unlisted' | 'private')}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
            <label htmlFor="payer-visibility">Payer visibility</label>
            <select id="payer-visibility" value={payerVisibility} onChange={(event) => setPayerVisibility(event.target.value as 'public' | 'private')}>
              <option value="private">Private payer</option>
              <option value="public">Public payer</option>
            </select>
          </div>
        </section>

        <aside className="case-filing-side" style={filingMainHeight ? { '--filing-main-height': `${filingMainHeight}px` } as CSSProperties : undefined}>
          <section className="panel filing-checklist-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Readiness</p>
                <h2>Filing checklist</h2>
              </div>
            </div>
            <div className="filing-checklist">
              {checklistItems.map((item) => (
                <div className={item.ready ? 'ready' : undefined} key={item.label}>
                  <CheckCircle size={16} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="direction-strip inline-strip">
              <p>Wallet connection is only needed when you file and fund the case.</p>
            </div>
          </section>

          <section className="panel similar-case-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Similarity check</p>
                <h2>Existing hearings</h2>
              </div>
            </div>
            <div className="similar-case-list">
              {relatedCases.length ? relatedCases.map((item) => (
                <Link className="similar-case-row" href={`/cases/${item.id}`} key={item.id}>
                  <span className={`similar-case-thumb${item.imageUrl ? ' has-image' : ''}`} aria-hidden="true">
                    {item.imageUrl ? <img alt="" src={item.imageUrl} /> : item.title.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.status}{item.probability ? ` · ${item.probability}` : ''}</span>
                  </div>
                  <Stamp size={15} />
                </Link>
              )) : (
                <div className="empty-state">
                  <strong>{question.trim() || predictionMarketLink ? 'No nearby case found' : 'Paste a question to compare'}</strong>
                  <p>{existingCases.length ? `${existingCases.length} case records are available for comparison.` : 'No existing cases are available yet.'}</p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>

      <section className="panel case-preview-panel" id="case-preview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Case preview</p>
            <h2>Review before filing</h2>
          </div>
        </div>

        <div className="case-preview-grid">
          <article className="case-box preview-summary">
            {question.trim() ? (
              <>
                <div className={`preview-market-image${marketPreview?.image ? ' has-image' : ''}`} aria-hidden="true">
                  {marketPreview?.image ? <img alt="" src={marketPreview.image} /> : <Scales size={28} />}
                </div>
                <p className="eyebrow">Market question</p>
                <h3>{question.trim()}</h3>
                <div className="preview-meta-row">
                  <span>{predictionMarketLink ? 'Market linked' : 'Market link missing'}</span>
                  {marketPreview?.multipleContracts ? <span>{marketPreview.contracts?.length ?? 0} contracts</span> : null}
                  <span>{marketPreview?.multipleContracts ? 'Multiple horizons' : horizon.trim() || 'Horizon pending'}</span>
                  <span>{visibility}</span>
                  <span>{payerVisibility === 'private' ? 'Private payer' : 'Public payer'}</span>
                </div>
                {marketPreview?.contracts?.length ? (
                  <div className="preview-contract-list">
                    {marketPreview.contracts.map((contract) => (
                      <div key={contract.ticker ?? `${contract.title}-${contract.horizon ?? ''}`}>
                        <strong>{contract.title}</strong>
                        <span>{[contract.horizon, contract.price ? `Last ${contract.price}` : undefined].filter(Boolean).join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {context.trim() ? <p>{context.trim()}</p> : null}
              </>
            ) : (
              <div className="empty-state">
                <strong>Your case preview will appear here</strong>
                <p>Start with the exact market question and source link.</p>
              </div>
            )}
          </article>

          <aside className="case-box preview-submit-card">
            <div>
              <p className="eyebrow">Budget</p>
              <strong>{budgetUnits > zero ? `${formatUnits(budgetUnits, usdcDecimals)} USDC` : 'Pending'}</strong>
            </div>
            <div className="preview-route">
              <span>Escrow opens on Arc when you file.</span>
            </div>
            <div className="preview-actions">
              <Link className="secondary-button" href="#question">Back to edit</Link>
              {isConnected ? (
                <button className="primary-button wallet-primary" disabled={isPending || isSwitching} type="button" onClick={fileCase}>
                  {wrongChain ? 'Switch to Arc' : 'File funded case'}
                  <Stamp size={16} />
                </button>
              ) : (
                <WalletButton className="primary-button wallet-primary" label="Connect wallet" />
              )}
            </div>
          </aside>
        </div>
        {status ? <p className={`onchain-status ${status.tone}`}>{status.text}</p> : null}
        {lastTx ? (
          <a className="onchain-tx" href={`${arcTestnet.blockExplorers.default.url}/tx/${lastTx}`} target="_blank" rel="noreferrer">
            {lastTx.slice(0, 10)}...{lastTx.slice(-6)}
          </a>
        ) : null}
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

function canAutofill(current: string, previousAutofill?: string) {
  return !current.trim() || Boolean(previousAutofill && current === previousAutofill)
}

function buildAutofillContext(preview: LinkPreview, marketLink: string) {
  const contractLines = preview.contracts?.length
    ? [
        'Contracts:',
        ...preview.contracts.map((contract, index) => [
          `${index + 1}. ${contract.title}`,
          contract.ticker ? `Ticker: ${contract.ticker}` : '',
          contract.horizon ? `Horizon: ${contract.horizon}` : '',
          contract.price ? `Last price: ${contract.price}` : '',
          contract.rules ? `Rules: ${contract.rules}` : '',
        ].filter(Boolean).join('\n')),
      ].join('\n\n')
    : ''
  const lines = [
    preview.market ? `Market: ${preview.market}` : '',
    preview.description ? `Description: ${preview.description}` : '',
    contractLines,
    preview.rules ? `Resolution rules: ${preview.rules}` : '',
    `Primary market: ${marketLink}`,
  ]
  return lines.filter(Boolean).join('\n\n')
}

function formatMarketHorizon(value?: string) {
  if (!value?.trim()) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.trim()
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function isSupportedPredictionMarketLink(link: string) {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '').toLowerCase()
    return supportedMarkets.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

function findRelatedCases(question: string, marketLink: string | undefined, existingCases: ExistingCase[]) {
  const normalizedQuestion = normalizeSearchText(question)
  const queryTerms = new Set(normalizedQuestion.split(' ').filter((word) => word.length >= 4))
  const normalizedMarketLink = marketLink ? normalizeUrl(marketLink) : undefined

  return existingCases
    .map((item) => {
      const linkScore = normalizedMarketLink && item.links.some((link) => normalizeUrl(link) === normalizedMarketLink) ? 100 : 0
      const titleTerms = new Set(normalizeSearchText(item.title).split(' ').filter((word) => word.length >= 4))
      const overlap = [...queryTerms].filter((term) => titleTerms.has(term)).length
      const score = linkScore + overlap
      return { ...item, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return value.trim().replace(/\/$/, '').toLowerCase()
  }
}

function formatFilingKind(kind: 'original' | 'fresh-hearing' | 'private-fork') {
  if (kind === 'fresh-hearing') return 'Fresh hearing'
  if (kind === 'private-fork') return 'Private fork'
  return 'Original case'
}

function shortCaseId(id: string) {
  if (id.startsWith('0x') && id.length > 18) return `${id.slice(0, 8)}...${id.slice(-6)}`
  if (id.length > 18) return `${id.slice(0, 12)}...`
  return id
}
