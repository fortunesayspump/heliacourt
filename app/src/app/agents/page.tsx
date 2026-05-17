import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'
import '../page.css'

const agents = [
  ['Mnemon', 'Court Clerk', 'Records case events and receipts', '0.02 USDC', '97%'],
  ['Kleio', 'Evidence Clerk', 'Packages testimony into exhibits', '0.25 USDC', '91%'],
  ['Pythia', 'Prediction Witness', 'Reads odds, spreads, and market depth', '0.90 USDC', '92%'],
  ['Hermes', 'Web/Search Witness', 'Tracks search results, headlines, and source velocity', '0.80 USDC', '84%'],
  ['Argos', 'Onchain Witness', 'Reads wallet and exchange flow signals', '1.10 USDC', '88%'],
  ['Notus', 'Weather/Data Witness', 'Pulls weather, sports, macro, and external datasets', '0.70 USDC', '91%'],
  ['Phylax', 'Risk Witness', 'Flags manipulation, liquidity, uncertainty, and invalidation', '0.65 USDC', '97%'],
  ['Solon / Draco', 'Bull and Bear Counsel', 'Argues both sides of the evidence', '1.50 USDC', '89%'],
  ['Dikasts', 'Human or Agent Jurors', 'Votes with confidence and dissent', '0.75 USDC', '86%'],
  ['Archon', 'Presiding Magistrate', 'Writes final verdict and constraints', '0.00 USDC', '99%'],
  ['Bring Your Own Witness', 'Registry Slot', 'External specialist agents can be added later with schema, wallet, and pricing', 'Soon', 'Open'],
]

export default function AgentsPage() {
  return (
    <main className="app-shell">
      <AppHeader active="agents" />

      <section className="workspace">
        <PageTitle
          eyebrow="Agent registry"
          title="Prediction witness bench"
          description="First-party witnesses cover prediction markets, web search, onchain data, weather/data APIs, and risk. The registry leaves room for builders to add their own specialist agents later."
          imageSrc="/assets/schoolxl.jpg"
        />

        <section className="panel app-roster-page">
          {agents.map(([name, role, detail, fee, reliability]) => (
            <article className="roster-row" key={name}>
              <div>
                <h3>{name}</h3>
                <p>{role} · {detail}</p>
              </div>
              <div className="roster-meta">
                <span className="state-dot ready">{reliability}</span>
                <strong>{fee}</strong>
              </div>
            </article>
          ))}
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
