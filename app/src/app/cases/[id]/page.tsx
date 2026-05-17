import { ArrowLeft, ShieldCheck, Sparkle, UserCircleCheck } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { courtCases, getCourtCase } from '../../../data/cases'
import '../../page.css'

const transcriptEvents = [
  {
    time: '09:12',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Court convened',
    kind: 'verdict',
    body: 'Court is in session. Verdict-only hearing. Counsel may examine witnesses; objections go through the bench.',
    meta: ['Verdict only'],
  },
  {
    time: '09:13',
    actor: 'Mnemon',
    role: 'Court Clerk',
    stage: 'Record opened',
    kind: 'clerk',
    body: 'Record opened. Budget, horizon, visibility, and receipt trail filed.',
    meta: ['Record opened'],
  },
  {
    time: '09:14',
    actor: 'Kleio',
    role: 'Evidence Clerk',
    stage: 'Evidence packet',
    kind: 'clerk',
    body: 'Question normalized. Similar hearings checked before witnesses were seated.',
    meta: ['Evidence packet'],
  },
  {
    time: '09:16',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Opening order',
    kind: 'verdict',
    body: 'Counsel, frame the issue. Solon carries the affirmative case; Draco may challenge foundation and relevance.',
    meta: ['Opening order'],
  },
  {
    time: '09:17',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Opening statement',
    kind: 'counsel',
    body: 'Three signals point the same way: probability drift, fresh news, and onchain flow. We ask for a restrained yes-side verdict.',
    meta: ['Affirmative'],
  },
  {
    time: '09:18',
    actor: 'Draco',
    role: 'Bear Counsel',
    stage: 'Opening statement',
    kind: 'counsel',
    body: 'Those signals may be echoes of one public story. Attention is not the same as edge.',
    meta: ['Defense'],
  },
  {
    time: '09:19',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Witness called',
    kind: 'verdict',
    body: 'Call Pythia. Solon, establish foundation first.',
    meta: ['Pythia called'],
  },
  {
    time: '09:20',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Direct examination',
    kind: 'counsel',
    body: 'Pythia, state your role and the data reviewed.',
    meta: ['Foundation'],
  },
  {
    time: '09:21',
    actor: 'Pythia',
    role: 'Prediction Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'I reviewed prices, odds movement, spreads, and liquidity. I compare implied probability with evidence-weighted probability.',
    meta: ['Prediction markets'],
  },
  {
    time: '09:22',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Direct examination',
    kind: 'counsel',
    body: 'Do current prices understate the yes-side probability?',
    meta: ['Probability'],
  },
  {
    time: '09:23',
    actor: 'Pythia',
    role: 'Prediction Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'Slightly. The edge is weak-to-moderate, not decisive.',
    meta: ['54%'],
  },
  {
    time: '09:24',
    actor: 'Draco',
    role: 'Bear Counsel',
    stage: 'Objection',
    kind: 'objection',
    body: 'Objection. The witness is mixing liquidity with probability.',
    meta: ['Objection'],
  },
  {
    time: '09:25',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Ruling',
    kind: 'ruling',
    body: 'Sustained in part. Separate probability from liquidity.',
    meta: ['Sustained'],
  },
  {
    time: '09:26',
    actor: 'Pythia',
    role: 'Prediction Witness',
    stage: 'Clarification',
    kind: 'witness',
    body: 'Probability leans yes-side narrowly. Liquidity weakens confidence.',
    meta: ['Narrow edge'],
  },
  {
    time: '09:27',
    actor: 'Draco',
    role: 'Bear Counsel',
    stage: 'Cross-examination',
    kind: 'counsel',
    body: 'If liquidity is weak and odds moved after public headlines, is this just stale information?',
    meta: ['Cross'],
  },
  {
    time: '09:28',
    actor: 'Pythia',
    role: 'Prediction Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'Possible. The edge weakens under cross, but it still leans yes-side.',
    meta: ['Restrained'],
  },
  {
    time: '09:29',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Objection',
    kind: 'objection',
    body: 'Objection. “Stale” characterizes the answer.',
    meta: ['Argumentative'],
  },
  {
    time: '09:30',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Ruling',
    kind: 'ruling',
    body: 'Overruled. Cross may test adverse framing.',
    meta: ['Overruled'],
  },
  {
    time: '09:31',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Redirect',
    kind: 'counsel',
    body: 'After separating liquidity, does your testimony still align with the other evidence?',
    meta: ['Redirect'],
  },
  {
    time: '09:32',
    actor: 'Pythia',
    role: 'Prediction Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'Yes. Weak, but aligned.',
    meta: ['Aligned'],
  },
  {
    time: '09:34',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Next witness',
    kind: 'verdict',
    body: 'Call Hermes. Draco may examine on source freshness.',
    meta: ['Hermes seated', 'News freshness'],
  },
  {
    time: '09:35',
    actor: 'Draco',
    role: 'Bear Counsel',
    stage: 'Direct examination',
    kind: 'counsel',
    body: 'Hermes, did the headlines arrive early enough to matter?',
    meta: ['News timing'],
  },
  {
    time: '09:36',
    actor: 'Hermes',
    role: 'News Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'Fresh, but not hidden. Major feeds already carried them.',
    meta: ['Relevant, not hidden'],
  },
  {
    time: '09:37',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Objection',
    kind: 'objection',
    body: 'Objection. Assumes market absorption.',
    meta: ['Assumes facts'],
  },
  {
    time: '09:38',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Ruling',
    kind: 'ruling',
    body: 'Sustained. Rephrase for timing.',
    meta: ['Sustained'],
  },
  {
    time: '09:39',
    actor: 'Draco',
    role: 'Bear Counsel',
    stage: 'Direct examination',
    kind: 'counsel',
    body: 'How quickly did the story hit major feeds relative to the odds move?',
    meta: ['Timing'],
  },
  {
    time: '09:40',
    actor: 'Hermes',
    role: 'News Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'It reached major feeds before the strongest odds move.',
    meta: ['Public before move'],
  },
  {
    time: '09:41',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Cross-examination',
    kind: 'counsel',
    body: 'Does the timing still support a short-horizon adjustment?',
    meta: ['Cross'],
  },
  {
    time: '09:42',
    actor: 'Hermes',
    role: 'News Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'Lightly. It supports attention, not a high-confidence verdict.',
    meta: ['Light support'],
  },
  {
    time: '09:44',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Next witness',
    kind: 'verdict',
    body: 'Call Argos. Test whether flows confirm the record or echo the narrative.',
    meta: ['Argos seated', 'Onchain flow'],
  },
  {
    time: '09:45',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Direct examination',
    kind: 'counsel',
    body: 'Argos, do exchange flows support the yes-side interpretation?',
    meta: ['Onchain'],
  },
  {
    time: '09:46',
    actor: 'Argos',
    role: 'Onchain Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'At the margin, yes. Lower deposits and stablecoin rotation favor larger assets.',
    meta: ['Partial support'],
  },
  {
    time: '09:47',
    actor: 'Draco',
    role: 'Bear Counsel',
    stage: 'Cross-examination',
    kind: 'counsel',
    body: 'Could this be broad rotation rather than ETH-over-SOL strength?',
    meta: ['Cross'],
  },
  {
    time: '09:48',
    actor: 'Argos',
    role: 'Onchain Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'Yes. It does not isolate ETH over SOL cleanly.',
    meta: ['Not isolated'],
  },
  {
    time: '09:49',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Judicial question',
    kind: 'ruling',
    body: 'Answer directly: ETH over SOL, or broader rotation?',
    meta: ['Judge question'],
  },
  {
    time: '09:50',
    actor: 'Argos',
    role: 'Onchain Witness',
    stage: 'Witness answer',
    kind: 'witness',
    body: 'Broader rotation. It supports Solon indirectly.',
    meta: ['Narrowed'],
  },
  {
    time: '09:52',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Counsel closing',
    kind: 'verdict',
    body: 'Witness examination is closed. Counsel may argue from the record.',
    meta: ['Closed'],
  },
  {
    time: '09:53',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Closing argument',
    kind: 'counsel',
    body: 'The record still aligns: Pythia narrow-positive, Hermes timing-positive, Argos indirect-positive. Cautious yes-side edge.',
    meta: ['64%'],
  },
  {
    time: '09:55',
    actor: 'Draco',
    role: 'Bear Counsel',
    stage: 'Closing argument',
    kind: 'counsel',
    body: 'Every witness narrowed the claim. Proper verdict: watchlist or no clear edge.',
    meta: ['58%'],
  },
  {
    time: '09:57',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Question to counsel',
    kind: 'ruling',
    body: 'Solon, why not downgrade when every witness narrowed the claim?',
    meta: ['Judge question'],
  },
  {
    time: '09:58',
    actor: 'Solon',
    role: 'Bull Counsel',
    stage: 'Response',
    kind: 'counsel',
    body: 'Narrowing is not contradiction. Confidence falls, direction holds.',
    meta: ['Response'],
  },
  {
    time: '10:00',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Risk order',
    kind: 'verdict',
    body: 'Phylax will review confidence and uncertainty.',
    meta: ['Risk review'],
  },
  {
    time: '10:01',
    actor: 'Phylax',
    role: 'Risk Bailiff',
    stage: 'Risk review',
    kind: 'risk',
    body: 'Confidence is not high enough for a strong decree. Preserve dissent.',
    meta: ['Uncertainty'],
  },
  {
    time: '10:04',
    actor: 'Dikasts',
    role: 'Jury Panel',
    stage: 'Vote',
    kind: 'jury',
    body: 'Kallias and Sophon allow cautious edge. Thraso dissents to watchlist.',
    meta: ['2-1 vote'],
  },
  {
    time: '10:07',
    actor: 'Archon',
    role: 'Presiding Magistrate',
    stage: 'Verdict',
    kind: 'verdict',
    body: 'Verdict finalized. Receipt sealed by Nomisma.',
    meta: ['Final'],
  },
]

