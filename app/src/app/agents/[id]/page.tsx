import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AppFooter } from '../../components/layout/AppFooter'
import { AppHeader } from '../../components/layout/AppHeader'
import { getPredictionMarketLink, MarketLogo } from '../../components/markets/MarketLogo'
import { getBackendAgents, getBackendCaseDetail, getBackendCases, getBackendLedgerRows } from '../../../lib/backend-data'
import '../../page.css'

const seatLabels: Record<string, string> = {
  'court-clerk': 'Court Clerk',
  'evidence-clerk': 'Evidence Clerk',
  'bull-counsel': 'Bull Counsel',
  'bear-counsel': 'Bear Counsel',
  juror: 'Juror',
  'expert-witness': 'Expert Witness',
  'risk-bailiff': 'Risk Bailiff',
  'head-judge': 'Presiding Magistrate',
  'settlement-clerk': 'Settlement Clerk',
  'outcome-reviewer': 'Outcome Reviewer',
}

export default function AgentProfilePage(props: { params: Promise<{ id: string }> }) {
  return (
    <main className="app-shell">
      <AppHeader active="agents" />
      <section className="workspace">
        <Suspense fallback={<AgentProfileSkeleton />}>
          <AgentProfileData {...props} />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

async function AgentProfileData({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [agents, ledgerRows, cases] = await Promise.all([
    getBackendAgents(),
    getBackendLedgerRows(),
    getBackendCases(),
  ])
  const agent = agents.find((item) => item.id === id)
  if (!agent) notFound()

  const payoutRows = ledgerRows.filter((row) => row.receiptType === 'agent-payout' && row.agentId === agent.id)
  const payoutTotal = payoutRows.reduce((total, row) => total + parseAmount(row.amount), 0)
  const testifiedCases = cases.filter((item) => item.witnesses?.includes(agent.id) || payoutRows.some((row) => row.caseId === item.id))
  const caseDetails = await Promise.all(testedCaseIds(testedCaseIdsFromRows(testedCaseIdsFromCases(testifiedCases), payoutRows)).map((caseId) => getBackendCaseDetail(caseId)))
  const turns = caseDetails
    .flatMap((detail) => (detail?.transcript ?? []).map((turn) => ({
      ...turn,
      profileKey: `${detail?.case.id ?? 'case'}-${turn.id}`,
    })))
    .filter((turn) => turn.agentId === agent.id)
    .slice(0, 6)
  const artifacts = caseDetails
    .flatMap((detail) => detail?.artifacts ?? [])
    .filter((artifact) => artifact.agentId === agent.id)
    .slice(0, 4)

  return (
        <section className="profile-dashboard agent-profile-dashboard">
          <section className="panel profile-identity-panel agent-profile-identity">
            <div className="profile-avatar agent-profile-avatar" aria-hidden="true">
              {agent.avatarUrl ? <img alt="" src={agent.avatarUrl} /> : agent.name.slice(0, 1)}
            </div>
            <div className="profile-identity-copy agent-profile-copy">
              <p className="eyebrow">Court agent</p>
              <h2>{agent.name}</h2>
              <p>{agent.description}</p>
              <div className="profile-address-row agent-profile-tags">
                <span>{seatLabels[agent.seat] ?? agent.seat}</span>
                <span>{formatTitleCase(agent.runMode)}</span>
              </div>
            </div>
            <Link className="secondary-button compact-back profile-edit-trigger" href="/agents">Registry</Link>
          </section>

          <section className="app-summary-grid profile-stat-grid agent-profile-stats" aria-label={`${agent.name} summary`}>
            <AgentStat label="Fee quote" value={`${formatAmount(agent.priceUsd)} USDC`} />
            <AgentStat label="Payouts" value={payoutTotal ? `${formatAmount(payoutTotal)} USDC` : `${payoutRows.length} rows`} />
            <AgentStat label="Cases" value={`${testifiedCases.length}`} />
            <AgentStat label="Version" value={agent.version} />
          </section>

          <section className="profile-main-grid">
            <section className="profile-record-stack">
              <div className="profile-history-strip">
                <span>{formatTitleCase(agent.mode)}</span>
                <span>{agent.toolCapabilities.length} capabilities</span>
                <span>{payoutRows.length} receipt rows</span>
              </div>

              <article className="panel app-section-panel profile-record-section agent-profile-panel">
                <div className="profile-panel-heading app-section-heading profile-section-heading">
                  <div>
                    <h3>Operating profile</h3>
                    <p>Mode and payment routing for this agent.</p>
                  </div>
                  <strong>{agent.mode}</strong>
                </div>
                <div className="agent-capability-list">
                  {agent.toolCapabilities.map((capability) => (
                    <span key={capability}>{formatTitleCase(capability)}</span>
                  ))}
                </div>
                <dl className="agent-profile-facts">
                  <div>
                    <dt>Owner</dt>
                    <dd>{agent.onchain?.ownerKind ? formatTitleCase(agent.onchain.ownerKind) : 'Pending'}</dd>
                  </div>
                  <div>
                    <dt>Owner wallet</dt>
                    <dd>{agent.onchain?.ownerWallet ? shortAddress(agent.onchain.ownerWallet) : 'Not assigned'}</dd>
                  </div>
                  <div>
                    <dt>Payout wallet</dt>
                    <dd>{agent.onchain?.payoutWallet ? shortAddress(agent.onchain.payoutWallet) : 'Not assigned'}</dd>
                  </div>
                  <div>
                    <dt>Metadata</dt>
                    <dd>{agent.onchain?.metadataURI ?? 'Pending'}</dd>
                  </div>
                </dl>
              </article>

              <article className="panel app-section-panel profile-record-section agent-profile-panel">
                <div className="profile-panel-heading app-section-heading profile-section-heading">
                  <div>
                    <h3>Recent cases</h3>
                    <p>Hearings where this agent has been seated or paid.</p>
                  </div>
                  <strong>{testifiedCases.length} records</strong>
                </div>
                {testifiedCases.length ? (
                  <div className="profile-record-list agent-profile-list">
                    {testifiedCases.slice(0, 6).map((item) => (
                      <Link className="app-record-row profile-record-row agent-case-row" href={`/cases/${item.id}`} key={item.id}>
                        <span className="agent-case-thumb" aria-hidden="true">
                          {item.imageUrl ? <img alt="" src={item.imageUrl} /> : null}
                        </span>
                        <span className="agent-case-copy">
                          <strong>{item.title}</strong>
                          <small className="agent-case-market-meta">
                            <MarketLogo url={getPredictionMarketLink(item.links)} market={item.market} showLabel />
                          </small>
                        </span>
                        <time>{item.updated ? formatDate(item.updated) : 'Pending'}</time>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="agent-empty-copy">No case testimony is recorded for this agent yet.</p>
                )}
              </article>

              <article className="panel app-section-panel profile-record-section agent-profile-panel">
                <div className="profile-panel-heading app-section-heading profile-section-heading">
                  <div>
                    <h3>Recent testimony</h3>
                    <p>Latest transcript turns attributed to this agent.</p>
                  </div>
                  <strong>{turns.length} turns</strong>
                </div>
                {turns.length ? (
                  <div className="agent-testimony-list">
                    {turns.map((turn) => (
                      <div className="app-record-row profile-record-row agent-testimony-row" key={turn.profileKey}>
                        <span>
                          <strong>{turn.stage}</strong>
                          <small>{turn.message}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="agent-empty-copy">No transcript turns are recorded for this agent yet.</p>
                )}
              </article>

              <article className="panel app-section-panel profile-record-section agent-profile-panel">
                <div className="profile-panel-heading app-section-heading profile-section-heading">
                  <div>
                    <h3>Receipt history</h3>
                    <p>Payment rows and generated artifacts connected to this agent.</p>
                  </div>
                  <strong>{payoutRows.length + artifacts.length} records</strong>
                </div>
                <div className="profile-record-list agent-profile-list">
                  {payoutRows.slice(0, 6).map((row) => (
                    <Link className="app-record-row profile-record-row" href={`/cases/${row.caseId}?tab=receipts`} key={row.txHash ?? row.hash}>
                      <span>
                        <strong>{row.amount}</strong>
                        <small>{row.txHash ? shortHash(row.txHash) : row.hash}</small>
                      </span>
                      <time>{row.updated ? formatDate(row.updated) : 'Pending'}</time>
                    </Link>
                  ))}
                  {artifacts.map((artifact) => (
                    <div className="app-record-row profile-record-row" key={artifact.id}>
                      <span>
                        <strong>{formatTitleCase(artifact.type)}</strong>
                        <small>{artifact.summary}</small>
                      </span>
                    </div>
                  ))}
                  {!payoutRows.length && !artifacts.length ? <p className="agent-empty-copy">No receipts or artifacts yet.</p> : null}
                </div>
              </article>

              <article className="panel app-section-panel profile-record-section agent-profile-panel">
                <div className="profile-panel-heading app-section-heading profile-section-heading">
                  <div>
                    <h3>Registry data</h3>
                    <p>Versioning and ownership fields used by the court registry.</p>
                  </div>
                  <strong>{agent.version}</strong>
                </div>
                <div className="profile-record-list agent-profile-list">
                  <div className="app-record-row profile-record-row">
                    <span>
                      <strong>Seat</strong>
                      <small>{seatLabels[agent.seat] ?? agent.seat}</small>
                    </span>
                  </div>
                  <div className="app-record-row profile-record-row">
                    <span>
                      <strong>Run mode</strong>
                      <small>{formatTitleCase(agent.runMode)}</small>
                    </span>
                  </div>
                  <div className="app-record-row profile-record-row">
                    <span>
                      <strong>Fee quote</strong>
                      <small>{formatAmount(agent.priceUsd)} USDC</small>
                    </span>
                  </div>
                </div>
              </article>
            </section>
          </section>
        </section>
  )
}

function AgentProfileSkeleton() {
  return (
    <section className="profile-dashboard agent-profile-dashboard">
      <section className="panel profile-identity-panel agent-profile-identity">
        <span className="profile-avatar agent-profile-avatar skeleton skeleton-icon" />
        <div className="profile-identity-copy agent-profile-copy">
          <p className="eyebrow">Court agent</p>
          <span className="skeleton skeleton-line title" />
          <span className="skeleton skeleton-line" />
          <div className="profile-address-row agent-profile-tags">
            <span className="skeleton skeleton-pill" />
            <span className="skeleton skeleton-pill" />
          </div>
        </div>
        <span className="skeleton skeleton-button" />
      </section>

      <section className="app-summary-grid profile-stat-grid agent-profile-stats" aria-label="Agent summary loading">
        {Array.from({ length: 4 }).map((_, index) => (
          <article className="app-summary-card" key={index}>
            <span className="skeleton skeleton-line tiny" />
            <strong className="skeleton skeleton-line short" />
          </article>
        ))}
      </section>

      <section className="profile-main-grid">
        <section className="profile-record-stack">
          <div className="profile-history-strip">
            <span className="skeleton skeleton-pill" />
            <span className="skeleton skeleton-pill" />
            <span className="skeleton skeleton-pill" />
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="panel app-section-panel profile-record-section agent-profile-panel skeleton-panel" key={index}>
              <div className="profile-panel-heading app-section-heading profile-section-heading">
                <span className="skeleton skeleton-icon small" />
                <div>
                  <h3 className="skeleton skeleton-line short" />
                  <p className="skeleton skeleton-line" />
                </div>
                <strong className="skeleton skeleton-line tiny" />
              </div>
              <div className="profile-record-list agent-profile-list">
                {Array.from({ length: 3 }).map((_, rowIndex) => (
                  <div className="app-record-row profile-record-row" key={rowIndex}>
                    <span>
                      <strong className="skeleton skeleton-line title" />
                      <small className="skeleton skeleton-line short" />
                    </span>
                    <time className="skeleton skeleton-line tiny" />
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </section>
    </section>
  )
}

function AgentStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="app-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function testedCaseIdsFromCases(cases: Array<{ id: string }>) {
  return cases.map((item) => item.id)
}

function testedCaseIdsFromRows(ids: string[], rows: Array<{ caseId: string }>) {
  return [...ids, ...rows.map((row) => row.caseId)]
}

function testedCaseIds(ids: string[]) {
  return [...new Set(ids)]
}

function parseAmount(value: string) {
  const match = value.match(/^\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function formatAmount(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function formatTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}
