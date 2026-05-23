import { Briefcase, Gavel, Gauge, Scroll, ShieldCheck, Stamp, Timer, UserCircleCheck } from '@phosphor-icons/react/ssr'
import { Suspense } from 'react'
import Link from 'next/link'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { CaseAddFundingButton } from '../../components/CaseAddFundingButton'
import { CaseAutoRefresh } from '../../components/CaseAutoRefresh'
import { CaseDetailTabs } from '../../components/CaseDetailTabs'
import { CaseFollowButton } from '../../components/CaseFollowButton'
import { getMarketProvider, MarketLogo } from '../../components/MarketLogo'
import { MarketPreviewImage } from '../../components/MarketPreviewImage'
import { PrivateCaseUnlockPanel } from '../../components/PrivateCaseUnlockPanel'
import { SourceEmbedCard } from '../../components/SourceEmbedCard'
import { TranscriptLiveMotion } from '../../components/TranscriptLiveMotion'
import { formatConfidence, getBackendCaseDetail, type ApiCaseDetail, type ApiCourtArtifact, type ApiTranscriptTurn } from '../../../lib/backend-data'
import { getAgentAvatarUrl } from '../../../lib/agent-images'
import '../../page.css'

const tabs = [
  ['transcript', 'Transcript'],
  ['verdict', 'Verdict'],
  ['receipts', 'Receipts'],
  ['history', 'History'],
] as const

