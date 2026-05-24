import { Bank, Code, Lightning, Receipt, ShieldCheck } from '@phosphor-icons/react/ssr'
import { AppFooter } from '../components/layout/AppFooter'
import { AppHeader } from '../components/layout/AppHeader'
import { GatewayPanel } from '../components/wallet/GatewayPanel'
import { X402PaidReadTester } from '../components/x402/X402PaidReadTester'
import { backendUrl } from '../../lib/backend-url'
import '../page.css'

export const dynamic = 'force-dynamic'

export default async function X402Page() {
  const [status, activity] = await Promise.all([
    getX402Status(),
    getX402Activity(),
  ])

  return (
    <main className="app-shell">
      <AppHeader active="x402" />
      <section className="workspace x402-workspace">
        <section className="panel x402-hero-panel">
          <div>
            <p className="eyebrow">Agent API payments</p>
            <h1>x402 proof desk</h1>
            <p>Public pages stay free for people. x402 is the paid machine-readable layer for agents, integrations, and external apps that need structured proof, transcript, receipt, and price JSON.</p>
          </div>
        </section>

        <section className="metrics-grid x402-metrics-grid">
          <div className="metric">
            <Lightning size={19} />
            <div>
              <span>Paid reads</span>
              <strong>{activity.totalPaidReads}</strong>
            </div>
          </div>
          <div className="metric">
            <Receipt size={19} />
            <div>
              <span>x402 collected</span>
              <strong>{activity.totalUsdc} USDC</strong>
            </div>
          </div>
          <div className="metric">
            <ShieldCheck size={19} />
            <div>
              <span>Settlement route</span>
              <strong>{formatX402Status(status.settlement)}</strong>
            </div>
          </div>
          <div className="metric">
            <Bank size={19} />
            <div>
              <span>Average read</span>
              <strong>{activity.averageUsdc} USDC</strong>
            </div>
          </div>
        </section>

        <GatewayPanel />
        <X402PaidReadTester suggestedCaseId={activity.latest?.caseId ?? null} />

        <section className="panel x402-guide-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">How x402 works</p>
              <h2>Gateway-funded paid reads</h2>
            </div>
            <Code size={20} />
          </div>
          <div className="x402-process-grid">
            <article>
              <span>01</span>
              <strong>Deposit to Gateway</strong>
              <p>Move a small USDC balance into Circle Gateway. This balance is separate from case escrow and only pays API reads.</p>
            </article>
            <article>
              <span>02</span>
              <strong>Request a proof route</strong>
              <p>An agent, script, or partner app calls a route like <code>/x402/proof/:caseId</code>. Public case pages remain readable without this step.</p>
            </article>
            <article>
              <span>03</span>
              <strong>Attach x402 payment</strong>
              <p>The caller sends the USDC authorization in the x402 payment header. No dashboard session is required.</p>
            </article>
            <article>
              <span>04</span>
              <strong>Receive payload + tx</strong>
              <p>The route returns structured JSON plus the x402 settlement transaction id for audit and accounting.</p>
            </article>
          </div>
          <div className="x402-screenshot-grid">
            <div className="x402-trace-summary">
              <span>Trace</span>
              <strong>Gateway-paid read</strong>
              <p>Gateway funds the API call. Case escrow stays separate.</p>
            </div>
            <article className="x402-trace-step">
              <span>01 Request</span>
              <strong>Transcript route</strong>
              <code>GET /x402/transcript/:caseId</code>
            </article>
            <article className="x402-trace-step">
              <span>02 Quote</span>
              <strong>402 Payment required</strong>
              <pre>{`{
  "accepts": "USDC",
  "amount": "<route quote>",
  "network": "arc-testnet"
}`}</pre>
            </article>
            <article className="x402-trace-step">
              <span>03 Result</span>
              <strong>200 Payment settled</strong>
              <pre>{`{
  "receipt": "anchored",
  "paymentTx": "0x...",
  "payload": "transcript"
}`}</pre>
            </article>
          </div>
        </section>

        <section className="panel x402-route-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Paid API</p>
              <h2>Available proof routes</h2>
            </div>
          </div>
          <div className="x402-route-grid">
            {status.resources.map((resource) => (
              <article key={resource}>
                <span>{status.enabled ? 'Ready' : 'Configure receiver'}</span>
                <strong>{resource}</strong>
              </article>
            ))}
          </div>
          <p className="gateway-explainer">
            Agents and integrations pay from Gateway balance to fetch structured data. Human browsing, case filing, and join funding use the normal app and Arc escrow.
          </p>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}

type X402Status = {
  enabled: boolean
  settlement: string
  resources: string[]
}

type X402Activity = {
  totalPaidReads: number
  totalUsdc: string
  averageUsdc: string
  latest?: {
    caseId?: string
  } | null
}

async function getX402Status(): Promise<X402Status> {
  try {
    const response = await fetch(`${backendUrl}/x402/status`, { cache: 'no-store' })
    if (!response.ok) return emptyX402Status()
    const payload = await response.json() as Partial<X402Status>
    return {
      enabled: Boolean(payload.enabled),
      settlement: payload.settlement ?? 'unavailable',
      resources: payload.resources?.length ? payload.resources : emptyX402Status().resources,
    }
  } catch {
    return emptyX402Status()
  }
}

async function getX402Activity(): Promise<X402Activity> {
  try {
    const response = await fetch(`${backendUrl}/x402/activity`, { cache: 'no-store' })
    if (!response.ok) return emptyX402Activity()
    const payload = await response.json() as Partial<X402Activity>
    return {
      totalPaidReads: Number(payload.totalPaidReads ?? 0),
      totalUsdc: payload.totalUsdc ?? '0',
      averageUsdc: payload.averageUsdc ?? '0',
      latest: payload.latest ?? null,
    }
  } catch {
    return emptyX402Activity()
  }
}

function emptyX402Status(): X402Status {
  return {
    enabled: false,
    settlement: 'unavailable',
    resources: ['/x402/price/:caseId', '/x402/transcript/:caseId', '/x402/receipts/:caseId', '/x402/proof/:caseId'],
  }
}

function emptyX402Activity(): X402Activity {
  return {
    totalPaidReads: 0,
    totalUsdc: '0',
    averageUsdc: '0',
    latest: null,
  }
}

function formatX402Status(value: string) {
  if (value === 'facilitator-configured') return 'Ready'
  if (value === 'challenge-only') return 'Challenge'
  return 'Offline'
}
