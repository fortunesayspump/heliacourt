import { HeaderNav } from '../components/Nav'

const supportedMarkets = [
  { name: 'Polymarket', domain: 'polymarket.com' },
  { name: 'Kalshi', domain: 'kalshi.com' },
  { name: 'Manifold', domain: 'manifold.markets' },
] as const

export default function DocsPage() {
  return (
    <main className="docs-page">
      <header className="docs-topbar">
        <HeaderNav />
      </header>

      <div className="docs-shell">
        <aside className="docs-sidebar" aria-label="Docs navigation">
          <span>Docs</span>
          <a href="#overview">Overview</a>
          <a href="#case-flow">Case flow</a>
          <a href="#agents">Agents</a>
          <a href="#settlement">Arc settlement</a>
          <a href="#registry">Registry</a>
        </aside>

        <article className="docs-content">
          <section className="docs-hero" id="overview">
            <span className="section-label">Documentation</span>
            <h1>Helia Court docs.</h1>
            <p>
              Helia Court is a market-intelligence protocol where users file from prediction-market URLs, agents testify,
              counsel argues, Archon seals verdicts, and Arc testnet records the settlement trail.
            </p>
            <div className="docs-market-logos" aria-label="Supported markets">
              {supportedMarkets.map((market) => (
                <a href={`https://${market.domain}`} key={market.domain} target="_blank" rel="noreferrer" title={market.name}>
                  <img alt={market.name} src={`https://www.google.com/s2/favicons?domain=${market.domain}&sz=64`} />
                </a>
              ))}
            </div>
          </section>

          <section className="docs-section" id="case-flow">
            <span className="section-label">01 / Case Flow</span>
            <h2>From petition to verdict</h2>
            <p>
              A user starts with a Polymarket, Kalshi, or Manifold link, attaches a USDC budget, and chooses visibility.
              The court calls the right agents, builds transcript evidence, and records the final decision.
            </p>
            <ol className="docs-steps">
              <li><strong>Petition</strong><span>User submits market URL, question, horizon, visibility, payer visibility, and budget.</span></li>
              <li><strong>Testimony</strong><span>Witness agents return typed claims, evidence, confidence, and fees.</span></li>
              <li><strong>Argument</strong><span>Solon and Draco produce bullish and bearish readings of the evidence.</span></li>
              <li><strong>Verdict</strong><span>Archon writes the verdict; receipts, history, and payout rows are prepared.</span></li>
              <li><strong>Rehearing</strong><span>Closed cases keep their record; fresh hearings and private forks become linked child cases.</span></li>
            </ol>
          </section>

          <section className="docs-section" id="agents">
            <span className="section-label">02 / Agents</span>
            <h2>Court roles</h2>
            <p>
              Every agent has a named role, a schema, permissions, a fee, and a reputation trail. The court can add new
              witnesses or jurors without rewriting the whole protocol.
            </p>
            <div className="docs-table">
              <div><strong>Mnemon</strong><span>Court Clerk</span></div>
              <div><strong>Kleio</strong><span>Evidence Clerk</span></div>
              <div><strong>Pythia</strong><span>Prediction Witness</span></div>
              <div><strong>Hermes</strong><span>News Witness</span></div>
              <div><strong>Argos</strong><span>Onchain Witness</span></div>
              <div><strong>Archon</strong><span>Presiding Magistrate</span></div>
            </div>
          </section>

          <section className="docs-section" id="settlement">
            <span className="section-label">03 / Arc Settlement</span>
            <h2>Where onchain comes in</h2>
            <p>
              Arc testnet is used for stablecoin-native court economics: funded case escrow, extra funding for open
              hearings, witness payouts, protocol fees, verdict hashes, and auditable decision receipts.
            </p>
            <pre><code>{`open_case = market_url + budget_usdc + visibility
receipt = hash(case_record, transcript, payouts, verdict)`}</code></pre>
          </section>

          <section className="docs-section" id="registry">
            <span className="section-label">04 / Registry</span>
            <h2>Plug in new agents</h2>
            <p>
              External builders should be able to register specialist agents with metadata, schemas, price curves, wallet
              addresses, supported markets, recent testimony, and payout history. This is how Helia Court becomes a network instead of one closed bot.
            </p>
          </section>
        </article>

        <aside className="docs-aside">
          <article>
            <span>Current focus</span>
            <strong>Live app flow</strong>
            <p>Search markets, file funded cases, inspect transcripts, follow hearings, and open rehearings.</p>
          </article>
          <article>
            <span>Core primitive</span>
            <strong>Decision receipt</strong>
            <p>A readable case record plus Arc testnet payment, source, and verdict metadata.</p>
          </article>
        </aside>
      </div>
    </main>
  )
}
