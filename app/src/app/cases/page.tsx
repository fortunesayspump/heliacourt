import { Briefcase, Clock, Gavel, SealCheck } from '@phosphor-icons/react/ssr'
import { Suspense } from 'react'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { CaseSearchList } from '../components/CaseSearchList'
import { getBackendCases } from '../../lib/backend-data'
import '../page.css'
import './cases.css'

export default function CasesPage() {
  return (
    <main className="app-shell">
      <AppHeader active="cases" />

      <section className="workspace">
        <Suspense fallback={<CasesSkeleton />}>
          <CasesData />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

async function CasesData() {
  const backendCases = await getBackendCases()
  const initialNow = Date.now()

  return (
    <>
        <CaseSearchList cases={backendCases} initialNow={initialNow} />

        <section className="metrics-grid">
          <div className="metric">
            <Briefcase size={19} />
            <div>
              <span>Queued</span>
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
            <SealCheck size={19} />
            <div>
              <span>Settled today</span>
              <strong>{backendCases.filter((item) => item.status === 'Verdict').length} receipts</strong>
            </div>
          </div>
        </section>
    </>
  )
}

function CasesSkeleton() {
  return (
    <>
      <div className="case-search-field skeleton-case-search" aria-hidden="true">
        <span className="skeleton skeleton-icon small" />
        <span className="skeleton skeleton-line" />
      </div>
      <section className="cases-docket-panel">
          <div className="cases-market-heading">
            <div>
              <p className="eyebrow">Prediction docket</p>
              <h2>Markets</h2>
            </div>
            <Briefcase size={20} />
          </div>
        <div className="docket-case-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <article className="docket-case-card skeleton-card" key={index}>
              <div className="docket-case-card-banner">
                <span className="skeleton skeleton-fill" />
                <div><span className="skeleton skeleton-pill" /></div>
                <strong><span className="skeleton skeleton-line tiny" /></strong>
              </div>
              <div className="docket-case-card-head">
                <div>
                  <span className="market-provider-line">
                    <span className="skeleton skeleton-icon small" />
                    <span className="skeleton skeleton-line short" />
                  </span>
                  <span className="skeleton skeleton-line title" />
                  <span className="skeleton skeleton-line" />
                </div>
              </div>
              <div className="case-market-lines">
                {Array.from({ length: 3 }).map((_, lineIndex) => (
                  <div key={lineIndex}>
                    <span className="skeleton skeleton-line tiny" />
                    <strong className="skeleton skeleton-line short" />
                  </div>
                ))}
              </div>
              <div className="docket-case-card-actions">
                <span className="skeleton skeleton-button" />
                <span className="skeleton skeleton-button" />
              </div>
            </article>
          ))}
        </div>
      </section>
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
    </>
  )
}
