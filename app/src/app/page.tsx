import {
  Briefcase,
  CurrencyDollar,
  Eye,
  Play,
  Stamp,
  Timer,
} from '@phosphor-icons/react/ssr'
import { Suspense, type CSSProperties } from 'react'
import Link from 'next/link'
import { AppHeader } from './components/AppHeader'
import { AppFooter } from './components/AppFooter'
import { PageTitle } from './components/PageTitle'
import { MarketUrlPetitionForm } from './components/MarketUrlPetitionForm'
import { getPredictionMarketLink, MarketLogo } from './components/MarketLogo'
import { WalletNotice } from './components/WalletNotice'
import { formatConfidence, getBackendAgents, getBackendCases, getBackendLedgerRows, type ApiCase, type ApiLedgerRow } from '../lib/backend-data'
import './page.css'

const dashboardTitleImages = [
  { src: '/assets/ancient-athenian-juries.jpg', position: 'center 29%' },
  { src: '/assets/tashko-athenian-democracy-hero.webp', position: 'center 36%' },
  { src: '/assets/athenian-women-attack-a-messenger-12726.jpg', position: 'center 34%' },
  { src: '/assets/socrates-address-louis-joseph-lebrun-1867-credit-public-domain-wikimedia-commons.jpeg', position: 'center 30%' },
  { src: '/assets/socrates.1400x0.jpg', position: 'center 33%' },
  { src: '/assets/schoolxl.jpg', position: 'center 45%' },
  { src: '/assets/3630068.jpg', position: 'center 38%' },
  { src: '/assets/71.webp', position: 'center 40%' },
]

