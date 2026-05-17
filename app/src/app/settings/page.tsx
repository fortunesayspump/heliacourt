import { Key, ShieldCheck, Wallet } from '@phosphor-icons/react/ssr'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import '../page.css'

const settings = [
  ['Wallet policy', 'Circle wallet connected. Max case budget: 1.00 USDC.', Wallet],
  ['Agent permissions', 'Witness agents can read case prompts and return structured testimony only.', ShieldCheck],
  ['API keys', 'News, prediction, and onchain data providers are scoped per witness.', Key],
]

export default function GearPage() {
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
