import { Suspense } from 'react'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { getBackendAgents, getBackendLedgerRows } from '../../lib/backend-data'
import Link from 'next/link'
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

export default function AgentsPage() {
  return (
    <main className="app-shell">
      <AppHeader active="agents" />

      <section className="workspace">
        <Suspense fallback={<AgentsSkeleton />}>
          <AgentsData />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

async function AgentsData() {
  const [agents, ledgerRows] = await Promise.all([
    getBackendAgents(),
    getBackendLedgerRows(),
  ])
  const payoutStats = summarizeAgentPayouts(ledgerRows)

  return (
        <section className="panel app-roster-page">
          <div className="registry-heading">
            <div>
              <p className="eyebrow">Agent registry</p>
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
            </div>
            {agents.length ? agents.map((agent, index) => {
              const payouts = payoutStats.get(agent.id)
              const payoutLabel = payouts ? `${formatAmount(payouts.total)} USDC` : '0 USDC'

              return (
              <Link className="registry-row" href={`/agents/${agent.id}`} key={agent.id} role="row">
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
              </Link>
              )
            }) : (
              <div className="empty-state">
                <strong>No agents yet</strong>
                <p>Agent records will appear here when available.</p>
              </div>
            )}
          </div>
        </section>
  )
}

function AgentsSkeleton() {
  return (
    <section className="panel app-roster-page">
      <div className="registry-heading">
        <div>
          <p className="eyebrow">Agent registry</p>
          <h2>Agent roster</h2>
        </div>
        <span>Loading</span>
      </div>
      <div className="registry-table" role="table" aria-label="Agent registry loading">
        <div className="registry-row registry-row-head" role="row">
          <span className="registry-rank">Rank</span>
          <span className="registry-agent-head">Agent</span>
          <span className="registry-seat">Seat</span>
          <span className="registry-rep">Mode</span>
          <span className="registry-fee">Payouts</span>
        </div>
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="registry-row skeleton-registry-row" key={index}>
            <span className="registry-rank skeleton skeleton-line tiny" />
            <div className="registry-agent">
              <span className="registry-avatar skeleton skeleton-icon" />
              <div>
                <h3 className="skeleton skeleton-line short" />
                <p className="skeleton skeleton-line" />
              </div>
            </div>
            <span className="registry-seat skeleton skeleton-line" />
            <strong className="registry-rep skeleton skeleton-line short" />
            <strong className="registry-fee skeleton skeleton-line short" />
          </div>
        ))}
      </div>
    </section>
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