const witnesses = [
  ['Pythia', 'Prediction witness', 'Probability range and liquidity.'],
  ['Hermes', 'News witness', 'Freshness and source timing.'],
  ['Argos', 'Onchain witness', 'Wallet flow and exchange movement.'],
]

const transcriptPreviewTimes = new Set([
  '09:12',
  '09:17',
  '09:18',
  '09:23',
  '09:24',
  '09:25',
  '09:36',
  '09:37',
  '09:38',
  '09:46',
  '09:49',
  '09:53',
  '09:55',
  '10:01',
  '10:04',
  '10:07',
])

const jurors = [
  ['Kallias', 'Momentum juror', 'Bullish edge'],
  ['Thraso', 'Skeptic juror', 'Watchlist'],
  ['Sophon', 'Risk juror', 'Evidence sufficient'],
]

const tabs = [
  ['transcript', 'Transcript'],
  ['verdict', 'Verdict'],
  ['receipts', 'Receipts'],
  ['history', 'History'],
] as const

type CaseTab = (typeof tabs)[number][0]

export function generateStaticParams() {
  return courtCases.map((item) => ({ id: item.id }))
}

export default async function CaseRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const courtCase = getCourtCase(id)
  const activeTab: CaseTab = tabs.some(([tab]) => tab === query?.tab) ? (query?.tab as CaseTab) : 'transcript'
  const transcriptPreview = transcriptEvents.filter((event) => transcriptPreviewTimes.has(event.time))

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
            <section className="panel sidebar-card case-sidebar-title">
              <p className="eyebrow">Case record / {courtCase.status}</p>
              <h1>{courtCase.title}</h1>
              <p>{courtCase.detail}. {courtCase.note}.</p>
            </section>

            <section className="panel sidebar-card">
              <p className="eyebrow">Case facts</p>
              <div className="sidebar-facts">
                <div><span>Status</span><strong>{courtCase.status}</strong></div>
                <div><span>Confidence</span><strong>{courtCase.confidence}</strong></div>
                <div><span>Horizon</span><strong>{courtCase.horizon}</strong></div>
                <div><span>Market</span><strong>{courtCase.market}</strong></div>
              </div>
            </section>
          </aside>

          <section className="case-detail-main">
            {activeTab === 'transcript' && (
              <section className="panel hearing-transcript-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Court transcript</p>
                    <h2>Hearing summary</h2>
                  </div>
                  <Sparkle size={19} />
                </div>

                <div className="court-matter">
                  <p className="eyebrow">Matter before the court</p>
                  <h3>{courtCase.title}</h3>
                  <p>{courtCase.resolution}</p>
                </div>

                <div className="court-transcript" aria-label="Court transcript messages">
                  {transcriptPreview.map((event) => (
                    <article className={`transcript-entry ${event.kind}`} key={`${event.time}-${event.actor}`}>
                      <div className="transcript-avatar" aria-hidden="true">
                        {event.actor.slice(0, 1)}
                      </div>
                      <div className="transcript-message">
                        <div className="transcript-meta">
                          <div>
                            <strong>{event.actor}</strong>
                            <span>{event.role}</span>
                          </div>
                          <time>{event.time}</time>
                        </div>
                        <p className="transcript-stage">{event.stage}</p>
                        <p>{event.body}</p>
                      </div>
                    </article>
                  ))}
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
                  <h2>{courtCase.verdict}</h2>
                  <ul>
                    <li>Confidence: {courtCase.confidence}</li>
                    <li>Dissent preserved: Thraso watchlist.</li>
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
                  <div><span>Case spend</span><strong>0.30 USDC</strong></div>
                  <div><span>Witnesses</span><strong>0.11 USDC</strong></div>
                  <div><span>Court agents</span><strong>0.16 USDC</strong></div>
                  <div><span>Protocol fee</span><strong>0.03 USDC</strong></div>
                  <div><span>Record hash</span><strong>{courtCase.receipt}</strong></div>
                </div>
              </section>
            )}

            {activeTab === 'history' && (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Dikasts</p>
                    <h2>Votes and case history</h2>
                  </div>
                  <ShieldCheck size={19} />
                </div>
                <div className="compact-list">
                  {jurors.map(([name, role, vote]) => (
                    <article className="roster-row" key={name}>
                      <div>
                        <h3>{name}</h3>
                        <p>{role}</p>
                      </div>
                      <div className="roster-meta">
                        <span className="state-dot voting">{vote}</span>
                      </div>
                    </article>
                  ))}
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
                {witnesses.map(([name, role, testimony]) => (
                  <article className="compact-card" key={name}>
                    <h3>{name}</h3>
                    <p>{role}</p>
                    <strong>{testimony}</strong>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
