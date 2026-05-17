import { CurrencyDollar, Briefcase, UserCircle, Wallet } from '@phosphor-icons/react/ssr'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import '../page.css'

const profileStats = [
  ['Filed cases', '12 active', Briefcase],
  ['Agent spend', '8.42 USDC', CurrencyDollar],
  ['Wallet role', 'Court participant', UserCircle],
  ['Payout route', 'Arc Testnet', Wallet],
]

export default function ProfilePage() {
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
              <p>Display name, wallet address, Circle wallet status, and public court reputation.</p>
            </div>
          </article>
          <article className="rail-card">
            <Briefcase size={18} />
            <div>
              <h3>Recent proceedings</h3>
              <p>Cases filed, witness testimony purchased, jury votes, and sealed verdict receipts.</p>
            </div>
          </article>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
