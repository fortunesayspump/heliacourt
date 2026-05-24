import { CurrencyCircleDollar, Robot, ShieldCheck, UsersThree } from '@phosphor-icons/react/ssr'
import { Suspense, type CSSProperties } from 'react'
import { AppHeader } from '../components/layout/AppHeader'
import { AppFooter } from '../components/layout/AppFooter'
import { getBackendAgents, getBackendLedgerRows, type ApiAgent } from '../../lib/backend-data'
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
  const totalPayout = [...payoutStats.values()].reduce((total, item) => total + item.total, 0)
  const agentStats = buildAgentStats(agents, payoutStats)

  return (
    <>
        <section className="metrics-grid">
          <div className="metric">
            <Robot size={19} />
            <div>
              <span>Registered seats</span>
              <strong>{agents.length} agents</strong>
            </div>
            <MiniBars values={agentStats.seatBars} />
          </div>
          <div className="metric">
            <ShieldCheck size={19} />
            <div>
              <span>Enabled bench</span>
              <strong>{agents.filter((agent) => agent.enabled).length} active</strong>
            </div>
            <MiniSparkline values={agentStats.enabledTrend} />
          </div>
          <div className="metric">
            <CurrencyCircleDollar size={19} />
            <div>
              <span>Payout flow</span>
              <strong>{totalPayout ? `${formatAmount(totalPayout)} USDC` : '0 USDC'}</strong>
            </div>
            <MiniBars values={agentStats.payoutBars} />
          </div>
          <div className="metric">
            <UsersThree size={19} />
            <div>
              <span>Run modes</span>
              <strong>{new Set(agents.map((agent) => agent.runMode)).size} modes</strong>
            </div>
            <MiniSparkline values={agentStats.modeBars} />
          </div>
        </section>

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
                  <span className="registry-avatar" aria-hidden="true">
                    {agent.avatarUrl ? <img alt="" src={agent.avatarUrl} /> : agent.name.slice(0, 1)}
                  </span>
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
    </>
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

function buildAgentStats(agents: ApiAgent[], payoutStats: Map<string, { total: number; count: number }>) {
  const seats = new Map<string, number>()
  const modes = new Map<string, number>()
  for (const agent of agents) {
    seats.set(agent.seat, (seats.get(agent.seat) ?? 0) + 1)
    modes.set(agent.runMode, (modes.get(agent.runMode) ?? 0) + 1)
  }

  return {
    seatBars: [...seats.values()].slice(0, 7),
    enabledTrend: [
      agents.filter((agent) => agent.enabled && agent.runMode === 'model').length,
      agents.filter((agent) => agent.enabled && agent.runMode === 'tool-backed-model').length,
      agents.filter((agent) => agent.enabled).length,
    ],
    payoutBars: [...payoutStats.values()].map((item) => item.total).sort((a, b) => b - a).slice(0, 7),
    modeBars: [...modes.values()].slice(0, 7),
  }
}
