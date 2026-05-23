import { CurrencyCircleDollar, GitBranch, Bank, Wallet } from '@phosphor-icons/react/ssr'
import { Suspense } from 'react'
import Link from 'next/link'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { getBackendLedgerRows, type ApiLedgerRow } from '../../lib/backend-data'
import '../page.css'

export default function LedgerPage() {
  return (
    <main className="app-shell">
      <AppHeader active="ledger" />

      <section className="workspace">
        <Suspense fallback={<LedgerSkeleton />}>
          <LedgerData />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

async function LedgerData() {
  const ledgerRows = await getBackendLedgerRows()
  const ledgerGroups = groupLedgerRows(ledgerRows)
  const anchored = ledgerRows.filter((row) => row.status === 'Anchored')
  const recorded = ledgerRows.filter((row) => row.status === 'Recorded')
  const pending = ledgerRows.filter((row) => row.status !== 'Anchored' && row.status !== 'Recorded')
  const payouts = ledgerRows.filter((row) => row.receiptType === 'agent-payout')
  const payoutSummaries = ledgerRows.filter((row) => row.receiptType === 'agent-payout-summary')
  const protocolFees = ledgerRows.filter((row) => row.receiptType === 'protocol-fee')
  const escrowed = ledgerRows
    .filter((row) => row.receiptType === 'case-funding')
    .reduce((total, row) => total + parseAmount(row.amount), 0)
  const paid = [...payouts, ...payoutSummaries].reduce((total, row) => total + parseAmount(row.amount), 0)
  const protocolFeeTotal = protocolFees.reduce((total, row) => total + parseAmount(row.amount), 0)

  return (
    <>
        <section className="metrics-grid">
          <div className="metric">
            <Wallet size={19} />
            <div>
              <span>Escrowed budget</span>
              <strong>{escrowed ? `${escrowed.toFixed(2)} USDC` : `${pending.length} pending`}</strong>
            </div>
          </div>
          <div className="metric">
            <CurrencyCircleDollar size={19} />
            <div>
              <span>Agent payouts</span>
              <strong>{paid ? `${paid.toFixed(2)} USDC` : `${payouts.length} rows`}</strong>
            </div>
          </div>
          <div className="metric">
            <Bank size={19} />
            <div>
              <span>Protocol fees</span>
              <strong>{protocolFeeTotal ? `${formatAmount(protocolFeeTotal)} USDC` : 'Pending'}</strong>
            </div>
          </div>
          <div className="metric">
            <GitBranch size={19} />
            <div>
              <span>Decision records</span>
              <strong>{anchored.length} anchored · {recorded.length} recorded</strong>
            </div>
          </div>
        </section>

        <section className="panel ledger-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Receipts</p>
              <h2>Settlement activity</h2>
            </div>
          </div>
          <div className="ledger-table">
            {ledgerGroups.length ? ledgerGroups.map((group) => (
              <details className="receipt-ledger-group" key={group.key}>
                <summary className="receipt-ledger-row receipt-ledger-group-summary">
                  <div className="receipt-mark">
                    {group.imageUrl ? <img alt="" src={group.imageUrl} /> : <span>{group.title.slice(0, 1)}</span>}
                  </div>
                  <div>
                    <span>{group.rows.length} receipt rows</span>
                    <h3>{group.title}</h3>
                    <p>{formatGroupSubtitle(group.rows)}</p>
                  </div>
                  <code>{shortCaseId(group.caseId)}</code>
                  <strong>{group.total ? `${formatAmount(group.total)} USDC` : 'Record'}</strong>
                  <span className="state-dot ready">{formatGroupStatus(group.rows)}</span>
                </summary>
                <div className="receipt-ledger-group-rows">
                  {group.rows.map(({ caseId, title, imageUrl, item, amount, status, hash, txHash, receiptType, agentId }, index) => (
                    <Link className="receipt-ledger-row receipt-ledger-child-row" href={`/cases/${caseId}?tab=receipts`} key={`${caseId}-${receiptType}-${hash ?? txHash ?? 'record'}-${agentId ?? item}-${amount}-${index}`}>
                      <div className="receipt-mark">
                        {imageUrl ? <img alt="" src={imageUrl} /> : <span>{formatReceiptType(receiptType).slice(0, 1)}</span>}
                      </div>
                      <div>
                        <span>{formatReceiptType(receiptType)}</span>
                        <h3>{item}</h3>
                        <p>{title}</p>
                      </div>
                      <code>{hash ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : shortCaseId(caseId)}</code>
                      <strong>{amount}</strong>
                      <span className="state-dot ready">{status}</span>
                    </Link>
                  ))}
                </div>
              </details>
            )) : (
              <article className="receipt-ledger-row">
                <div className="receipt-mark"><span>R</span></div>
                <div>
                  <span>Receipt</span>
                  <h3>No settlement records yet</h3>
                  <p>Settle a case to create the first verdict receipt.</p>
                </div>
                <code>Pending</code>
                <strong>Pending</strong>
                <span className="state-dot">Empty</span>
              </article>
            )}
          </div>
        </section>
    </>
  )
}

function LedgerSkeleton() {
  return (
    <>
      <section className="metrics-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="metric skeleton-metric" key={index}>
            <span className="skeleton skeleton-icon" />
            <div>
              <span className="skeleton skeleton-line short" />
              <strong className="skeleton skeleton-line" />
            </div>
          </div>
        ))}
      </section>
      <section className="panel ledger-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Receipts</p>
            <h2>Settlement activity</h2>
          </div>
        </div>
        <div className="ledger-table">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="receipt-ledger-row" key={index}>
              <span className="receipt-mark skeleton skeleton-icon" />
              <div>
                <span className="skeleton skeleton-line tiny" />
                <h3 className="skeleton skeleton-line title" />
                <p className="skeleton skeleton-line short" />
              </div>
              <code className="skeleton skeleton-line short" />
              <strong className="skeleton skeleton-line tiny" />
              <span className="skeleton skeleton-pill" />
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function parseAmount(value: string) {
  const match = value.match(/^\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function formatAmount(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function formatReceiptType(value?: string) {
  if (!value) return 'Receipt'
  return value
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function shortCaseId(id: string) {
  if (id.length > 18) return `${id.slice(0, 12)}...`
  return id
}

function groupLedgerRows(rows: ApiLedgerRow[]) {
  const groups = new Map<string, {
    key: string
    caseId: string
    title: string
    imageUrl?: string
    total: number
    rows: ApiLedgerRow[]
  }>()

  for (const row of rows) {
    const key = row.caseId || row.title
    const current = groups.get(key) ?? {
      key,
      caseId: row.caseId,
      title: row.title,
      imageUrl: row.imageUrl,
      total: 0,
      rows: [],
    }
    current.imageUrl ||= row.imageUrl
    current.total += parseAmount(row.amount)
    current.rows.push(row)
    groups.set(key, current)
  }

  return [...groups.values()]
}

function formatGroupSubtitle(rows: ApiLedgerRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const label = formatReceiptType(row.receiptType)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .slice(0, 3)
    .map(([label, count]) => count > 1 ? `${count} ${label}` : label)
    .join(' · ')
}

function formatGroupStatus(rows: ApiLedgerRow[]) {
  if (rows.some((row) => row.status === 'Pending')) return 'Pending'
  if (rows.some((row) => row.status === 'Recorded')) return 'Recorded'
  if (rows.every((row) => row.status === 'Anchored')) return 'Anchored'
  return rows[0]?.status ?? 'Record'
}
