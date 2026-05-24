import { Briefcase, Clock, Gavel, SealCheck } from '@phosphor-icons/react/ssr'
import { Suspense, type CSSProperties } from 'react'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { CaseSearchList } from '../components/CaseSearchList'
import { getBackendCases, type ApiCase } from '../../lib/backend-data'
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
  const caseStats = buildCaseStats(backendCases)

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
            <MiniBars values={caseStats.statusBars} />
          </div>
          <div className="metric">
            <Gavel size={19} />
            <div>
              <span>In hearing</span>
              <strong>{backendCases.filter((item) => item.status === 'Hearing').length} cases</strong>
            </div>
            <MiniSparkline values={caseStats.hearingTrend} />
          </div>
          <div className="metric">
            <Clock size={19} />
            <div>
              <span>Awaiting vote</span>
              <strong>{backendCases.filter((item) => item.status === 'Queued' || item.status === 'Hearing').length} cases</strong>
            </div>
            <MiniBars values={caseStats.visibilityBars} />
          </div>
          <div className="metric">
            <SealCheck size={19} />
            <div>
              <span>Settled today</span>
              <strong>{backendCases.filter((item) => item.status === 'Verdict' || item.status === 'Refunded').length} receipts</strong>
            </div>
            <MiniSparkline values={caseStats.verdictTrend} />
          </div>
        </section>
    </>
  )
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
  const hasValue = values.some((value) => value > 0)
  const points = hasValue && values.length > 1
    ? values.map((value, index) => {
        const x = (index / (values.length - 1)) * 100
        const y = 100 - ((value / max) * 78 + 11)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
    : '0,50 100,50'

  return (
    <svg className={`metric-sparkline${hasValue ? '' : ' is-empty'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  )
}

function buildCaseStats(cases: ApiCase[]) {
  return {
    statusBars: [
      cases.filter((item) => item.status === 'Queued').length,
      cases.filter((item) => item.status === 'Hearing').length,
      cases.filter((item) => item.status === 'Verdict' || item.status === 'Refunded').length,
    ],
    visibilityBars: [
      cases.filter((item) => item.visibility === 'public' || !item.visibility).length,
      cases.filter((item) => item.visibility === 'unlisted').length,
      cases.filter((item) => item.visibility === 'private').length,
    ],
    hearingTrend: countRecentDays(cases.filter((item) => item.status === 'Hearing').map((item) => item.updated ?? item.createdAt)),
    verdictTrend: countRecentDays(cases.filter((item) => item.status === 'Verdict' || item.status === 'Refunded').map((item) => item.updated ?? item.createdAt)),
  }
}

function countRecentDays(values: Array<string | undefined>) {
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
