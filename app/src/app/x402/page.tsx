import { Bank, Lightning, Receipt, ShieldCheck } from '@phosphor-icons/react/ssr'
import { AppFooter } from '../components/AppFooter'
import { AppHeader } from '../components/AppHeader'
import { GatewayPanel } from '../components/GatewayPanel'
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
            <p className="eyebrow">Agent payments</p>
            <h1>x402 Gateway</h1>
            <p>Gateway balance is for tiny paid proof, transcript, receipt, and price reads. Case filing and join funding stay on normal wallet USDC through Arc escrow.</p>
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
            Agents can pay from Gateway balance and receive the payment transaction id with the returned proof payload.
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
}

async function getX402Status(): Promise<X402Status> {
  const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')
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
  const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')
  try {
    const response = await fetch(`${backendUrl}/x402/activity`, { cache: 'no-store' })
    if (!response.ok) return emptyX402Activity()
    const payload = await response.json() as Partial<X402Activity>
    return {
      totalPaidReads: Number(payload.totalPaidReads ?? 0),
      totalUsdc: payload.totalUsdc ?? '0',
      averageUsdc: payload.averageUsdc ?? '0',
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
  }
}

function formatX402Status(value: string) {
  if (value === 'facilitator-configured') return 'Ready'
  if (value === 'challenge-only') return 'Challenge'
  return 'Offline'
}
