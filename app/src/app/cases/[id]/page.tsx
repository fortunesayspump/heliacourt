import { ArrowLeft, Clock, Gauge, Scales, Storefront } from '@phosphor-icons/react/ssr'
import { Suspense } from 'react'
import Link from 'next/link'
import { AppHeader } from '../../components/layout/AppHeader'
import { AppFooter } from '../../components/layout/AppFooter'
import { CaseAddFundingButton } from '../../components/cases/CaseAddFundingButton'
import { CaseDetailTabs } from '../../components/cases/CaseDetailTabs'
import { CaseFollowButton } from '../../components/cases/CaseFollowButton'
import { CaseLiveTranscript } from '../../components/cases/CaseLiveTranscript'
import { getMarketProvider, MarketLogo } from '../../components/markets/MarketLogo'
import { MarketPreviewImage } from '../../components/markets/MarketPreviewImage'
import { PrivateCaseUnlockPanel } from '../../components/cases/PrivateCaseUnlockPanel'
import { getArcExplorerTxUrl } from '../../../lib/arc'
import { formatConfidence, getBackendCaseDetail } from '../../../lib/backend-data'
import {
  buildCaseHistoryEvents,
  formatAgentLabel,
  formatFilingKind,
  formatHistoryDate,
  formatMarketType,
  formatReceiptType,
  formatUrlLabel,
  getRelatedLinks,
  getVerdictDisplay,
  isSupportedPredictionMarketLink,
  shortCaseId,
  shortReceiptHash,
  summarizeSeatedAgents,
} from './case-record-utils'
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

  return (
    <main className="app-shell">
      <AppHeader active="cases" />
      <section className="workspace case-record-workspace">
        <section className="case-detail-topbar" aria-label="Case navigation">
          <Link className="secondary-button compact-back" href="/cases">
            <ArrowLeft size={16} />
            Docket
          </Link>
          <div className="case-detail-actions">
            <CaseFollowButton caseId={id} />
            <Suspense fallback={<CaseFundingSkeleton />}>
              <CaseFundingAction caseId={id} />
            </Suspense>
            <Link className="secondary-button compact-back" href={`/cases/new?parent=${encodeURIComponent(id)}&kind=fresh-hearing`}>
              Fresh hearing
            </Link>
            <Link className="secondary-button compact-back" href={`/cases/new?parent=${encodeURIComponent(id)}&kind=private-fork`}>
              Private fork
            </Link>
          </div>
        </section>
        <Suspense fallback={<CaseRecordSkeleton />}>
          <CaseRecordData id={id} searchParams={searchParams} />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

async function CaseFundingAction({ caseId }: { caseId: string }) {
  const caseDetail = await getBackendCaseDetail(caseId)
  return <CaseAddFundingButton caseId={caseId} onchain={caseDetail?.case.onchain} />
}

function CaseFundingSkeleton() {
  return (
    <div className="case-add-funding-control case-add-funding-skeleton">
      <input aria-label="Additional USDC funding loading" disabled placeholder="0.10 USDC" />
      <button className="secondary-button compact-back" disabled type="button">
        Join funding
      </button>
    </div>
  )
}

async function CaseRecordData({
  id,
  searchParams,
}: {
  id: string
  searchParams?: Promise<{ tab?: string }>
}) {
  const query = await searchParams
  const caseDetail = await getBackendCaseDetail(id)
  const courtCase = caseDetail?.case
  const activeTab: CaseTab = tabs.some(([tab]) => tab === query?.tab) ? (query?.tab as CaseTab) : 'transcript'

  if (!courtCase) {
    return (
      <>
          <PrivateCaseUnlockPanel caseId={id} />
      </>
    )
  }

  const seatedAgents = summarizeSeatedAgents(caseDetail.transcript)
  const verdictArtifact = caseDetail.artifacts.findLast((artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')
  const settlementArtifact = caseDetail.artifacts.findLast((artifact) => artifact.agentId === 'settlement-clerk')
  const onchainReceipts = caseDetail.onchainSettlement?.receipts ?? []
  const relatedLinks = getRelatedLinks(courtCase.links, courtCase.resolution, caseDetail.artifacts)
  const predictionMarketLink = [...courtCase.links ?? [], ...relatedLinks.map((link) => link.url)].find(isSupportedPredictionMarketLink)
  const confidence = formatConfidence(courtCase.confidence)
  const marketLabel = getMarketProvider({ url: predictionMarketLink, market: courtCase.market })?.label ?? formatMarketType(courtCase.market)
  const verdictDisplay = getVerdictDisplay({
    confidence,
    fallback: courtCase.verdict,
    question: courtCase.title,
    summary: verdictArtifact?.summary,
    transcriptMessage: verdictArtifact?.transcriptMessage,
  })
  const caseFacts = [
    ['Status', courtCase.status],
    ['Confidence', confidence],
    ['Horizon', courtCase.horizon ?? 'Open'],
    ['Market', marketLabel],
  ] as const

  return (
    <>
        <section className="panel case-detail-hero">
          <div className="case-hero-media">
            <MarketPreviewImage fallbackTitle={courtCase.title} imageUrl={courtCase.imageUrl} preferOgImage url={predictionMarketLink} />
          </div>
          <div className="case-hero-copy">
            <div className="case-hero-kicker">
              <span className="state-dot active">{courtCase.status}</span>
              <span className="case-hero-market-logo">
                <MarketLogo url={predictionMarketLink} market={courtCase.market} />
              </span>
              <span>{courtCase.horizon ?? 'Open'}</span>
            </div>
            <h1>{courtCase.title}</h1>
            <div className="case-hero-stats" aria-label="Case stats">
              {caseFacts.map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            {courtCase.onchain ? (
              <div className="onchain-facts case-onchain-facts">
                <span>Escrow case #{courtCase.onchain.caseId}</span>
                <span>{courtCase.onchain.budgetUsdc} USDC funded</span>
                <span>Chain {courtCase.onchain.chainId}</span>
                {courtCase.parentCaseId ? <span>{formatFilingKind(courtCase.filingKind)} of {shortCaseId(courtCase.parentCaseId)}</span> : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="case-detail-shell">
          <section className="case-detail-main">
            <CaseDetailTabs
              initialTab={activeTab}
              tabs={tabs}
              panels={{
                transcript: (
              <section className="panel hearing-transcript-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Court transcript</p>
                    <h2>Hearing record</h2>
                  </div>
                </div>
                <CaseLiveTranscript caseId={courtCase.id} initialArtifacts={caseDetail.artifacts} initialTranscript={caseDetail.transcript} />
              </section>
                ),

                verdict: (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Archon decree</p>
                    <h2>Verdict</h2>
                  </div>
                </div>
                <div className="verdict-sheet">
                  <section className="verdict-sheet-hero">
                    <div>
                      <p className="eyebrow">Court outcome</p>
                      <h2>{verdictDisplay.title}</h2>
                      <p>{verdictDisplay.body}</p>
                    </div>
                  </section>

                  <section className="verdict-stat-grid" aria-label="Verdict stats">
                    <article>
                      <span>Probability</span>
                      <strong>{courtCase.probability ?? confidence}</strong>
                    </article>
                    <article>
                      <span>Confidence</span>
                      <strong>{verdictArtifact?.confidence ? formatConfidence(verdictArtifact.confidence) : confidence}</strong>
                    </article>
                    <article>
                      <span>Record hash</span>
                      <strong>{shortReceiptHash(caseDetail.recordHash ?? courtCase.receipt)}</strong>
                    </article>
                    <article>
                      <span>Settlement</span>
                      <strong>{caseDetail.onchainSettlement?.status ?? courtCase.onchainSettlement?.status ?? 'Pending'}</strong>
                    </article>
                  </section>

                  {verdictArtifact?.claims?.length ? (
                    <section className="verdict-section">
                      <div className="verdict-section-heading">
                        <p className="eyebrow">Findings</p>
                        <h3>Claims accepted by the court</h3>
                      </div>
                      <div className="verdict-claim-grid">
                        {verdictArtifact.claims.map((claim, index) => (
                          <article key={claim}>
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <p>{claim}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {verdictArtifact?.risks?.length || verdictArtifact?.notes?.length ? (
                    <section className="verdict-section verdict-two-column">
                      {verdictArtifact.risks?.length ? (
                        <div>
                          <div className="verdict-section-heading">
                            <p className="eyebrow">Risks</p>
                            <h3>What could move the decision</h3>
                          </div>
                          <div className="verdict-note-list">
                            {verdictArtifact.risks.map((risk) => <p key={risk}>{risk}</p>)}
                          </div>
                        </div>
                      ) : null}
                      {verdictArtifact.notes?.length ? (
                        <div>
                          <div className="verdict-section-heading">
                            <p className="eyebrow">Notes</p>
                            <h3>Bench context</h3>
                          </div>
                          <div className="verdict-note-list">
                            {verdictArtifact.notes.map((note) => <p key={note}>{note}</p>)}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {verdictArtifact?.toolEvidence?.length ? (
                    <section className="verdict-section">
                      <div className="verdict-section-heading">
                        <p className="eyebrow">Evidence</p>
                        <h3>Sources behind the verdict</h3>
                      </div>
                      <div className="verdict-evidence-grid">
                        {verdictArtifact.toolEvidence.map((evidence, index) => (
                          <article key={`${evidence.capability ?? 'evidence'}-${index}`}>
                            <span>{evidence.capability ? formatAgentLabel(evidence.capability.replace(/_/g, '-')) : 'Evidence'}</span>
                            <strong>{evidence.provider ?? evidence.status ?? 'Court source'}</strong>
                            {evidence.observations?.length ? <p>{evidence.observations.slice(0, 2).join(' ')}</p> : null}
                            {evidence.sources?.length ? (
                              <div>
                                {evidence.sources.slice(0, 4).map((source) => source.url ? (
                                  <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title ?? formatUrlLabel(source.url)}</a>
                                ) : null)}
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {settlementArtifact ? (
                    <section className="verdict-section verdict-settlement-strip">
                      <div>
                        <p className="eyebrow">Settlement</p>
                        <h3>{settlementArtifact.summary}</h3>
                      </div>
                      <strong>{settlementArtifact.costUsd?.toFixed(2) ?? '0.00'} USDC</strong>
                    </section>
                  ) : null}
                </div>
              </section>
                ),

                receipts: (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Arc receipt</p>
                    <h2>Payments and record hash</h2>
                  </div>
                </div>
                <div className="receipt-sheet">
                  <section className="receipt-summary-grid" aria-label="Receipt summary">
                    <article>
                      <span>Escrow case</span>
                      <strong>{courtCase.onchain ? `#${courtCase.onchain.caseId}` : 'Pending'}</strong>
                    </article>
                    <article>
                      <span>Escrow funding</span>
                      <strong>{courtCase.onchain ? `${courtCase.onchain.budgetUsdc} USDC` : 'Pending'}</strong>
                    </article>
                    <article>
                      <span>Agent payouts</span>
                      <strong>{caseDetail.onchainSettlement?.totalPayoutUsdc ? `${caseDetail.onchainSettlement.totalPayoutUsdc} USDC` : 'Pending'}</strong>
                    </article>
                    <article>
                      <span>Settlement</span>
                      <strong>{caseDetail.onchainSettlement?.status ?? courtCase.onchainSettlement?.status ?? 'Pending'}</strong>
                    </article>
                  </section>

                  <section className="receipt-record-strip">
                    <div>
                      <p className="eyebrow">Record hash</p>
                      <h3>{shortReceiptHash(caseDetail.recordHash ?? courtCase.receipt)}</h3>
                    </div>
                    <div>
                      <span>Funding tx</span>
                      <strong>{shortReceiptHash(courtCase.onchain?.txHash)}</strong>
                    </div>
                    <div>
                      <span>Settlement artifact</span>
                      <strong>{settlementArtifact ? `${settlementArtifact.costUsd?.toFixed(2) ?? '0.00'} USDC` : 'Pending'}</strong>
                    </div>
                    {getArcExplorerTxUrl(courtCase.onchain?.txHash) ? (
                      <a className="secondary-button compact-back" href={getArcExplorerTxUrl(courtCase.onchain?.txHash) ?? undefined} target="_blank" rel="noreferrer">
                        View funding tx
                      </a>
                    ) : null}
                    <Link className="secondary-button compact-back" href={`/proof/${encodeURIComponent(courtCase.id)}`}>
                      Proof page
                    </Link>
                  </section>

                  {onchainReceipts.length ? (
                    <section className="receipt-section">
                      <div className="receipt-section-heading">
                        <p className="eyebrow">Receipt ledger</p>
                        <h3>{onchainReceipts.length} settlement record{onchainReceipts.length === 1 ? '' : 's'}</h3>
                      </div>
                      <div className="receipt-ledger-list">
                        {onchainReceipts.map((receipt, index) => (
                          <a className="case-receipt-row" href={getArcExplorerTxUrl(receipt.txHash) ?? undefined} key={`${receipt.type}-${receipt.txHash}-${receipt.agentId ?? 'case'}-${receipt.amountUsdc ?? 'record'}-${index}`} target="_blank" rel="noreferrer">
                            <div className="receipt-index">{String(index + 1).padStart(2, '0')}</div>
                            <div>
                              <span>{formatReceiptType(receipt.type)}</span>
                              <h3>{receipt.agentId ? formatAgentLabel(receipt.agentId) : 'Case escrow'}</h3>
                              <p>{receipt.txHash.slice(0, 10)}...{receipt.txHash.slice(-6)}</p>
                            </div>
                            <strong>{receipt.amountUsdc ? `${receipt.amountUsdc} USDC` : 'Record'}</strong>
                            <span className="state-dot voting">Arc</span>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <div className="empty-state">
                      <strong>No receipts yet</strong>
                      <p>Settlement records will appear here when this case records payment or verdict activity.</p>
                    </div>
                  )}
                </div>
              </section>
                ),

                history: (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Case history</p>
                    <h2>Activity timeline</h2>
                  </div>
                </div>
                <div className="case-history-sheet">
                  <section className="history-summary-grid" aria-label="Case history summary">
                    <article>
                      <span>Filed</span>
                      <strong>{formatHistoryDate(courtCase.createdAt)}</strong>
                    </article>
                    <article>
                      <span>Last update</span>
                      <strong>{formatHistoryDate(courtCase.updated)}</strong>
                    </article>
                    <article>
                      <span>Transcript turns</span>
                      <strong>{caseDetail.transcript.length}</strong>
                    </article>
                    <article>
                      <span>Receipts</span>
                      <strong>{onchainReceipts.length}</strong>
                    </article>
                  </section>

                  <section className="case-history-timeline">
                    {buildCaseHistoryEvents(courtCase, caseDetail, onchainReceipts).map((event, index) => (
                      <article className="case-history-event" key={`${event.title}-${event.time ?? index}`}>
                        <div className="history-marker">{String(index + 1).padStart(2, '0')}</div>
                        <div>
                          <span>{event.kind}</span>
                          <h3>{event.title}</h3>
                          <p>{event.detail}</p>
                        </div>
                        <time dateTime={event.time}>{formatHistoryDate(event.time)}</time>
                      </article>
                    ))}
                  </section>
                </div>
              </section>
                ),
              }}
            />
          </section>

          <aside className="case-detail-right" aria-label="Court bench">
            <section className="panel sidebar-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Case facts</p>
                  <h2>Record status</h2>
                </div>
              </div>
              <div className="sidebar-facts">
                {caseFacts.map(([label, value]) => (
                  <article className="compact-card fact-card" key={label}>
                    <span className="fact-card-icon" aria-hidden="true">{getFactIcon(label)}</span>
                    <div>
                      <h3>{label}</h3>
                      <p>{value}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel hearing-side-stack">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Court bench</p>
                  <h2>Agents seated</h2>
                </div>
              </div>
              <div className="bench-agent-list">
                {seatedAgents.length ? seatedAgents.map((agent) => (
                  <article className={`bench-agent-row${agent.roleColorClass ? ` ${agent.roleColorClass}` : ''}`} key={agent.id}>
                    <span className="bench-agent-avatar" aria-hidden="true">
                      {agent.avatarUrl ? <img alt="" src={agent.avatarUrl} /> : agent.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="bench-agent-copy">
                      <h3 className="agent-role-name">{agent.name}</h3>
                      <p>{formatAgentLabel(agent.seat)} · {agent.turns} turn{agent.turns === 1 ? '' : 's'}</p>
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
    </>
  )
}

function CaseRecordSkeleton() {
  return (
    <>
      <section className="panel case-detail-hero skeleton-detail-hero">
        <div className="case-hero-media">
          <span className="skeleton skeleton-fill" />
        </div>
        <div className="case-hero-copy">
          <div className="case-hero-kicker">
            <span className="skeleton skeleton-pill" />
            <span className="skeleton skeleton-icon small" />
            <span className="skeleton skeleton-line short" />
          </div>
          <span className="skeleton skeleton-line hero-title" />
          <span className="skeleton skeleton-line title" />
          <span className="skeleton skeleton-line" />
          <div className="case-hero-stats" aria-label="Case stats loading">
            {Array.from({ length: 4 }).map((_, index) => (
              <article key={index}>
                <span className="skeleton skeleton-icon small" />
                <span className="skeleton skeleton-line tiny" />
                <strong className="skeleton skeleton-line short" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="case-detail-shell">
        <section className="case-detail-main">
          <div className="case-tab-shell">
            <nav className="case-record-tabs top-record-tabs" aria-label="Case sections loading">
              {tabs.map(([tab, label], index) => (
                <button aria-current={index === 0 ? 'page' : undefined} className={index === 0 ? 'active' : undefined} disabled key={tab} type="button">
                  {label}
                </button>
              ))}
            </nav>
            <div className="case-tab-panels">
              <div>
                <section className="panel hearing-transcript-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Court transcript</p>
                      <h2>Hearing record</h2>
                    </div>
                  </div>
                  <div className="court-transcript">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <article className="transcript-entry skeleton-transcript-entry" key={index}>
                        <span className="transcript-avatar skeleton skeleton-icon" />
                        <div className="transcript-message">
                          <div className="transcript-meta">
                            <div>
                              <strong className="skeleton skeleton-line short" />
                              <span className="skeleton skeleton-line tiny" />
                            </div>
                          </div>
                          <p className="skeleton skeleton-line title" />
                          <p className="skeleton skeleton-line" />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
        <aside className="case-detail-side">
          <section className="panel case-facts-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Case facts</p>
                <h2>Record status</h2>
              </div>
            </div>
            <div className="fact-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <span className="skeleton skeleton-line tiny" />
                  <strong className="skeleton skeleton-line short" />
                </div>
              ))}
            </div>
          </section>
          <section className="panel hearing-side-stack">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Court bench</p>
                <h2>Agents seated</h2>
              </div>
            </div>
            <div className="bench-agent-list">
              {Array.from({ length: 5 }).map((_, index) => (
                <article className="bench-agent-row" key={index}>
                  <span className="bench-agent-avatar skeleton skeleton-icon" />
                  <div className="bench-agent-copy">
                    <h3 className="skeleton skeleton-line short" />
                    <p className="skeleton skeleton-line" />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </>
  )
}

function getFactIcon(label: string) {
  if (label === 'Status') return <Gauge size={15} />
  if (label === 'Confidence') return <Scales size={15} />
  if (label === 'Horizon') return <Clock size={15} />
  return <Storefront size={15} />
}
