import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'
import { getBackendAgents, getBackendLedgerRows } from '../../lib/backend-data'
import '../page.css'

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

export default async function AgentsPage() {
  const [agents, ledgerRows] = await Promise.all([
    getBackendAgents(),
    getBackendLedgerRows(),
  ])
  const payoutStats = summarizeAgentPayouts(ledgerRows)

  return (
    <main className="app-shell">
      <AppHeader active="agents" />

      <section className="workspace">
        <PageTitle
          eyebrow="Agent registry"
          title="Prediction witness bench"
          description="First-party witnesses cover prediction markets, web search, exact-page scraping, source quality, timelines, research synthesis, onchain data, structured data APIs, quant checks, and risk."
          imageSrc="/assets/schoolxl.jpg"
        />

        <section className="panel app-roster-page">
          <div className="registry-heading">
            <div>
              <p className="eyebrow">Backend registry</p>
              <h2>Agent roster</h2>
            </div>
            <span>{agents.length} seats</span>
          </div>

          <div className="registry-table" role="table" aria-label="Agent registry roster">
            <div className="registry-row registry-row-head" role="row">
              <span className="registry-rank">Rank</span>
              <span className="registry-agent-head">Agent</span>
              <span className="registry-seat">Seat</span>
              <span className="registry-rep">Mode</span>
              <span className="registry-fee">Payouts</span>
              <span className="registry-status">Status</span>
            </div>
            {agents.length ? agents.map((agent, index) => {
              const payouts = payoutStats.get(agent.id)
              const payoutLabel = payouts ? `${formatAmount(payouts.total)} USDC` : '0 USDC'

              return (
              <article className="registry-row" key={agent.id} role="row">
                <span className="registry-rank">{String(index + 1).padStart(2, '0')}</span>
                <div className="registry-agent">
                  <span className="registry-avatar" aria-hidden="true">{agent.name.slice(0, 1)}</span>
                  <div>
                    <h3>{agent.name}</h3>
                    <p>{agent.description}</p>
                  </div>
                </div>
              <span className="registry-seat">{seatLabels[agent.seat] ?? agent.seat}</span>
              <strong className="registry-rep">{agent.runMode}</strong>
              <strong className="registry-fee" title={`${payouts?.count ?? 0} recorded payout rows`}>{payoutLabel}</strong>
                <span className={`registry-status state-dot ${getAgentStatusClass(agent.onchain?.registrationStatus, agent.enabled)}`}>
                  {formatAgentStatus(agent.onchain?.registrationStatus, agent.enabled)}
                </span>
              </article>
              )
            }) : (
              <div className="empty-state">
                <strong>Backend registry unavailable</strong>
                <p>Start the backend server to load the agent roster.</p>
              </div>
            )}
          </div>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}

function summarizeAgentPayouts(rows: Awaited<ReturnType<typeof getBackendLedgerRows>>) {
  const payouts = new Map<string, { total: number; count: number }>()

  for (const row of rows) {
    if (row.receiptType !== 'agent-payout' || !row.agentId) continue
    const amount = parseAmount(row.amount)
    const current = payouts.get(row.agentId) ?? { total: 0, count: 0 }
    payouts.set(row.agentId, {
      total: current.total + amount,
      count: current.count + 1,
    })
  }

  return payouts
}

function parseAmount(value: string) {
  const match = value.match(/^\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function formatAmount(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function formatAgentStatus(status: NonNullable<Awaited<ReturnType<typeof getBackendAgents>>[number]['onchain']>['registrationStatus'] | undefined, enabled: boolean) {
  if (!enabled) return 'Disabled'
  if (status === 'registered') return 'Onchain'
  if (status === 'protocol-wallet-ready') return 'Protocol wallet'
  if (status === 'external-wallet-ready') return 'External wallet'
  return 'Wallet pending'
}

function getAgentStatusClass(status: NonNullable<Awaited<ReturnType<typeof getBackendAgents>>[number]['onchain']>['registrationStatus'] | undefined, enabled: boolean) {
  if (!enabled) return 'voting'
  if (status === 'registered') return 'ready'
  if (status === 'protocol-wallet-ready' || status === 'external-wallet-ready') return 'active'
  return 'voting'
}
