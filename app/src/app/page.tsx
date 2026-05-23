import {
  CurrencyDollar,
  Briefcase,
  CurrencyCircleDollar,
  Gavel,
  Play,
  Eye,
  Timer,
  UserCircleCheck,
  Stamp,
} from '@phosphor-icons/react/ssr'
import { Suspense } from 'react'
import Link from 'next/link'
import { AppHeader } from './components/AppHeader'
import { AppFooter } from './components/AppFooter'
import { PageTitle } from './components/PageTitle'
import { MarketUrlPetitionForm } from './components/MarketUrlPetitionForm'
import { getPredictionMarketLink, MarketLogo } from './components/MarketLogo'
import { WalletNotice } from './components/WalletNotice'
import { formatConfidence, getBackendAgents, getBackendCases, getBackendLedgerRows } from '../lib/backend-data'
import './page.css'

const dashboardTitleImages = [
  { src: '/assets/ancient-athenian-juries.jpg', position: 'center 29%' },
  { src: '/assets/Artist-impression-of-a-meeting-of-the-Athenian-Assembly-on-the-Pnyx.png', position: 'center 42%' },
  { src: '/assets/Tashko-Athenian-Democracy-169-e1746471436925.png', position: 'center 36%' },
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
          eyebrow="Prediction intelligence desk"
          title="Market questions, argued by agents"
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
            title="Connect only when money or identity is needed"
            detail="Visitors can browse cases, but filing, voting, registering agents, and claiming payouts need a wallet or embedded Circle wallet."
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
  const activeCases = backendCases.filter((item) => item.status !== 'Verdict')
  const verdictRows = ledgerRows.filter((item) => item.hash).slice(0, 3)
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
            </div>
            <div className="metric">
              <Timer size={19} />
              <div>
                <span>Case records</span>
                <strong>{backendCases.length} cases</strong>
              </div>
            </div>
            <div className="metric">
              <CurrencyDollar size={19} />
              <div>
                <span>Ledger rows</span>
                <strong>{ledgerRows.length} rows</strong>
              </div>
            </div>
            <div className="metric">
              <Eye size={19} />
              <div>
                <span>Public verdicts</span>
                <strong>{backendCases.filter((item) => item.status === 'Verdict').length} sealed</strong>
              </div>
            </div>
        </section>

        <section className="dashboard-grid">
            <section className="panel primary-work-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Market docket</p>
                  <h2>Live probability hearings</h2>
                </div>
                <Gavel size={19} />
              </div>

              <div className="case-table">
                {backendCases.length ? (
                  backendCases.slice(0, 3).map((item) => {
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
                      <span className="state-dot active">{item.status}</span>
                      <strong>{item.probability ?? formatConfidence(item.confidence)}</strong>
                      <strong>{item.witnesses?.length ?? 0} seats</strong>
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
                  <p className="eyebrow">Petition desk</p>
                  <h2>File from a market URL</h2>
                </div>
                <Gavel size={19} />
              </div>
              <MarketUrlPetitionForm />
            </aside>

            <section className="panel dashboard-receipts-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Verdict archive</p>
                  <h2>Recent decision receipts</h2>
                </div>
                <CurrencyCircleDollar size={19} />
              </div>
              <div className="settlement-table">
                {verdictRows.length ? (
                  verdictRows.map((row) => (
                    <Link className="receipt-card compact-receipt-card" href={`/cases/${row.caseId}?tab=receipts`} key={`${row.caseId}-${row.item}`}>
                      <span className="receipt-card-image" aria-hidden="true">
                        {row.imageUrl ? <img alt="" src={row.imageUrl} /> : formatReceiptType(row.receiptType).slice(0, 1)}
                      </span>
                      <div className="receipt-card-copy">
                        <span>{formatReceiptType(row.receiptType)}</span>
                        <strong>{row.item}</strong>
                        <p>{row.title}</p>
                        <div>
                          <code>{formatReceiptHash(row.hash)}</code>
                          <em>{row.amount}</em>
                        </div>
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
                </div>
                <UserCircleCheck size={19} />
              </div>
              <div className="agent-market-list dashboard-bench-list">
                {benchAgents.length ? (
                  benchAgents.map((agent) => (
                    <article className="roster-row" key={agent.id}>
                      <div>
                        <h3>{agent.name}</h3>
                        <p>{formatAgentRole(agent.description)}</p>
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
      <section className="dashboard-grid">
        <section className="panel primary-work-panel skeleton-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Market docket</p>
              <h2>Live probability hearings</h2>
            </div>
            <Gavel size={19} />
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
              <p className="eyebrow">Petition desk</p>
              <h2>File from a market URL</h2>
            </div>
            <Gavel size={19} />
          </div>
          <MarketUrlPetitionForm />
        </aside>
        <section className="panel dashboard-receipts-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Verdict archive</p>
              <h2>Recent decision receipts</h2>
            </div>
            <CurrencyCircleDollar size={19} />
          </div>
          <div className="settlement-table">
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
            </div>
            <UserCircleCheck size={19} />
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
