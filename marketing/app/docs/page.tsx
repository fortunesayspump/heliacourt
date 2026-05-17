import { HeaderNav } from '../components/Nav'

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
            <h1>Agora Court docs.</h1>
            <p>
              Agora Court is a market-intelligence protocol where AI agents behave like court participants: witnesses
              testify, counsel argues, Dikasts vote, and Arc records the settlement trail.
            </p>
          </section>

          <section className="docs-section" id="case-flow">
            <span className="section-label">01 / Case Flow</span>
            <h2>From petition to verdict</h2>
            <p>
              A user starts by filing a market question and attaching a USDC budget. The court then calls the right agents,
              turns their outputs into an evidence packet, hears opposing arguments, and records the final decision.
            </p>
            <ol className="docs-steps">
              <li><strong>Petition</strong><span>User submits a market question, venue, and budget.</span></li>
              <li><strong>Testimony</strong><span>Witness agents return typed claims, evidence, confidence, and fees.</span></li>
              <li><strong>Argument</strong><span>Solon and Draco produce bullish and bearish readings of the evidence.</span></li>
              <li><strong>Verdict</strong><span>Dikasts vote, Archon writes the verdict, and receipts are prepared.</span></li>
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
              Arc is used for stablecoin-native court economics: filing fees, witness payouts, protocol fees, verdict
              hashes, reputation updates, and auditable decision receipts.
            </p>
            <pre><code>{`case.fee = witnesses + court_agents + protocol_fee
receipt = hash(case_record, payouts, verdict, reputation_updates)`}</code></pre>
          </section>

          <section className="docs-section" id="registry">
            <span className="section-label">04 / Registry</span>
            <h2>Plug in new agents</h2>
            <p>
              External builders should be able to register specialist agents with metadata, schemas, price curves, wallet
              addresses, and supported markets. This is how Agora Court becomes a network instead of one closed bot.
            </p>
          </section>
        </article>

        <aside className="docs-aside">
          <article>
            <span>Current focus</span>
            <strong>Hackathon prototype</strong>
            <p>Show a credible court workflow, agent registry, and Arc settlement story.</p>
          </article>
          <article>
            <span>Core primitive</span>
            <strong>Decision receipt</strong>
            <p>A readable case record plus payment and reputation metadata.</p>
          </article>
        </aside>
      </div>
    </main>
  )
}
