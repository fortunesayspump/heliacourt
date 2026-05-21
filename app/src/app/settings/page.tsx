import { Key, ShieldCheck, Wallet } from '@phosphor-icons/react/ssr'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { getBackendAgents, getBackendHealth } from '../../lib/backend-data'
import '../page.css'

export default async function GearPage() {
  const [agents, health] = await Promise.all([getBackendAgents(), getBackendHealth()])
  const toolCount = new Set(agents.flatMap((agent) => agent.toolCapabilities)).size
  const settings = [
    ['Wallet policy', health?.onchain?.settlementUsesDedicatedKey ? 'Backend settlement is using a dedicated clerk signer.' : 'Backend settlement currently falls back to the admin/deployer signer.', Wallet],
    ['Agent permissions', `${agents.length} backend agents are registered. ${agents.filter((agent) => agent.onchain?.registrationStatus === 'registered').length} are mapped to onchain registry ids.`, ShieldCheck],
    ['Provider tools', toolCount ? `${toolCount} tool capability groups are exposed by the backend registry.` : 'Backend tool capabilities are unavailable in this environment.', Key],
    ['Database', health?.database?.configured ? 'Postgres is configured for persistent cases, transcripts, artifacts, verdicts, and receipts.' : 'Postgres is not configured; this environment is using volatile memory.', ShieldCheck],
    ['Onchain settlement', health?.onchain?.caseEscrowConfigured && health.onchain.courtReceiptsConfigured ? `Arc ${health.onchain.chainId} contracts are configured for escrow and receipts.` : 'Escrow or receipt contract addresses are missing.', Key],
    ['Hearing queue', health?.hearingQueue ? `${health.hearingQueue.backend} queue · ${health.hearingQueue.active ?? 0} active · ${health.hearingQueue.waiting ?? 0} waiting.` : 'Backend queue health is unavailable.', Wallet],
  ] as const

  return (
    <main className="app-shell">
      <AppHeader active="settings" />

      <section className="workspace">
        <section className="compact-page-head">
          <div>
            <p className="eyebrow">Controls</p>
            <h1>Gear</h1>
            <p>Manage wallets, budget caps, agent permissions, and data-provider access for the court.</p>
          </div>
        </section>

        <section className="panel settings-list">
          {settings.map(([title, detail, Icon]) => (
            <article className="rail-card" key={title as string}>
              <Icon size={18} />
              <div>
                <h3>{title as string}</h3>
                <p>{detail as string}</p>
              </div>
            </article>
          ))}
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
