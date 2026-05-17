import { ArrowRight, Briefcase, Clock, Gavel, MagnifyingGlass } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'
import { courtCases } from '../../data/cases'
import '../page.css'
import './cases.css'

export default function CasesPage() {
  return (
    <main className="app-shell">
      <AppHeader active="cases" />

      <section className="workspace">
        <PageTitle
          eyebrow="Docket"
          title="Cases"
          description="Browse prediction-market intelligence cases by probability, horizon, witness coverage, visibility, and settlement status."
          imageSrc="/assets/socrates.1400x0.jpg"
          imagePosition="center 38%"
          actions={
            <Link className="primary-button" href="/cases/new">
              File case
              <ArrowRight size={16} />
            </Link>
          }
        />

        <section className="panel cases-docket-panel">
          <div className="panel-heading cases-docket-heading">
            <div>
              <p className="eyebrow">Prediction docket</p>
              <h2>Live intelligence cases</h2>
            </div>
            <Briefcase size={20} />
          </div>

          <div className="toolbar-row">
            <div className="search-field">
              <MagnifyingGlass size={16} />
              <input type="search" placeholder="Search cases, markets, hashes" aria-label="Search cases" />
            </div>
            <button type="button">All statuses</button>
            <button type="button">My cases</button>
          </div>

          <div className="docket-case-grid">
            {courtCases.map((item) => (
              <article className="docket-case-card" key={item.id}>
                <div className="docket-case-card-top">
                  <span className="state-dot active">{item.status}</span>
                  <span className="muted-inline">
                    <Clock size={14} />
                    {item.updated}
                  </span>
                </div>

                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail} · {item.resolution}</p>
                </div>

                <div className="docket-case-card-meta">
                  <div>
                    <span>Odds</span>
                    <strong>{item.probability}</strong>
                  </div>
                  <div>
                    <span>Time</span>
                    <strong>{item.horizon}</strong>
                  </div>
                  <div>
                    <span>Cost</span>
                    <strong>${item.budget.replace(' USDC', '')}</strong>
                  </div>
                </div>

                <div className="docket-case-card-actions">
                  <Link className="docket-case-card-link" href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                    Open case
                    <ArrowRight size={16} />
                  </Link>
                  {item.duplicatePolicy === 'joinable' ? (
                    <Link className="secondary-button compact-action" href="/cases/new">
                      Join
                    </Link>
                  ) : (
                    <Link className="secondary-button compact-action" href="/cases/new">
                      Fresh hearing
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="metrics-grid">
          <div className="metric">
            <Briefcase size={19} />
            <div>
              <span>Drafts</span>
              <strong>3 cases</strong>
            </div>
          </div>
          <div className="metric">
            <Gavel size={19} />
            <div>
              <span>In hearing</span>
              <strong>5 cases</strong>
            </div>
          </div>
          <div className="metric">
            <Clock size={19} />
            <div>
              <span>Awaiting vote</span>
              <strong>2 cases</strong>
            </div>
          </div>
          <div className="metric">
            <ArrowRight size={19} />
            <div>
              <span>Settled today</span>
              <strong>8 receipts</strong>
            </div>
          </div>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
