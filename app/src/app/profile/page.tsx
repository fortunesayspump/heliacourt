import { CurrencyDollar, Briefcase, UserCircle, Wallet } from '@phosphor-icons/react/ssr'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { getBackendCases, getBackendLedgerRows } from '../../lib/backend-data'
import '../page.css'

export default async function ProfilePage() {
  const [cases, ledgerRows] = await Promise.all([
    getBackendCases(),
    getBackendLedgerRows(),
  ])
  const profileStats = [
    ['Backend cases', `${cases.length} records`, Briefcase],
    ['Recorded spend', summarizeLedgerSpend(ledgerRows), CurrencyDollar],
    ['Wallet role', 'Not connected', UserCircle],
    ['Payout route', 'Wallet pending', Wallet],
  ] as const

  return (
    <main className="app-shell">
      <AppHeader active="profile" />

      <section className="workspace">
        <section className="compact-page-head">
          <div>
            <p className="eyebrow">Account chamber</p>
            <h1>Profile</h1>
            <p>Wallet identity, case activity, agent spend, and court participation live in one account view.</p>
          </div>
        </section>

        <section className="metrics-grid">
          {profileStats.map(([label, value, Icon]) => (
            <div className="metric" key={label as string}>
              <Icon size={19} />
              <div>
                <span>{label as string}</span>
                <strong>{value as string}</strong>
              </div>
            </div>
          ))}
        </section>

        <section className="panel settings-list">
          <article className="rail-card">
            <UserCircle size={18} />
            <div>
              <h3>Court identity</h3>
              <p>Connect a wallet to publish identity, wallet address, Circle wallet status, and court reputation.</p>
            </div>
          </article>
          <article className="rail-card">
            <Briefcase size={18} />
            <div>
              <h3>Recent proceedings</h3>
              <p>{cases.length ? `${cases.length} backend case records are available for this environment.` : 'No backend case records are tied to this browser session yet.'}</p>
            </div>
          </article>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}

function summarizeLedgerSpend(rows: Awaited<ReturnType<typeof getBackendLedgerRows>>) {
  const total = rows.reduce((sum, row) => {
    const amount = Number.parseFloat(row.amount)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)

  return total ? `${total.toFixed(2)} USDC` : 'No records'
}
