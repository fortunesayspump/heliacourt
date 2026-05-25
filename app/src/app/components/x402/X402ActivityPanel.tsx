'use client'

import { ArrowClockwise, Briefcase, Receipt, ShieldCheck, UsersThree } from '@phosphor-icons/react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { getArcExplorerTxUrl } from '../../../lib/arc'
import { normalizeActivity, type X402ActivitySnapshot } from '../../../lib/x402-activity'

export function X402ActivityPanel({ initialActivity }: { initialActivity: X402ActivitySnapshot }) {
  const [activity, setActivity] = useState(initialActivity)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/x402/activity', { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json() as Partial<X402ActivitySnapshot>
      setActivity(normalizeActivity(payload))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('helia:x402-paid-read', refresh)
    return () => window.removeEventListener('helia:x402-paid-read', refresh)
  }, [refresh])

  return (
    <section className="panel x402-activity-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Paid API ledger</p>
          <h2>Recent x402 reads</h2>
        </div>
        <button className="icon-button" type="button" onClick={refresh} aria-label="Refresh x402 activity">
          <ArrowClockwise size={18} className={loading ? 'spin-icon' : undefined} />
        </button>
      </div>

      <div className="x402-activity-summary">
        <article>
          <Receipt size={17} />
          <span>Reads</span>
          <strong>{activity.totalPaidReads}</strong>
        </article>
        <article>
          <ShieldCheck size={17} />
          <span>Collected</span>
          <strong>{activity.totalUsdc} USDC</strong>
        </article>
        <article>
          <UsersThree size={17} />
          <span>Payers</span>
          <strong>{activity.distinctPayers}</strong>
        </article>
        <article>
          <Briefcase size={17} />
          <span>Cases</span>
          <strong>{activity.distinctCases}</strong>
        </article>
      </div>

      <div className="x402-activity-list">
        {activity.recent.length ? activity.recent.map((receipt, index) => {
          const caseHref = receipt.caseId ? `/cases/${receipt.caseId}?tab=receipts` : null
          const txHref = getExplorerTxHref(receipt.transactionId)

          return (
            <article className="x402-activity-row" key={`${receipt.transactionId ?? receipt.caseId ?? 'x402'}-${index}`}>
              {caseHref ? (
                <Link className="x402-activity-case-link" href={caseHref}>
                  <strong>{formatResource(receipt.resource)}</strong>
                  <span>{shortValue(receipt.caseId, 10, 8)}</span>
                </Link>
              ) : (
                <div className="x402-activity-case-link">
                  <strong>{formatResource(receipt.resource)}</strong>
                  <span>No case linked</span>
                </div>
              )}
              <div>
                {txHref ? (
                  <a className="x402-activity-hash-link" href={txHref} target="_blank" rel="noreferrer">
                    <code>{shortValue(receipt.transactionId, 8, 6)}</code>
                  </a>
                ) : (
                  <code>{shortValue(receipt.transactionId, 8, 6) || 'pending tx'}</code>
                )}
                <em>{receipt.amountUsdc ?? '0'} USDC</em>
                <time>{formatDate(receipt.createdAt)}</time>
              </div>
            </article>
          )
        }) : (
          <div className="x402-activity-empty">
            <strong>No paid reads yet</strong>
            <p>Run Pay and read above. Settled x402 calls will appear here with route, case, amount, and transaction id.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function formatResource(value?: string | null) {
  if (!value) return 'Paid read'
  const match = value.match(/\/x402\/([^/]+)/)
  const label = match?.[1] ?? value.split('/').filter(Boolean).at(-2) ?? value
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)} read`
}

function shortValue(value?: string | null, start = 8, end = 6) {
  if (!value) return ''
  if (value.length <= start + end + 3) return value
  return `${value.slice(0, start)}...${value.slice(-end)}`
}

function getExplorerTxHref(value?: string | null) {
  return getArcExplorerTxUrl(value)
}

function formatDate(value?: string | null) {
  if (!value) return 'just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'just now'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
