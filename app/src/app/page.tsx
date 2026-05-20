import {
  ArrowRight,
  CurrencyDollar,
  Briefcase,
  CurrencyCircleDollar,
  Gavel,
  Play,
  Eye,
  Timer,
  TrendUp,
  UserCircleCheck,
  Wallet,
} from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from './components/AppHeader'
import { AppFooter } from './components/AppFooter'
import { PageTitle } from './components/PageTitle'
import { WalletNotice } from './components/WalletNotice'
import { formatConfidence, getBackendCases, getBackendLedgerRows } from '../lib/backend-data'
import './page.css'

const agents = [
  ['Pythia', 'Prediction markets', '92%', '0.90 USDC'],
  ['Argos', 'Onchain data', '88%', '1.10 USDC'],
  ['Hermes', 'Web/news search', '84%', '0.80 USDC'],
  ['Notus', 'Data APIs', '91%', '0.70 USDC'],
  ['Skepsis', 'Source quality', '94%', '0.60 USDC'],
  ['Chronos', 'Timeline', '93%', '0.60 USDC'],
  ['Numeros', 'Quant checks', '92%', '0.90 USDC'],
  ['Phylax', 'Risk review', '97%', '0.65 USDC'],
]

export default async function DashboardPage() {
  const [backendCases, ledgerRows] = await Promise.all([getBackendCases(), getBackendLedgerRows()])
  const activeCases = backendCases.filter((item) => item.status !== 'Verdict')
  const verdictRows = ledgerRows.filter((item) => item.hash).slice(0, 3)

  return (
    <main className="app-shell">
      <AppHeader active="dashboard" />

      <section className="workspace">
        <PageTitle
          eyebrow="Prediction intelligence desk"
          title="Market questions, argued by agents"
          description="Track live prediction cases, summon specialist witnesses, compare odds against evidence, and publish public or private verdict records."
          imagePosition="center 29%"
          tone="dark"
          className="dashboard-hero-title"
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
                <span>Backend records</span>
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
                  backendCases.slice(0, 3).map((item) => (
                    <article className="case-row" key={item.id}>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.market ?? 'Prediction market'} · {item.horizon ?? 'Open'} · Backend record</p>
                      </div>
                      <span className="state-dot active">{item.status}</span>
                      <strong>{item.probability ?? formatConfidence(item.confidence)}</strong>
                      <strong>{item.witnesses?.length ?? 0} seats</strong>
                      <Link href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                        <ArrowRight size={17} />
                      </Link>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>No live cases yet</strong>
                    <p>File a case or run a backend hearing to populate the docket.</p>
                  </div>
                )}
              </div>
            </section>

            <aside className="panel action-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Fast petition</p>
                  <h2>Ask a prediction question</h2>
                </div>
                <TrendUp size={19} />
              </div>
              <div className="case-box">
                <label htmlFor="quick-case">Question</label>
                <textarea id="quick-case" defaultValue="Will ETH outperform SOL over the next 7 days?" />
                <div className="case-controls">
                  <button type="button">Crypto</button>
                  <button type="button">Macro</button>
                  <button type="button">Data</button>
                </div>
                <div className="duplicate-hint">
                  <span>Similar active case found</span>
                  <p>ETH vs SOL, 7 day horizon. Join the active hearing or request a fresh verdict before paying.</p>
                </div>
                <Link className="primary-button full-width" href="/cases/new">
                  Configure court
                  <ArrowRight size={16} />
                </Link>
              </div>
            </aside>

            <section className="panel">
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
                    <div key={`${row.caseId}-${row.item}`}>
                      <span>{row.title}</span>
                      <strong>{row.item} · {row.amount}</strong>
                      <code>{row.hash}</code>
                    </div>
                  ))
                ) : (
                  <div>
                    <span>No receipts yet</span>
                    <strong>Backend ledger awaiting records</strong>
                    <code>Pending</code>
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Witness bench</p>
                  <h2>First-party agents</h2>
                </div>
                <UserCircleCheck size={19} />
              </div>
              <div className="agent-market-list">
                {agents.map(([name, role, reliability, fee]) => (
                  <article className="roster-row" key={name}>
                    <div>
                      <h3>{name}</h3>
                      <p>{role}</p>
                    </div>
                    <div className="roster-meta">
                      <span className="state-dot ready">{reliability}</span>
                      <strong>{fee}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </section>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
