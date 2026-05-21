import { ArrowLeft, Briefcase, ShieldCheck, Sparkle, Timer, TrendUp, UserCircleCheck } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { CaseAutoRefresh } from '../../components/CaseAutoRefresh'
import { SourceEmbedCard } from '../../components/SourceEmbedCard'
import { formatConfidence, getBackendCaseDetail, type ApiCourtArtifact, type ApiTranscriptTurn } from '../../../lib/backend-data'
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
  const query = await searchParams
  const caseDetail = await getBackendCaseDetail(id)
  const courtCase = caseDetail?.case
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
  const verdictArtifact = caseDetail.artifacts.findLast((artifact) => artifact.type === 'verdict' && artifact.agentId === 'head-judge')
  const settlementArtifact = caseDetail.artifacts.findLast((artifact) => artifact.agentId === 'settlement-clerk')
  const onchainReceipts = caseDetail.onchainSettlement?.receipts ?? []
  const artifactById = new Map(caseDetail.artifacts.map((artifact) => [artifact.id, artifact]))
  const relatedLinks = getRelatedLinks(courtCase.resolution, caseDetail.artifacts)

  return (
    <main className="app-shell">
      <CaseAutoRefresh active={Boolean(caseDetail.partial || courtCase.status === 'Hearing' || courtCase.status === 'Queued')} />
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
            {relatedLinks.length ? (
              <section className="panel sidebar-card related-links-card">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Related links</p>
                    <h2>Sources</h2>
                  </div>
                </div>
                <div className="related-link-list">
                  {relatedLinks.map((link) => (
                    <a href={link.url} key={link.url} target="_blank" rel="noreferrer">
                      <span>{link.kind}</span>
                      <strong>{link.title}</strong>
                      <em>{domainFromUrl(link.url)}</em>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
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
                  {courtCase.onchain ? (
                    <div className="onchain-facts case-onchain-facts">
                      <span>Escrow case #{courtCase.onchain.caseId}</span>
                      <span>{courtCase.onchain.budgetUsdc} USDC funded</span>
                      <span>Chain {courtCase.onchain.chainId}</span>
                    </div>
                  ) : null}
                </div>
                <div className="court-transcript">
                  {caseDetail.transcript.length ? caseDetail.transcript.map((turn) => {
                    const replyTurn = turn.replyToId ? caseDetail.transcript.find((item) => item.id === turn.replyToId) : undefined
                    const artifact = turn.artifactId ? artifactById.get(turn.artifactId) : undefined
                    const sourceCards = getTurnSourceCards(turn, artifact)
                    const hasContext = Boolean(replyTurn)

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
                        <div className="transcript-avatar">{turn.agentName.slice(0, 1)}</div>
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
                      <p>Run the hearing to write live court turns into the backend record.</p>
                    </div>
                  )}
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
                    <h2>{verdictArtifact?.summary ?? courtCase.verdict ?? 'Hearing pending'}</h2>
                    <p>{verdictArtifact?.transcriptMessage ?? `Confidence: ${confidence}. Verdict-only intelligence; no trade is executed.`}</p>
                  </div>
                  <ul>
                    <li><TrendUp size={16} /> {courtCase.probability ?? confidence} probability</li>
                    <li><Sparkle size={16} /> {caseDetail.recordHash ?? courtCase.receipt ?? 'Receipt pending'}</li>
                  </ul>
                </div>
                {verdictArtifact?.claims?.length ? (
                  <div className="compact-list">
                    {verdictArtifact.claims.map((claim) => (
                      <article className="roster-row" key={claim}>
                        <div>
                          <h3>{claim}</h3>
                          <p>Verdict claim from backend artifact</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
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
                  <div><span>Escrow case</span><strong>{courtCase.onchain ? `#${courtCase.onchain.caseId}` : 'Pending'}</strong></div>
                  <div><span>Escrow funding</span><strong>{courtCase.onchain ? `${courtCase.onchain.budgetUsdc} USDC` : 'Pending'}</strong></div>
                  <div><span>Funding tx</span><strong>{courtCase.onchain?.txHash ? `${courtCase.onchain.txHash.slice(0, 10)}...${courtCase.onchain.txHash.slice(-6)}` : 'Pending'}</strong></div>
                  <div><span>Onchain settlement</span><strong>{caseDetail.onchainSettlement?.status ?? courtCase.onchainSettlement?.status ?? 'Pending'}</strong></div>
                  <div><span>Agent payouts</span><strong>{caseDetail.onchainSettlement?.totalPayoutUsdc ? `${caseDetail.onchainSettlement.totalPayoutUsdc} USDC` : 'Pending'}</strong></div>
                  <div><span>Record hash</span><strong>{caseDetail.recordHash ?? courtCase.receipt ?? 'Pending'}</strong></div>
                  <div><span>Settlement artifact</span><strong>{settlementArtifact ? `${settlementArtifact.costUsd?.toFixed(2) ?? '0.00'} USDC` : 'Pending'}</strong></div>
                  <div><span>Source</span><strong>Backend hearing job</strong></div>
                </div>
                {onchainReceipts.length ? (
                  <div className="compact-list">
                    {onchainReceipts.map((receipt) => (
                      <article className="roster-row" key={`${receipt.type}-${receipt.txHash}`}>
                        <div>
                          <h3>{formatReceiptType(receipt.type)}</h3>
                          <p>{receipt.agentId ? `${receipt.agentId} · ` : ''}{receipt.amountUsdc ? `${receipt.amountUsdc} USDC · ` : ''}{receipt.txHash.slice(0, 10)}...{receipt.txHash.slice(-6)}</p>
                        </div>
                        <div className="roster-meta">
                          <span className="state-dot voting">Arc</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
                {courtCase.onchain?.txHash ? (
                  <a className="secondary-button compact-back" href={`https://explorer.testnet.arc.network/tx/${courtCase.onchain.txHash}`} target="_blank" rel="noreferrer">
                    View funding tx
                  </a>
                ) : null}
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
    .slice(0, 3)
}

function getRelatedLinks(context: string | undefined, artifacts: ApiCourtArtifact[]) {
  const contextLinks: TranscriptSourceCard[] = extractUrls(context ?? '').map((url) => ({
    url,
    title: formatUrlLabel(url),
    kind: 'Case link',
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
  return [...contextLinks, ...sourceLinks]
    .filter((source) => {
      const key = normalizeUrlForCompare(source.url)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
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
  return type
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}
