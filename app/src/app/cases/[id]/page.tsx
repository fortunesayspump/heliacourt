import { ArrowLeft, Briefcase, ShieldCheck, Sparkle, Timer, TrendUp, UserCircleCheck } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { formatConfidence, getBackendCases } from '../../../lib/backend-data'
import '../../page.css'

const tabs = [
  ['transcript', 'Transcript'],
  ['verdict', 'Verdict'],
  ['receipts', 'Receipts'],
  ['history', 'History'],
] as const

type CaseTab = (typeof tabs)[number][0]

export const dynamic = 'force-dynamic'

export default async function CaseRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const courtCase = (await getBackendCases()).find((item) => item.id === id)
  const activeTab: CaseTab = tabs.some(([tab]) => tab === query?.tab) ? (query?.tab as CaseTab) : 'transcript'

  if (!courtCase) {
    return (
      <main className="app-shell">
        <AppHeader active="cases" />
        <section className="workspace">
          <Link className="secondary-button compact-back" href="/cases">
            <ArrowLeft size={16} />
            Docket
          </Link>
          <section className="panel empty-state">
            <strong>Case record not found</strong>
            <p>This page now reads backend case records only. Run or file a hearing to create this case.</p>
          </section>
        </section>
        <AppFooter />
      </main>
    )
  }

  const confidence = formatConfidence(courtCase.confidence)
  const caseFacts = [
    ['Status', courtCase.status, ShieldCheck],
    ['Confidence', confidence, TrendUp],
    ['Horizon', courtCase.horizon ?? 'Open', Timer],
    ['Market', courtCase.market ?? 'Prediction market', Briefcase],
  ] as const
  const witnesses = courtCase.witnesses ?? []

  return (
    <main className="app-shell">
      <AppHeader active="cases" />

      <section className="workspace case-record-workspace">
        <section className="case-detail-topbar" aria-label="Case navigation">
          <Link className="secondary-button compact-back" href="/cases">
            <ArrowLeft size={16} />
            Docket
          </Link>
          <nav className="case-record-tabs top-record-tabs" aria-label="Case sections">
            {tabs.map(([tab, label]) => (
              <Link
                aria-current={activeTab === tab ? 'page' : undefined}
                className={activeTab === tab ? 'active' : undefined}
                href={`/cases/${id}${tab === 'transcript' ? '' : `?tab=${tab}`}`}
                key={tab}
              >
                {label}
              </Link>
            ))}
          </nav>
        </section>

        <section className="case-detail-shell">
          <aside className="case-detail-sidebar" aria-label="Case sidebar">
            <section className="panel sidebar-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Case facts</p>
                  <h2>Record status</h2>
                </div>
                <Briefcase size={19} />
              </div>
              <div className="sidebar-facts">
                {caseFacts.map(([label, value, Icon]) => (
                  <article className="compact-card fact-card" key={label}>
                    <span className="agent-presence" aria-hidden="true"><Icon size={15} /></span>
                    <div>
                      <h3>{label}</h3>
                      <p>{value}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>

          <section className="case-detail-main">
            {activeTab === 'transcript' && (
              <section className="panel hearing-transcript-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Court transcript</p>
                    <h2>Hearing record</h2>
                  </div>
                  <Sparkle size={19} />
                </div>
                <div className="court-matter">
                  <p className="eyebrow">Matter before the court</p>
                  <h3>{courtCase.title}</h3>
                  <p>{courtCase.resolution ?? 'Resolution context is stored with the backend case record.'}</p>
                </div>
                <div className="empty-state">
                  <strong>Transcript API not wired yet</strong>
                  <p>Backend hearing logs remain the source of truth until transcript streaming is exposed.</p>
                </div>
              </section>
            )}

            {activeTab === 'verdict' && (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Archon decree</p>
                    <h2>Verdict</h2>
                  </div>
                  <ShieldCheck size={19} />
                </div>
                <div className="verdict-box compact-verdict">
                  <div className="verdict-mark">
                    <ShieldCheck size={28} />
                  </div>
                  <div>
                    <p className="eyebrow">Backend outcome</p>
                    <h2>{courtCase.verdict ?? 'Hearing pending'}</h2>
                    <p>Confidence: {confidence}. Verdict-only intelligence; no trade is executed.</p>
                  </div>
                  <ul>
                    <li><TrendUp size={16} /> {courtCase.probability ?? confidence} probability</li>
                    <li><Sparkle size={16} /> {courtCase.receipt ?? 'Receipt pending'}</li>
                  </ul>
                </div>
              </section>
            )}

            {activeTab === 'receipts' && (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Arc receipt</p>
                    <h2>Payments and record hash</h2>
                  </div>
                  <Sparkle size={19} />
                </div>
                <div className="settlement-table compact-settlement">
                  <div><span>Record hash</span><strong>{courtCase.receipt ?? 'Pending'}</strong></div>
                  <div><span>Settlement rows</span><strong>See ledger</strong></div>
                  <div><span>Source</span><strong>Backend hearing job</strong></div>
                </div>
              </section>
            )}

            {activeTab === 'history' && (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Witnesses</p>
                    <h2>Agents seated</h2>
                  </div>
                  <UserCircleCheck size={19} />
                </div>
                <div className="compact-list">
                  {witnesses.length ? witnesses.map((name) => (
                    <article className="roster-row" key={name}>
                      <div>
                        <h3>{name}</h3>
                        <p>Backend hearing participant</p>
                      </div>
                      <div className="roster-meta">
                        <span className="state-dot voting">Seated</span>
                      </div>
                    </article>
                  )) : (
                    <div className="empty-state">
                      <strong>No witness list yet</strong>
                      <p>The backend case has not published seated agents for this record.</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </section>

          <aside className="case-detail-right" aria-label="Court bench">
            <section className="panel hearing-side-stack">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Court bench</p>
                  <h2>Agents seated</h2>
                </div>
                <UserCircleCheck size={19} />
              </div>
              <div className="compact-list">
                {witnesses.length ? witnesses.map((name) => (
                  <article className="compact-card bench-news" key={name}>
                    <span className="agent-presence" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <h3>{name}</h3>
                      <p>Backend-selected agent</p>
                    </div>
                  </article>
                )) : (
                  <div className="empty-state">
                    <strong>Bench pending</strong>
                    <p>Run the hearing to seat witnesses and counsel.</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
