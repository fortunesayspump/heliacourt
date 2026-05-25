import { Bank, CurrencyCircleDollar, GitBranch, Wallet } from '@phosphor-icons/react/ssr'
import { Suspense, type CSSProperties } from 'react'
import Link from 'next/link'
import { AppHeader } from '../components/layout/AppHeader'
import { AppFooter } from '../components/layout/AppFooter'
import { getBackendLedgerRows, type ApiLedgerRow } from '../../lib/backend-data'
import { backendUrl } from '../../lib/backend-url'
import '../page.css'
import './ledger.css'

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
  const [ledgerRows, x402Activity] = await Promise.all([
    getBackendLedgerRows(),
    getX402Activity(),
  ])
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
  const stats = buildLedgerStats(ledgerRows, ledgerGroups)

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

        <section className="panel ledger-stats-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Stats</p>
              <h2>Proof and settlement overview</h2>
            </div>
          </div>

          <div className="ledger-proof-grid">
            <article>
              <span>Total USDC moved</span>
              <strong>{stats.totalAmount ? `${formatAmount(stats.totalAmount)} USDC` : '0 USDC'}</strong>
              <MiniLedgerBars values={stats.amountBars} />
            </article>
            <article>
              <span>Total receipts</span>
              <strong>{ledgerRows.length}</strong>
              <MiniLedgerSparkline values={stats.caseBars} />
            </article>
            <article>
              <span>x402 paid reads</span>
              <strong>{x402Activity.totalPaidReads}</strong>
              <LedgerRing value={stats.anchoredCoverage} label="Anchored" />
            </article>
            <article>
              <span>Avg receipt cost</span>
              <strong>{x402Activity.averageUsdc} USDC</strong>
              <LedgerRing value={stats.hashCoverage} label="Hashed" />
            </article>
          </div>

          <div className="ledger-kpi-strip" aria-label="Receipt intelligence stats">
            <span><b>{stats.groupCount}</b> distinct markets</span>
            <span><b>{Math.max(stats.walletCount, x402Activity.distinctPayers)}</b> distinct payers</span>
            <span><b>{x402Activity.totalUsdc} USDC</b> x402 collected</span>
            <span><b>{stats.txRows}</b> Arc tx links</span>
          </div>

          <div className="ledger-chart-grid">
            <section className="ledger-stat-block ledger-chart-block wide">
              <div className="ledger-stat-block-head">
                <span>Settlement timeline</span>
                <strong>{stats.latestActivity}</strong>
              </div>
              <div className="ledger-timeline-chart">
                {stats.dailyActivity.map((item) => (
                  <div key={item.label}>
                    <i style={{ '--bar-height': `${item.percent}%` } as CSSProperties} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="ledger-stat-block ledger-chart-block">
              <div className="ledger-stat-block-head">
                <span>Status split</span>
                <strong>{ledgerRows.length} rows</strong>
              </div>
              <div className="ledger-stack-chart" aria-label="Receipt status split">
                {stats.statusSplit.map((item) => (
                  <i key={item.label} className={item.tone} title={`${item.label}: ${item.count}`} style={{ '--stack-width': `${item.percent}%` } as CSSProperties} />
                ))}
              </div>
              <div className="ledger-chart-legend">
                {stats.statusSplit.map((item) => (
                  <span key={item.label}><i className={item.tone} />{item.label} {item.count}</span>
                ))}
              </div>
            </section>

            <section className="ledger-stat-block ledger-chart-block">
              <div className="ledger-stat-block-head">
                <span>Receipt mix</span>
                <strong>{ledgerRows.length} rows</strong>
              </div>
              <div className="ledger-mix-list">
                {stats.receiptMix.length ? stats.receiptMix.map((item) => (
                  <div key={item.label}>
                    <span>
                      <i style={{ '--mix-width': `${item.percent}%` } as CSSProperties} />
                      {item.label}
                    </span>
                    <strong>{item.count}</strong>
                  </div>
                )) : (
                  <p>No receipt mix yet.</p>
                )}
              </div>
            </section>

            <section className="ledger-stat-block ledger-chart-block">
              <div className="ledger-stat-block-head">
                <span>Audit lanes</span>
                <strong>{stats.txRows} txs</strong>
              </div>
              <div className="ledger-lane-chart">
                {stats.auditLanes.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <i style={{ '--lane-width': `${item.percent}%` } as CSSProperties} />
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

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
      <section className="panel ledger-stats-panel skeleton-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stats</p>
            <h2>Proof and settlement overview</h2>
          </div>
        </div>
        <div className="ledger-proof-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index}>
              <span className="skeleton skeleton-icon small" />
              <span className="skeleton skeleton-line tiny" />
              <strong className="skeleton skeleton-line short" />
            </article>
          ))}
        </div>
        <div className="ledger-stats-columns">
          {Array.from({ length: 3 }).map((_, index) => (
            <section className="ledger-stat-block" key={index}>
              <div className="ledger-stat-block-head">
                <span className="skeleton skeleton-line tiny" />
                <strong className="skeleton skeleton-line tiny" />
              </div>
              <div className="ledger-audit-list">
                {Array.from({ length: 4 }).map((__, rowIndex) => (
                  <div key={rowIndex}>
                    <span className="skeleton skeleton-line short" />
                    <strong className="skeleton skeleton-line tiny" />
                  </div>
                ))}
              </div>
            </section>
          ))}
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

type X402Activity = {
  totalPaidReads: number
  totalUsdc: string
  averageUsdc: string
  distinctPayers: number
  distinctCases: number
}

async function getX402Activity(): Promise<X402Activity> {
  try {
    const response = await fetch(`${backendUrl}/x402/activity`, { cache: 'no-store' })
    if (!response.ok) return emptyX402Activity()
    const payload = await response.json() as Partial<X402Activity>
    return {
      totalPaidReads: Number(payload.totalPaidReads ?? 0),
      totalUsdc: payload.totalUsdc ?? '0',
      averageUsdc: payload.averageUsdc ?? '0',
      distinctPayers: Number(payload.distinctPayers ?? 0),
      distinctCases: Number(payload.distinctCases ?? 0),
    }
  } catch {
    return emptyX402Activity()
  }
}

function emptyX402Activity(): X402Activity {
  return {
    totalPaidReads: 0,
    totalUsdc: '0',
    averageUsdc: '0',
    distinctPayers: 0,
    distinctCases: 0,
  }
}

function MiniLedgerBars({ values }: { values: number[] }) {
  const hasValue = values.some((value) => value > 0)
  const max = Math.max(1, ...values)
  return (
    <span className={`ledger-mini-bars${hasValue ? '' : ' is-empty'}`} aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} style={{ '--bar-height': `${hasValue ? Math.max(12, Math.round((value / max) * 100)) : 0}%` } as CSSProperties} />
      ))}
    </span>
  )
}