type CaseTab = (typeof tabs)[number][0]
type TranscriptSourceCard = {
  url: string
  title: string
  kind: string
  detail?: string
}

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
            <Gavel size={16} />
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
  const artifactById = new Map(caseDetail.artifacts.map((artifact) => [artifact.id, artifact]))
  const relatedLinks = getRelatedLinks(courtCase.links, courtCase.resolution, caseDetail.artifacts)
  const predictionMarketLink = [...courtCase.links ?? [], ...relatedLinks.map((link) => link.url)].find(isSupportedPredictionMarketLink)
  const confidence = formatConfidence(courtCase.confidence)
  const marketLabel = getMarketProvider({ url: predictionMarketLink, market: courtCase.market })?.label ?? formatMarketType(courtCase.market)
  const verdictDisplay = getVerdictDisplay({
    confidence,
    fallback: courtCase.verdict,
    summary: verdictArtifact?.summary,
    transcriptMessage: verdictArtifact?.transcriptMessage,
  })
  const caseFacts = [
    ['Status', courtCase.status, ShieldCheck],
    ['Confidence', confidence, Gauge],
    ['Horizon', courtCase.horizon ?? 'Open', Timer],
    ['Market', marketLabel, Briefcase],
  ] as const

  return (
    <>
      <CaseAutoRefresh active={Boolean(caseDetail.partial || courtCase.status === 'Hearing' || courtCase.status === 'Queued')} />
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
              {caseFacts.map(([label, value, Icon]) => (
                <article key={label}>
                  <Icon size={16} />
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
                  <Scroll size={19} />
                </div>
                <TranscriptLiveMotion caseId={courtCase.id} />
                <div className="court-transcript" data-live-transcript>
                  {caseDetail.transcript.length ? caseDetail.transcript.map((turn) => {
                    const replyTurn = turn.replyToId ? caseDetail.transcript.find((item) => item.id === turn.replyToId) : undefined
                    const artifact = turn.artifactId ? artifactById.get(turn.artifactId) : undefined
                    const sourceCards = getTurnSourceCards(turn, artifact)
                    const hasContext = Boolean(replyTurn)
                    const avatarUrl = getAgentAvatarUrl(turn.agentId, turn.agentName)

                    return (
                      <article className={`transcript-entry role-${formatTurnRole(turn.seat)}${hasContext ? ' has-reply' : ''}`} id={turn.id} key={turn.id}>
                        {replyTurn ? (
                          <div className="transcript-contexts">
                            <a className="transcript-reply" href={`#${replyTurn.id}`} aria-label={`Jump to ${replyTurn.agentName}`}>
                              <strong>{replyTurn.agentName}</strong>
                              <span>{summarizeTurn(replyTurn)}</span>
                            </a>
                          </div>
                        ) : null}
                        <div className="transcript-avatar">
                          {avatarUrl ? <img alt="" src={avatarUrl} /> : turn.agentName.slice(0, 1)}
                        </div>
                        <div className="transcript-message">
                          <div className="transcript-meta">
                            <div>
                              <strong>{turn.agentName}</strong>
                              <span>{turn.stage}</span>
                              {typeof turn.confidence === 'number' && <span>{formatConfidence(turn.confidence)}</span>}
                              {turn.createdAt ? <time dateTime={turn.createdAt}>{formatTurnTime(turn.createdAt)}</time> : null}
                            </div>
                          </div>
                          <p>{renderTextWithLinks(turn.message)}</p>
                          {sourceCards.length ? (
                            <div className="transcript-source-grid" aria-label="Referenced sources">
                              {sourceCards.map((source) => (
                                <SourceEmbedCard detail={source.detail} kind={source.kind} key={`${turn.id}-${source.url}`} title={source.title} url={source.url} />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    )
                  }) : (
                    <div className="empty-state">
                      <strong>No transcript turns yet</strong>
                      <p>Run the hearing to add live court turns to this case.</p>
                    </div>
                  )}
                </div>
              </section>
                ),

                verdict: (
              <section className="panel case-tab-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Archon decree</p>
                    <h2>Verdict</h2>
                  </div>
                  <ShieldCheck size={19} />
                </div>
                <div className="verdict-sheet">
                  <section className="verdict-sheet-hero">
                    <div className="verdict-mark">
                      <ShieldCheck size={28} />
                    </div>
                    <div>
                      <p className="eyebrow">Court outcome</p>
                      <h2>{verdictDisplay.title}</h2>
                      <p>{verdictDisplay.body}</p>
                    </div>
                  </section>

                  <section className="verdict-stat-grid" aria-label="Verdict stats">
                    <article>
                      <Gauge size={17} />
                      <span>Probability</span>
                      <strong>{courtCase.probability ?? confidence}</strong>
                    </article>
                    <article>
                      <ShieldCheck size={17} />
                      <span>Confidence</span>
                      <strong>{verdictArtifact?.confidence ? formatConfidence(verdictArtifact.confidence) : confidence}</strong>
                    </article>
                    <article>
                      <Stamp size={17} />
                      <span>Record hash</span>
                      <strong>{shortReceiptHash(caseDetail.recordHash ?? courtCase.receipt)}</strong>
                    </article>
                    <article>
                      <Briefcase size={17} />
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
                  <Stamp size={19} />
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
                    {courtCase.onchain?.txHash ? (
                      <a className="secondary-button compact-back" href={`https://explorer.testnet.arc.network/tx/${courtCase.onchain.txHash}`} target="_blank" rel="noreferrer">
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
                          <a className="case-receipt-row" href={`https://explorer.testnet.arc.network/tx/${receipt.txHash}`} key={`${receipt.type}-${receipt.txHash}-${receipt.agentId ?? 'case'}-${receipt.amountUsdc ?? 'record'}-${index}`} target="_blank" rel="noreferrer">
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
                  <Timer size={19} />
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

            <section className="panel hearing-side-stack">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Court bench</p>
                  <h2>Agents seated</h2>
                </div>
                <UserCircleCheck size={19} />
              </div>
              <div className="bench-agent-list">
                {seatedAgents.length ? seatedAgents.map((agent) => (
                  <article className="bench-agent-row" key={agent.id}>
                    <span className="bench-agent-avatar" aria-hidden="true">
                      {agent.avatarUrl ? <img alt="" src={agent.avatarUrl} /> : agent.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="bench-agent-copy">
                      <h3>{agent.name}</h3>
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
                    <Scroll size={19} />
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
              <UserCircleCheck size={19} />
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

function formatTurnRole(seat: string) {
  if (seat.includes('counsel') && seat.includes('bull')) return 'counsel-bull'
  if (seat.includes('counsel') && seat.includes('bear')) return 'counsel-bear'
  if (seat.includes('witness')) return 'witness'
  if (seat.includes('judge') || seat.includes('magistrate')) return 'bench'
  if (seat.includes('clerk')) return 'clerk'
  if (seat.includes('juror')) return 'jury'
  if (seat.includes('risk')) return 'risk'
  return 'witness'
}

function summarizeTurn(turn: ApiTranscriptTurn) {
  return turn.message.length > 120 ? `${turn.message.slice(0, 117)}...` : turn.message
}

function renderTextWithLinks(text: string) {
  const markdownParts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g)

  return markdownParts.flatMap((part, index) => {
    const markdown = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i.exec(part)
    if (markdown) {
      return (
        <a href={markdown[2]} key={`${markdown[2]}-${index}`} target="_blank" rel="noreferrer">
          {markdown[1]}
        </a>
      )
    }

    const parts = part.split(/(https?:\/\/[^\s)]+)/g)
    return parts.map((piece, pieceIndex) => renderUrlPiece(piece, `${index}-${pieceIndex}`))
  })
}

function renderUrlPiece(part: string, key: string) {
  if (!/^https?:\/\//i.test(part)) return part

  const cleanUrl = part.replace(/[.,;:!?]+$/, '')
  const trailing = part.slice(cleanUrl.length)

  return (
    <span key={`${cleanUrl}-${key}`}>
      <a href={cleanUrl} target="_blank" rel="noreferrer">{formatUrlLabel(cleanUrl)}</a>
      {trailing}
    </span>
  )
}

function getTurnSourceCards(turn: ApiTranscriptTurn, artifact?: ApiCourtArtifact) {
  const turnText = `${turn.message} ${turn.request ?? ''}`
  const directUrls: TranscriptSourceCard[] = extractUrls(turnText).map((url) => ({
    url,
    title: formatUrlLabel(url),
    kind: 'Referenced link',
    detail: domainFromUrl(url),
  }))

  const evidenceSources: TranscriptSourceCard[] = artifact?.toolEvidence
    ?.flatMap((evidence) => evidence.sources?.flatMap((source) => {
      if (!source.url) return []
      if (!shouldShowEvidenceSourceForTurn(source.url, source.title, evidence.capability, turnText)) return []

      return [{
        url: source.url,
        title: source.title ?? formatUrlLabel(source.url),
        kind: evidence.capability ? formatAgentLabel(evidence.capability.replace(/_/g, '-')) : 'Source',
        detail: source.value ?? evidence.provider,
      }]
    }) ?? [])
    ?? []

  const seen = new Set<string>()
  return [...directUrls, ...evidenceSources]
    .filter((source) => {
      const key = source.url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function getRelatedLinks(caseLinks: string[] | undefined, context: string | undefined, artifacts: ApiCourtArtifact[]) {
  const submittedLinks: TranscriptSourceCard[] = (caseLinks ?? []).map((url) => ({
    url,
    title: formatUrlLabel(url),
    kind: isSupportedPredictionMarketLink(url) ? 'Market' : 'Case link',
    detail: domainFromUrl(url),
  }))
  const contextLinks: TranscriptSourceCard[] = extractUrls(context ?? '').map((url) => ({
    url,
    title: formatUrlLabel(url),
    kind: isSupportedPredictionMarketLink(url) ? 'Market' : 'Case link',
    detail: domainFromUrl(url),
  }))

  const sourceLinks: TranscriptSourceCard[] = artifacts
    .flatMap((artifact) => artifact.toolEvidence ?? [])
    .flatMap((evidence) => evidence.sources?.flatMap((source) => {
      if (!source.url) return []
      return [{
        url: source.url,
        title: source.title ?? formatUrlLabel(source.url),
        kind: evidence.capability ? formatAgentLabel(evidence.capability.replace(/_/g, '-')) : 'Source',
        detail: source.value,
      }]
    }) ?? [])

  const seen = new Set<string>()
  return [...submittedLinks, ...contextLinks, ...sourceLinks]
    .filter((source) => {
      const key = normalizeUrlForCompare(source.url)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

function isSupportedPredictionMarketLink(link: string) {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '').toLowerCase()
    return ['polymarket.com', 'kalshi.com', 'manifold.markets'].some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

function shouldShowEvidenceSourceForTurn(url: string, title: string | undefined, capability: string | undefined, turnText: string) {
  const directUrls = extractUrls(turnText).map((value) => normalizeUrlForCompare(value))
  if (directUrls.includes(normalizeUrlForCompare(url))) return true

  if (capability && /^(web_page_scrape|visual_page_analysis|screenshot|image_read|social_activity_data)$/i.test(capability)) {
    return true
  }

  const normalizedText = turnText.toLowerCase()
  const host = domainFromUrl(url)?.toLowerCase()
  if (host && normalizedText.includes(host.replace(/^www\./, ''))) return true

  const titleWords = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 5)

  return titleWords.length >= 2 && titleWords.slice(0, 5).filter((word) => normalizedText.includes(word)).length >= 2
}

function extractUrls(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi))
    .map((match) => match[0].replace(/[.,;:!?]+$/, ''))
}

function normalizeUrlForCompare(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return value.replace(/\/$/, '').toLowerCase()
  }
}

function formatUrlLabel(value: string) {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 82)
  } catch {
    return value
  }
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function formatAgentLabel(agentId?: string) {
  if (!agentId) return 'court'

  return agentId
    .replace(/-(?:witness|counsel|judge|clerk|bailiff|juror)$/i, '')
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatTurnTime(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatReceiptType(type: string) {
  if (type === 'case-added-funding') return 'Added Case Funding'

  return type
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function buildCaseHistoryEvents(
  courtCase: NonNullable<ApiCaseDetail['case']>,
  caseDetail: ApiCaseDetail,
  receipts: NonNullable<ApiCaseDetail['onchainSettlement']>['receipts'],
) {
  const events: Array<{ kind: string; title: string; detail: string; time?: string }> = []

  events.push({
    kind: 'Filing',
    title: 'Case filed',
    detail: `${courtCase.market ?? 'Prediction market'} question opened for review.`,
    time: courtCase.createdAt,
  })

  if (courtCase.onchain) {
    events.push({
      kind: 'Funding',
      title: `${courtCase.onchain.budgetUsdc} USDC escrowed`,
      detail: `Escrow case #${courtCase.onchain.caseId} opened on Arc.`,
      time: courtCase.createdAt,
    })
  }

  for (const turn of caseDetail.transcript.slice(0, 10)) {
    events.push({
      kind: formatAgentLabel(turn.seat),
      title: `${turn.agentName}: ${turn.stage}`,
      detail: summarizeTurn(turn),
      time: turn.createdAt,
    })
  }

  for (const artifact of caseDetail.artifacts.slice(0, 5)) {
    events.push({
      kind: formatReceiptType(artifact.type),
      title: artifact.summary,
      detail: artifact.claims?.slice(0, 2).join(' ') || artifact.transcriptMessage || 'Artifact recorded for the case.',
      time: artifact.createdAt,
    })
  }

  for (const receipt of receipts ?? []) {
    events.push({
      kind: formatReceiptType(receipt.type),
      title: receipt.agentId ? `${formatAgentLabel(receipt.agentId)} receipt` : 'Settlement receipt',
      detail: `${receipt.amountUsdc ? `${receipt.amountUsdc} USDC · ` : ''}${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-6)}`,
      time: caseDetail.case.updated,
    })
  }

  return events
    .sort((left, right) => Date.parse(left.time ?? '') - Date.parse(right.time ?? ''))
    .slice(0, 24)
}

function formatHistoryDate(value?: string) {
  if (!value) return 'Pending'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function getVerdictDisplay({
  confidence,
  fallback,
  summary,
  transcriptMessage,
}: {
  confidence: string
  fallback?: string
  summary?: string
  transcriptMessage?: string
}) {
  const rawSummary = summary || fallback || 'Hearing pending'
  const title = formatVerdictTitle(rawSummary)
  const defaultBody = rawSummary !== title ? rawSummary : `Confidence: ${confidence}. Verdict-only intelligence; no trade is executed.`
  const body = stripRepeatedVerdictLead(transcriptMessage, rawSummary) || defaultBody

  return { title, body }
}

function formatVerdictTitle(value: string) {
  const normalized = value.replace(/^verdict:\s*/i, '').trim()
  const lower = normalized.toLowerCase()

  if (lower.includes('leaning yes')) return 'Leaning Yes'
  if (lower.includes('leaning no')) return 'Leaning No'
  if (lower.includes('unresolved')) return 'Unresolved'
  if (lower.includes('hearing open')) return 'Hearing Open'
  if (lower.includes('settled yes')) return 'Settled Yes'
  if (lower.includes('settled no')) return 'Settled No'

  const firstClause = normalized.split(/[.,;:]/)[0]?.trim()
  if (firstClause && firstClause.length <= 42) return titleCaseVerdict(firstClause)
  if (normalized.length <= 58) return normalized
  return `${normalized.slice(0, 55).trim()}...`
}

function stripRepeatedVerdictLead(message: string | undefined, summary: string) {
  if (!message) return undefined

  const trimmedMessage = message.trim()
  const trimmedSummary = summary.trim()
  if (!trimmedMessage) return undefined
  if (trimmedMessage === trimmedSummary) return undefined
  if (!trimmedMessage.toLowerCase().startsWith(trimmedSummary.toLowerCase())) return trimmedMessage

  const withoutSummary = trimmedMessage.slice(trimmedSummary.length).replace(/^[\s.:;-]+/, '').trim()
  return withoutSummary || undefined
}

function titleCaseVerdict(value: string) {
  return value
    .split(/\s+/)
    .map((word) => word.length <= 3 ? word.toUpperCase() : `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function formatFilingKind(kind?: string) {
  if (kind === 'fresh-hearing') return 'Fresh hearing'
  if (kind === 'private-fork') return 'Private fork'
  return 'Case'
}

function formatMarketType(value?: string) {
  if (!value || value === 'prediction-market') return 'Prediction market'
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function shortCaseId(id: string) {
  if (id.startsWith('0x') && id.length > 18) return `${id.slice(0, 8)}...${id.slice(-6)}`
  if (id.length > 18) return `${id.slice(0, 12)}...`
  return id
}

function shortReceiptHash(value?: string) {
  if (!value) return 'Pending'
  if (value.length > 18) return `${value.slice(0, 10)}...${value.slice(-6)}`
  return value
}

function summarizeSeatedAgents(transcript: ApiTranscriptTurn[]) {
  const byAgent = new Map<string, { id: string; name: string; seat: string; turns: number; avatarUrl?: string }>()

  for (const turn of transcript) {
    const current = byAgent.get(turn.agentId)
    if (current) {
      current.turns += 1
    } else {
      byAgent.set(turn.agentId, {
        id: turn.agentId,
        name: turn.agentName,
        seat: turn.seat,
        turns: 1,
        avatarUrl: getAgentAvatarUrl(turn.agentId, turn.agentName),
      })
    }
  }

  return [...byAgent.values()].sort((left, right) => right.turns - left.turns)
}
