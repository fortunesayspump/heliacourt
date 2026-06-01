'use client'

import { Briefcase, Clock, MagnifyingGlass, ShieldCheck, Stamp, X } from '@phosphor-icons/react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import type { ApiCase, ApiUserAccount } from '../../../lib/backend-data'
import { getPredictionMarketLink, MarketLogo } from '../markets/MarketLogo'

export function CaseSearchList({ cases, initialNow }: { cases: ApiCase[]; initialNow: number }) {
  const { address, isConnected } = useAccount()
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showPrivate, setShowPrivate] = useState(false)
  const [privateCases, setPrivateCases] = useState<ApiCase[]>([])
  const normalizedQuery = normalizeSearchText(query)
  const docketCases = useMemo(
    () => showPrivate ? mergeCases(cases, privateCases) : cases,
    [cases, privateCases, showPrivate],
  )
  const privateCount = privateCases.length
  const archivedCount = docketCases.filter(isArchivedCaseStatus).length
  const visibleCases = useMemo(
    () => showArchived ? docketCases : docketCases.filter((item) => !isArchivedCaseStatus(item)),
    [docketCases, showArchived],
  )
  const filteredCases = useMemo(() => {
    if (!normalizedQuery) return visibleCases

    return visibleCases.filter((item) => {
      const marketLink = getPredictionMarketLink(item.links)
      const haystack = normalizeSearchText([
        item.title,
        item.status,
        item.market,
        item.horizon,
        item.probability,
        item.visibility,
        item.filingKind,
        marketLink,
        ...(item.links ?? []),
      ].filter(Boolean).join(' '))

      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery, visibleCases])

  useEffect(() => {
    if (!isConnected || !address) {
      setPrivateCases([])
      setShowPrivate(false)
      return
    }

    let cancelled = false
    fetch(`/api/users/${address}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<ApiUserAccount> : undefined)
      .then((account) => {
        if (cancelled || !account) return
        const ownedPrivateCases = account.cases
          .filter((item) => item.visibility === 'private')
          .map((item) => ({
            id: item.id,
            title: item.title,
            imageUrl: item.imageUrl,
            visibility: 'private' as const,
            status: 'Private',
            market: 'Wallet record',
            updated: item.updated,
            createdAt: item.updated,
            horizon: 'Private docket',
            probability: 'Wallet access',
            links: [],
          }))
        setPrivateCases(ownedPrivateCases)
      })
      .catch(() => {
        if (!cancelled) setPrivateCases([])
      })

    return () => {
      cancelled = true
    }
  }, [address, isConnected])

  return (
    <>
      <label className="case-search-field" htmlFor="case-search">
        <MagnifyingGlass size={17} />
        <input
          id="case-search"
          placeholder="Search markets, status, horizon, or source"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button aria-label="Clear case search" type="button" onClick={() => setQuery('')}>
            <X size={15} />
          </button>
        ) : null}
      </label>

      <section className="cases-docket-panel">
        <div className="cases-market-heading">
          <div>
            <p className="eyebrow">Prediction docket</p>
            <h2>Markets</h2>
          </div>
          <div className="case-list-heading-actions">
            {privateCount ? (
              <button
                className={`case-archive-toggle private-toggle${showPrivate ? ' active' : ''}`}
                type="button"
                aria-pressed={showPrivate}
                onClick={() => setShowPrivate((current) => !current)}
              >
                <ShieldCheck size={14} />
                {showPrivate ? 'Hide private' : `My private (${privateCount})`}
              </button>
            ) : isConnected ? (
              <Link className="case-private-link" href="/profile?visibility=private">
                <ShieldCheck size={14} />
                Private cases
              </Link>
            ) : null}
            {archivedCount ? (
              <button
                className={`case-archive-toggle${showArchived ? ' active' : ''}`}
                type="button"
                aria-pressed={showArchived}
                onClick={() => setShowArchived((current) => !current)}
              >
                {showArchived ? 'Hide failed/refunded' : `Show failed/refunded (${archivedCount})`}
              </button>
            ) : null}
            <Briefcase size={20} />
          </div>
        </div>

        {!docketCases.length ? (
          <div className="empty-state">
            <h3>No cases yet</h3>
            <Link className="primary-button" href="/cases/new">
              File case
              <Stamp size={16} />
            </Link>
          </div>
        ) : !visibleCases.length && !showArchived ? (
          <div className="empty-state">
            <h3>No active cases</h3>
            <p>{archivedCount ? `${archivedCount} failed/refunded records are hidden.` : 'File a case to populate the docket.'}</p>
            {archivedCount ? (
              <button className="secondary-button" type="button" onClick={() => setShowArchived(true)}>
                Show hidden records
              </button>
            ) : (
              <Link className="primary-button" href="/cases/new">
                File case
                <Stamp size={16} />
              </Link>
            )}
          </div>
        ) : filteredCases.length ? (
          <div className="docket-case-grid">
            {filteredCases.map((item) => (
              <CaseSearchCard caseItem={item} initialNow={initialNow} key={item.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state case-search-empty">
            <strong>No matching markets</strong>
            <p>Try a market name, status, horizon, or source.</p>
          </div>
        )}
      </section>
    </>
  )
}

function mergeCases(publicCases: ApiCase[], privateCases: ApiCase[]) {
  const merged = [...publicCases]
  const seen = new Set(publicCases.map((item) => item.id))
  for (const item of privateCases) {
    if (!seen.has(item.id)) merged.push(item)
  }
  return merged
}

function CaseSearchCard({ caseItem, initialNow }: { caseItem: ApiCase; initialNow: number }) {
  const marketLink = getPredictionMarketLink(caseItem.links)
  const budget = caseItem.onchain?.budgetUsdc ? `${caseItem.onchain.budgetUsdc} USDC` : 'Not funded'
  const [resolvedImage, setResolvedImage] = useState(caseItem.imageUrl)

  useEffect(() => {
    setResolvedImage(caseItem.imageUrl)
    if (caseItem.imageUrl || !marketLink) return undefined

    let cancelled = false
    const params = new URLSearchParams({ url: marketLink, title: caseItem.title })
    fetch(`/api/market-image?${params.toString()}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ image?: string }> : undefined)
      .then((payload) => {
        if (!cancelled && payload?.image) setResolvedImage(payload.image)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [caseItem.imageUrl, caseItem.title, marketLink])

  return (
    <article className="docket-case-card">
      <div className="docket-case-card-banner">
        {resolvedImage ? <img alt="" src={resolvedImage} /> : null}
        <div>
          <span>{caseItem.status}</span>
        </div>
        <strong>
          <Clock size={13} />
          {formatUpdated(caseItem.updated, initialNow)}
        </strong>
      </div>

      <div className="docket-case-card-head">
        <div>
          <span className="market-provider-line">
            <MarketLogo url={marketLink} market={caseItem.market} showLabel />
            {caseItem.parentCaseId ? <span>{formatFilingKind(caseItem.filingKind)}</span> : null}
          </span>
          <Link href={`/cases/${caseItem.id}`} aria-label={`Open ${caseItem.title}`}>
            <h3>{caseItem.title}</h3>
          </Link>
        </div>
      </div>

      <div className="case-market-lines">
        <div>
          <span>Horizon</span>
          <strong>{caseItem.horizon ?? 'Open'}</strong>
        </div>
        <div>
          <span>Witnesses</span>
          <strong>{caseItem.witnesses?.length ?? 0} seats</strong>
        </div>
        <div>
          <span>Budget</span>
          <strong>{budget}</strong>
        </div>
      </div>

      <div className="docket-case-card-actions">
        {marketLink ? (
          <a className="market-source-link" href={marketLink} target="_blank" rel="noreferrer">
            <MarketLogo url={marketLink} />
            Market
          </a>
        ) : (
          <span className="market-source-link disabled">No source</span>
        )}
        <Link className="docket-case-card-link" href={`/cases/${caseItem.id}`} aria-label={`Open ${caseItem.title}`}>
          Open
          <Stamp size={16} />
        </Link>
      </div>
    </article>
  )
}

function formatUpdated(value: string | undefined, now: number) {
  if (!value) return 'Pending'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const diffMs = now - timestamp
  const minutes = Math.max(0, Math.round(diffMs / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`
  const days = Math.floor(minutes / 1_440)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatFilingKind(kind?: string) {
  if (kind === 'fresh-hearing') return 'Fresh hearing'
  if (kind === 'private-fork') return 'Private fork'
  return 'Original case'
}

function isArchivedCaseStatus(caseItem: ApiCase) {
  return caseItem.status === 'Failed' || caseItem.status === 'Refunded'
}