export default function DashboardPage() {
  return (
    <main className="app-shell">
      <AppHeader active="dashboard" />

      <section className="workspace">
        <PageTitle
          eyebrow="Market case filing"
          title="Paste a market link. Get an agent verdict."
          description="Helia pulls the market details, seats specialist witnesses, argues both sides, and records the verdict with Arc receipts."
          className="dashboard-hero-title"
          imageSrcs={dashboardTitleImages}
          imagePosition="center 29%"
          tone="dark"
          actions={
            <>
            <Link className="secondary-button" href="/cases">
              <Briefcase size={16} />
              View docket
            </Link>
            <Link className="primary-button" href="/cases/new">
              <Play size={16} />
              File case
            </Link>
            </>
          }
        />

        <WalletNotice
            title="Browse first. Connect when you fund."
            detail="Paste a supported Polymarket, Kalshi, or Manifold link to preview the case. A wallet is only needed when you file, follow, fund, or claim payouts."
            action="Connect"
        />

        <Suspense fallback={<DashboardDataSkeleton />}>
          <DashboardData />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

async function DashboardData() {
  const [backendCases, ledgerRows, registryAgents] = await Promise.all([
    getBackendCases(),
    getBackendLedgerRows(),
    getBackendAgents(),
  ])
  const activeCases = backendCases.filter((item) => item.status !== 'Verdict' && item.status !== 'Refunded')
  const verdictRows = ledgerRows.filter((item) => item.hash).slice(0, 10)
  const liveFeed = buildLiveFeed(backendCases, ledgerRows).slice(0, 8)
  const graphStats = buildDashboardGraphs(backendCases, ledgerRows)
  const benchAgents = registryAgents
    .filter((agent) => agent.enabled && (agent.seat === 'expert-witness' || agent.seat === 'risk-bailiff'))

  return (
    <>
        <section className="metrics-grid" aria-label="Platform metrics">
            <div className="metric">
              <Briefcase size={19} />
              <div>
                <span>Live cases</span>
                <strong>{activeCases.length} active</strong>
              </div>
              <MiniBars values={graphStats.statusBars} />
            </div>
            <div className="metric">
              <Timer size={19} />
              <div>
                <span>Case records</span>
                <strong>{backendCases.length} cases</strong>
              </div>
              <MiniSparkline values={graphStats.caseCadence} />
            </div>
            <div className="metric">
              <CurrencyDollar size={19} />
              <div>
                <span>Ledger rows</span>
                <strong>{ledgerRows.length} rows</strong>
              </div>
              <MiniBars values={graphStats.receiptBars} />
            </div>
            <div className="metric">
              <Eye size={19} />
              <div>
                <span>Public verdicts</span>
                <strong>{backendCases.filter((item) => item.status === 'Verdict' || item.status === 'Refunded').length} sealed</strong>
              </div>
              <MiniSparkline values={graphStats.verdictCadence} />
            </div>
        </section>

        <section className="live-court-feed-panel" aria-label="Live court activity">
          <div className="live-court-feed">
            {liveFeed.length ? (
              <div className="live-court-feed-track">
                {[...liveFeed, ...liveFeed].map((item, index) => (
                  <Link className="live-court-feed-row" href={item.href} key={`${item.id}-${index}`}>
                    <span className={`live-feed-mark ${item.tone}`}>{item.kind}</span>
                    <strong>{item.label}</strong>
                    <span>{item.title}</span>
                    <time>{formatRelativeTime(item.timestamp)}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="live-court-feed-empty">No activity yet</div>
            )}
          </div>
        </section>

        <section className="dashboard-grid">
            <section className="panel primary-work-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Market docket</p>
                  <h2>Live cases</h2>
                  <p className="panel-hint">Open hearings, verdicts, and market records moving through the court.</p>
                </div>
              </div>

              <div className="case-table dashboard-case-list">
                {backendCases.length ? (
                  backendCases.slice(0, 10).map((item) => {
                    const marketLink = getPredictionMarketLink(item.links)

                    return (
                    <article className="case-row" key={item.id}>
                      <div className="market-row-image" aria-hidden="true">
                        {item.imageUrl ? <img alt="" src={item.imageUrl} /> : <MarketLogo url={marketLink} market={item.market} />}
                      </div>
                      <div>
                        <h3>{item.title}</h3>
                        <p className="case-row-market-meta">
                          <MarketLogo url={marketLink} market={item.market} showLabel />
                          <span>{item.horizon ?? 'Open'}</span>
                        </p>
                      </div>
                      <div className="case-row-stats" aria-label="Case status">
                        <span className="state-dot active">{item.status}</span>
                        <strong>{item.probability ?? formatConfidence(item.confidence)}</strong>
                        <strong>{item.witnesses?.length ?? 0} seats</strong>
                      </div>
                      <Link href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                        <Stamp size={17} />
                      </Link>
                    </article>
                  )})
                ) : (
                  <div className="empty-state">
                    <strong>No live cases yet</strong>
                    <p>File a case to populate the docket.</p>
                  </div>
                )}
              </div>
            </section>

            <aside className="panel action-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Start here</p>
                  <h2>Paste a market URL</h2>
                  <p className="panel-hint">Supported links auto-fill the case before wallet funding.</p>
                </div>
              </div>
              <MarketUrlPetitionForm />
            </aside>

            <section className="panel dashboard-receipts-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Verdict archive</p>
                  <h2>Recent decision receipts</h2>
                  <p className="panel-hint">Funding, verdict, and settlement records from recent cases.</p>
                </div>
              </div>
              <div className="settlement-table dashboard-receipt-list">
                {verdictRows.length ? (
                  verdictRows.map((row) => (
                    <Link className="receipt-card compact-receipt-card" href={`/cases/${row.caseId}?tab=receipts`} key={`${row.caseId}-${row.item}`}>
                      <span className="receipt-card-image" aria-hidden="true">
                        {row.imageUrl ? <img alt="" src={row.imageUrl} /> : formatReceiptType(row.receiptType).slice(0, 1)}
                      </span>
                      <div className="receipt-card-copy">
                        <div className="receipt-card-top">
                          <span className="receipt-card-kind">{formatReceiptType(row.receiptType)}</span>
                          <em>{row.amount}</em>
                        </div>
                        <strong className="receipt-card-item">{row.item}</strong>
                        <p>{row.title}</p>
                        <code>{formatReceiptHash(row.hash)}</code>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="receipt-card compact-receipt-card">
                    <span>No receipts yet</span>
                    <strong>No receipt records yet</strong>
                    <p>File or settle a case to create the first receipt.</p>
                    <div>
                      <code>Pending</code>
                      <em>0 USDC</em>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="panel dashboard-agents-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Agent registry</p>
                  <h2>Active witness bench</h2>
                  <p className="panel-hint">Tool-backed agents currently available for hearings.</p>
                </div>
              </div>
              <div className="agent-market-list dashboard-bench-list">
                {benchAgents.length ? (
                  benchAgents.map((agent) => (
                    <article className="roster-row" key={agent.id}>
                      <div className="roster-agent-copy">
                        <span className="registry-avatar" aria-hidden="true">
                          {agent.avatarUrl ? <img alt="" src={agent.avatarUrl} /> : agent.name.slice(0, 1)}
                        </span>
                        <div>
                          <h3>{agent.name}</h3>
                          <p>{formatAgentRole(agent.description)}</p>
                        </div>
                      </div>
                      <div className="roster-meta">
                        <span className="state-dot ready">{agent.runMode}</span>
                        <strong>{formatAgentFee(agent.priceUsd)}</strong>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>No agents yet</strong>
                    <p>Agent seats will appear here when records are available.</p>
                  </div>
                )}
              </div>
            </section>
        </section>
    </>
  )
}

function DashboardDataSkeleton() {
  return (
    <>
      <section className="metrics-grid" aria-label="Platform metrics loading">
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
      <section className="live-court-feed-panel">
        <div className="live-court-feed">
          <div className="live-court-feed-track">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="live-court-feed-row" key={index}>
              <span className="skeleton skeleton-line tiny" />
              <strong className="skeleton skeleton-line short" />
              <span className="skeleton skeleton-line title" />
              <time className="skeleton skeleton-line tiny" />
            </article>
          ))}
          </div>
        </div>
      </section>
      <section className="dashboard-grid">
        <section className="panel primary-work-panel skeleton-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Market docket</p>
              <h2>Live cases</h2>
              <p className="panel-hint">Open hearings, verdicts, and market records moving through the court.</p>
            </div>
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <article className="case-row skeleton-case-row" key={index}>
              <span className="skeleton skeleton-thumb market-row-image" />
              <div>
                <span className="skeleton skeleton-line title" />
                <span className="skeleton skeleton-line short" />
              </div>
              <span className="skeleton skeleton-pill" />
              <span className="skeleton skeleton-line tiny" />
              <span className="skeleton skeleton-line short" />
              <span className="skeleton skeleton-action" />
            </article>
          ))}
        </section>
        <aside className="panel action-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Start here</p>
              <h2>Paste a market URL</h2>
              <p className="panel-hint">Supported links auto-fill the case before wallet funding.</p>
            </div>
          </div>
          <MarketUrlPetitionForm />
        </aside>
        <section className="panel dashboard-receipts-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Verdict archive</p>
              <h2>Recent decision receipts</h2>
              <p className="panel-hint">Funding, verdict, and settlement records from recent cases.</p>
            </div>
          </div>
          <div className="settlement-table dashboard-receipt-list">
            {Array.from({ length: 3 }).map((_, index) => (
              <article className="receipt-card compact-receipt-card skeleton-receipt-card" key={index}>
                <span className="skeleton receipt-card-image" />
                <span className="skeleton skeleton-line short" />
                <strong className="skeleton skeleton-line" />
                <p className="skeleton skeleton-line title" />
                <div>
                  <code className="skeleton skeleton-line short" />
                  <em className="skeleton skeleton-line tiny" />
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="panel dashboard-agents-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Agent registry</p>
              <h2>Active witness bench</h2>
              <p className="panel-hint">Tool-backed agents currently available for hearings.</p>
            </div>
          </div>
          <div className="agent-market-list dashboard-bench-list">
            {Array.from({ length: 6 }).map((_, index) => (
              <article className="roster-row skeleton-roster-row" key={index}>
                <div>
                  <h3 className="skeleton skeleton-line short" />
                  <p className="skeleton skeleton-line" />
                </div>
                <div className="roster-meta">
                  <span className="skeleton skeleton-pill" />
                  <strong className="skeleton skeleton-line tiny" />
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </>
  )
}

function formatAgentRole(description: string) {
  const [, detail] = description.split('. ')
  return detail || description
}

function formatAgentFee(value: number) {
  return value ? `${value.toFixed(2)} USDC` : '0.00 USDC'
}

function formatReceiptHash(value?: string) {
  if (!value) return 'Pending'
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function formatReceiptType(value?: string) {
  if (!value) return 'Receipt'
  return value
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  return (
    <span className="metric-mini-bars" aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} style={{ '--bar-height': `${Math.max(14, Math.round((value / max) * 100))}%` } as CSSProperties} />
      ))}
    </span>
  )
}

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const points = values.length > 1
    ? values.map((value, index) => {
        const x = (index / (values.length - 1)) * 100
        const y = 100 - ((value / max) * 78 + 11)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
    : '0,89 100,89'

  return (
    <svg className="metric-sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  )
}

function buildDashboardGraphs(cases: ApiCase[], ledgerRows: ApiLedgerRow[]) {
  const statusBars = [
    cases.filter((item) => item.status === 'Queued').length,
    cases.filter((item) => item.status === 'Hearing').length,
    cases.filter((item) => item.status === 'Verdict' || item.status === 'Refunded').length,
  ]
  const receiptBars = [
    ledgerRows.filter((item) => item.receiptType?.includes('funding')).length,
    ledgerRows.filter((item) => item.receiptType?.includes('payout')).length,
    ledgerRows.filter((item) => item.receiptType?.includes('fee')).length,
    ledgerRows.filter((item) => item.receiptType?.includes('verdict') || item.receiptType?.includes('record')).length,
  ]

  return {
    statusBars,
    receiptBars,
    caseCadence: countByRecentDay(cases.map((item) => item.createdAt ?? item.updated)),
    verdictCadence: countByRecentDay(cases.filter((item) => item.status === 'Verdict' || item.status === 'Refunded').map((item) => item.updated ?? item.createdAt)),
  }
}

function countByRecentDay(values: Array<string | undefined>) {
  const counts = Array.from({ length: 7 }, () => 0)
  const today = startOfDay(Date.now())
  for (const value of values) {
    if (!value) continue
    const age = Math.floor((today - startOfDay(Date.parse(value))) / 86_400_000)
    if (age >= 0 && age < counts.length) counts[counts.length - 1 - age] += 1
  }
  return counts
}

function startOfDay(value: number) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function buildLiveFeed(cases: ApiCase[], ledgerRows: ApiLedgerRow[]) {
  const caseItems = cases.map((item) => ({
    id: `case-${item.id}-${item.updated ?? item.createdAt ?? ''}`,
    kind: 'Case',
    tone: item.status === 'Verdict' || item.status === 'Refunded' ? 'sealed' : item.status === 'Hearing' ? 'hearing' : 'queued',
    label: item.status === 'Refunded' ? 'Escrow refunded' : item.status === 'Verdict' ? 'Verdict sealed' : item.status === 'Hearing' ? 'Hearing active' : 'Case filed',
    title: item.title,
    timestamp: item.updated ?? item.createdAt,
    href: `/cases/${item.id}`,
  }))

  const receiptItems = ledgerRows.filter((row) => row.hash || row.txHash).map((row) => ({
    id: `receipt-${row.caseId}-${row.receiptType ?? row.item}-${row.hash ?? row.txHash}`,
    kind: 'Receipt',
    tone: row.status === 'Anchored' ? 'anchored' : 'recorded',
    label: `${formatReceiptType(row.receiptType)} ${row.status.toLowerCase()}`,
    title: row.title,
    timestamp: row.updated,
    href: `/cases/${row.caseId}?tab=receipts`,
  }))

  return [...caseItems, ...receiptItems]
    .filter((item): item is typeof item & { timestamp: string } => Boolean(item.timestamp))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
}

function formatRelativeTime(value?: string) {
  if (!value) return 'Pending'
  const deltaMs = Date.now() - Date.parse(value)
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return 'Now'
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
