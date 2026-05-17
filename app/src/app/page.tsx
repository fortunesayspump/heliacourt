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
import { courtCases } from '../data/cases'
import './page.css'

const verdicts = [
  ['BTC funding squeeze', 'Bullish edge', '64%', '0x91b2...a43f'],
  ['AI chip export odds', 'Watchlist', '57%', '0x2df8...c883'],
  ['ETH/BTC rotation', 'No clear edge', '54%', '0x774c...90ad'],
]

const agents = [
  ['Pythia', 'Prediction markets', '92%', '0.90 USDC'],
  ['Argos', 'Onchain data', '88%', '1.10 USDC'],
  ['Hermes', 'Web/news search', '84%', '0.80 USDC'],
  ['Notus', 'Weather/data API', '91%', '0.70 USDC'],
  ['Phylax', 'Risk review', '97%', '0.65 USDC'],
]

const hearingTiers = [
  ['Quick brief', '1-3 min', '$1-2', 'One pass, fewer witnesses'],
  ['Standard hearing', '5-15 min', '$5-10', 'Follow-ups, counsel, verdict'],
  ['Deep hearing', '30-90 min', '$15+', 'Multiple witness rounds'],
]

export default function DashboardPage() {
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
                <span>Live markets</span>
                <strong>12 active</strong>
              </div>
            </div>
            <div className="metric">
              <Timer size={19} />
              <div>
                <span>Median hearing</span>
                <strong>8 min</strong>
              </div>
            </div>
            <div className="metric">
              <CurrencyDollar size={19} />
              <div>
                <span>Avg case budget</span>
                <strong>7.40 USDC</strong>
              </div>
            </div>
            <div className="metric">
              <Eye size={19} />
              <div>
                <span>Public verdicts</span>
                <strong>38 sealed</strong>
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
                {courtCases.slice(0, 3).map((item) => (
                  <article className="case-row" key={item.title}>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.market} · {item.horizon} · {item.visibility}</p>
                    </div>
                    <span className="state-dot active">{item.status}</span>
                    <strong>{item.probability}</strong>
                    <strong>{item.budget}</strong>
                    <Link href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                      <ArrowRight size={17} />
                    </Link>
                  </article>
                ))}
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
                  <button type="button">Weather</button>
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
                  <p className="eyebrow">Hearing tiers</p>
                  <h2>Speed and cost</h2>
                </div>
                <Wallet size={19} />
              </div>
              <div className="settlement-table">
                {hearingTiers.map(([tier, duration, price, detail]) => (
                  <div key={tier}>
                    <span>{tier}</span>
                    <strong>{duration} · {price}</strong>
                    <code>{detail}</code>
                  </div>
                ))}
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

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Verdict archive</p>
                  <h2>Recent decision receipts</h2>
                </div>
                <CurrencyCircleDollar size={19} />
              </div>
              <div className="settlement-table">
                {verdicts.map(([market, decision, confidence, hash]) => (
                  <div key={market}>
                    <span>{market}</span>
                    <strong>{decision} · {confidence}</strong>
                    <code>{hash}</code>
                  </div>
                ))}
              </div>
            </section>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
