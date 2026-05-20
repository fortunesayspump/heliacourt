import { ArrowRight, Briefcase, Clock, Gavel, MagnifyingGlass } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'
import { formatConfidence, formatUpdated, getBackendCases } from '../../lib/backend-data'
import '../page.css'
import './cases.css'

export default async function CasesPage() {
  const backendCases = await getBackendCases()

  return (
    <main className="app-shell">
      <AppHeader active="cases" />

      <section className="workspace">
        <PageTitle
          eyebrow="Docket"
          title="Cases"
          description="Track active prediction-market intelligence cases by odds, horizon, and hearing status."
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

          {backendCases.length ? (
          <div className="docket-case-grid">
            {backendCases.map((item) => (
              <article className="docket-case-card" key={item.id}>
                <div className="docket-case-card-top">
                  <span className="state-dot active">{item.status}</span>
                  <span>{item.market ?? 'Prediction market'}</span>
                </div>

                <div className="docket-case-card-main">
                  <h3>{item.title}</h3>
                  <p>{item.resolution ?? item.verdict ?? 'Live hearing record pending.'}</p>
                </div>

                <div className="docket-case-card-meta">
                  <div>
                    <span>Odds</span>
                    <strong>{item.probability ?? formatConfidence(item.confidence)}</strong>
                  </div>
                  <div>
                    <span>Time</span>
                    <strong>{item.horizon ?? 'Open'}</strong>
                  </div>
                  <div>
                    <span>Witnesses</span>
                    <strong>{item.witnesses?.length ?? 0}</strong>
                  </div>
                </div>

                <div className="docket-case-card-actions">
                  <span className="muted-inline">
                    <Clock size={14} />
                    {formatUpdated(item.updated)}
                  </span>
                  <Link className="docket-case-card-link" href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                    Open case
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          ) : (
            <div className="empty-state">
              <h3>No backend hearings yet</h3>
              <p>File a case to create the first live docket record. The docket reads backend records only.</p>
              <Link className="primary-button" href="/cases/new">
                File case
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>

        <section className="metrics-grid">
          <div className="metric">
            <Briefcase size={19} />
            <div>
              <span>Drafts</span>
              <strong>{backendCases.filter((item) => item.status === 'Queued').length} cases</strong>
            </div>
          </div>
          <div className="metric">
            <Gavel size={19} />
            <div>
              <span>In hearing</span>
              <strong>{backendCases.filter((item) => item.status === 'Hearing').length} cases</strong>
            </div>
          </div>
          <div className="metric">
            <Clock size={19} />
            <div>
              <span>Awaiting vote</span>
              <strong>{backendCases.filter((item) => item.status === 'Queued' || item.status === 'Hearing').length} cases</strong>
            </div>
          </div>
          <div className="metric">
            <ArrowRight size={19} />
            <div>
              <span>Settled today</span>
              <strong>{backendCases.filter((item) => item.status === 'Verdict').length} receipts</strong>
            </div>
          </div>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
