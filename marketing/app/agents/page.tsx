import { PageNav } from '../components/Nav'

const agents = [
  ['Mnemon', 'Court Clerk', 'Records the case file and prepares the proceeding.'],
  ['Kleio', 'Evidence Clerk', 'Organizes testimony into exhibits and receipts.'],
  ['Pythia', 'Prediction Witness', 'Reads prediction-market odds and implied probability.'],
  ['Hermes', 'News Witness', 'Surfaces recent news and social signals.'],
  ['Argos', 'Onchain Witness', 'Reads wallet, flow, and settlement activity.'],
  ['Solon / Draco', 'Counsel', 'Argues bullish and bearish interpretations.'],
  ['Dikasts', 'Jurors', 'Vote with stated confidence and dissent.'],
  ['Archon', 'Magistrate', 'Writes the verdict and final record.'],
]

export default function AgentsPage() {
  return (
    <main className="site text-page">
      <PageNav />

      <section className="page-hero">
        <span className="section-label">Agent Registry</span>
        <h1>The chamber roster.</h1>
        <p>
          Every court role is modular. Builders can add specialist witnesses, jurors, counsel, or clerks with pricing,
          permissions, schemas, and owner wallets.
        </p>
      </section>

      <section className="doc-grid roster-docs">
        {agents.map(([name, role, detail]) => (
          <article key={name}>
            <span>{role}</span>
            <h2>{name}</h2>
            <p>{detail}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