function MiniLedgerSparkline({ values }: { values: number[] }) {
  const hasValue = values.some((value) => value > 0)
  const max = Math.max(1, ...values)
  const points = hasValue && values.length > 1
    ? values.map((value, index) => {
        const x = (index / (values.length - 1)) * 100
        const y = 100 - ((value / max) * 76 + 12)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
    : '0,50 100,50'

  return (
    <svg className={`ledger-mini-line${hasValue ? '' : ' is-empty'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  )
}

function LedgerRing({ value, label }: { value: number; label: string }) {
  return (
    <span className="ledger-ring" style={{ '--ring-value': `${Math.max(0, Math.min(100, value))}%` } as CSSProperties} aria-label={`${label} ${value}%`}>
      <b>{value}%</b>
    </span>
  )
}

function buildLedgerStats(rows: ApiLedgerRow[], groups: ReturnType<typeof groupLedgerRows>) {
  const totalAmount = rows.reduce((total, row) => total + parseAmount(row.amount), 0)
  const anchoredRows = rows.filter((row) => row.status === 'Anchored').length
  const recordedRows = rows.filter((row) => row.status === 'Recorded').length
  const pendingRows = Math.max(0, rows.length - anchoredRows - recordedRows)
  const txRows = rows.filter((row) => row.txHash).length
  const hashRows = rows.filter((row) => row.hash).length
  const walletCount = new Set(rows.map((row) => row.wallet).filter(Boolean)).size
  const chainIds = [...new Set(rows.map((row) => row.chainId).filter(Boolean))]
  const latest = rows
    .map((row) => row.updated ? Date.parse(row.updated) : 0)
    .filter(Boolean)
    .sort((a, b) => b - a)[0]

  const counts = new Map<string, number>()
  for (const row of rows) {
    const label = formatReceiptType(row.receiptType)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  const receiptMix = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      count,
      percent: rows.length ? Math.max(8, Math.round((count / rows.length) * 100)) : 0,
    }))

  const dailyActivity = countLedgerDays(rows)
  const amountBars = buildAmountBars(groups)
  const caseBars = countLedgerDays(groups.map((group) => group.rows[0]).filter(Boolean) as ApiLedgerRow[]).map((item) => item.count)
  const statusSplit = [
    { label: 'Anchored', count: anchoredRows, tone: 'anchored' },
    { label: 'Recorded', count: recordedRows, tone: 'recorded' },
    { label: 'Pending', count: pendingRows, tone: 'pending' },
  ].map((item) => ({
    ...item,
    percent: rows.length ? Math.max(item.count ? 6 : 0, Math.round((item.count / rows.length) * 100)) : 0,
  }))
  const maxLane = Math.max(1, rows.length, txRows, hashRows, walletCount)
  const auditLanes = [
    { label: 'Rows', value: rows.length, percent: Math.round((rows.length / maxLane) * 100) },
    { label: 'Tx hashes', value: txRows, percent: Math.round((txRows / maxLane) * 100) },
    { label: 'Record hashes', value: hashRows, percent: Math.round((hashRows / maxLane) * 100) },
    { label: 'Wallets', value: walletCount, percent: Math.round((walletCount / maxLane) * 100) },
  ]

  return {
    totalAmount,
    groupCount: groups.length,
    anchoredCoverage: rows.length ? Math.round((anchoredRows / rows.length) * 100) : 0,
    hashCoverage: rows.length ? Math.round((hashRows / rows.length) * 100) : 0,
    txRows,
    hashRows,
    walletCount,
    receiptMix,
    chainLabel: chainIds.length ? chainIds.join(', ') : 'No chain',
    latestActivity: latest ? formatLedgerDate(latest) : 'No activity',
    dailyActivity,
    amountBars,
    caseBars,
    statusSplit,
    auditLanes,
  }
}

function countLedgerDays(rows: ApiLedgerRow[]) {
  const today = startOfLocalDay(Date.now())
  const counts = Array.from({ length: 7 }, (_, index) => {
    const day = today - ((6 - index) * 86_400_000)
    return {
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(day)),
      count: 0,
      percent: 0,
    }
  })

  for (const row of rows) {
    if (!row.updated) continue
    const age = Math.floor((today - startOfLocalDay(Date.parse(row.updated))) / 86_400_000)
    if (age >= 0 && age < counts.length) counts[counts.length - 1 - age].count += 1
  }

  const max = Math.max(1, ...counts.map((item) => item.count))
  return counts.map((item) => ({
    ...item,
    percent: Math.max(item.count ? 10 : 4, Math.round((item.count / max) * 100)),
  }))
}

function buildAmountBars(groups: ReturnType<typeof groupLedgerRows>) {
  const values = groups
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 7)
    .map((group) => group.total)
  return values.length ? values : [0]
}

function startOfLocalDay(value: number) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function formatLedgerDate(value: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
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
