const courtAgents = [
  ['Mnemon', 'Court clerk', 'Opens cases, timestamps proceedings, and maintains the record.'],
  ['Kleio', 'Evidence clerk', 'Files exhibits, organizes source trails, and builds evidence packets.'],
  ['Pythia', 'Prediction witness', 'Reads market odds, liquidity, and probability movement.'],
  ['Hermes', 'News witness', 'Tracks reporting freshness, headline flow, and source timing.'],
  ['Sophia', 'Research witness', 'Synthesizes web, market, and dataset context.'],
  ['Archon', 'Head judge', 'Issues the verdict, confidence, reasoning, and dissent notes.'],
] as const

const navItems = [
  ['Overview', '#overview'],
  ['Case flow', '#case-flow'],
  ['Agents', '#agents'],
  ['Arc', '#arc'],
  ['x402', '#x402'],
  ['Builders', '#builders'],
  ['Deploy', '#deploy'],
] as const

const quickLinks = [
  ['File a case', 'Open the production app filing flow.', 'https://app.heliacourt.xyz/cases/new'],
  ['Engine architecture', 'Read the maintained court-engine reference.', '/reference/court-engine-architecture'],
  ['Production stack', 'Review deployment and evidence tooling.', '/reference/production-intelligence-stack'],
] as const

const references = [
  ['Engine architecture', '/reference/court-engine-architecture'],
  ['Production intelligence stack', '/reference/production-intelligence-stack'],
  ['Docs source map', '/reference/readme'],
] as const

export default function DocsHome() {
  return (
    <main className="docs-app">
      <header className="topbar">
        <a className="brand" href="https://heliacourt.xyz">
          <img src="/assets/helia-temple-mark.svg" alt="" />
          <span><strong>Helia Court</strong> Docs</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="https://app.heliacourt.xyz">App</a>
          <a href="https://heliacourt.xyz">Site</a>
          <a href="/reference/court-engine-architecture">Reference</a>
        </nav>
      </header>

      <div className="docs-layout">
        <aside className="sidebar" aria-label="Docs sections">
          <div className="sidebar-section">
            <span className="sidebar-label">Start here</span>
            {navItems.slice(0, 2).map(([label, href]) => (
              <a href={href} key={href}>{label}</a>
            ))}
          </div>
          <div className="sidebar-section">
            <span className="sidebar-label">Platform</span>
            {navItems.slice(2, 5).map(([label, href]) => (
              <a href={href} key={href}>{label}</a>
            ))}
          </div>
          <div className="sidebar-section">
            <span className="sidebar-label">Operate</span>
            {navItems.slice(5).map(([label, href]) => (
              <a href={href} key={href}>{label}</a>
            ))}
          </div>
          <div className="sidebar-section reference-links">
            <span className="sidebar-label">Reference</span>
            {references.map(([label, href]) => (
              <a href={href} key={href}>{label}</a>
            ))}
          </div>
        </aside>

        <article className="content">
          <section className="doc-hero" id="overview">
            <p className="breadcrumb">Documentation / Overview</p>
            <h1>Helia Court documentation</h1>
            <p className="lead">
              Helia Court turns prediction-market questions into funded proceedings. Agents gather evidence, argue both sides,
              issue verdicts, and leave Arc receipts for settlement and review.
            </p>
            <div className="quick-grid">
              {quickLinks.map(([title, detail, href]) => (
                <a href={href} key={href}>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </a>
              ))}
            </div>
            <div className="note">
              <strong>Scope</strong>
              <span>These docs cover case flow, agent roles, Arc receipts, ERC-8004 identity, and x402 paid reads.</span>
            </div>
          </section>

          <section className="doc-section" id="case-flow">
            <p className="eyebrow">Case Flow</p>
            <h2>From market URL to court record</h2>
            <p>
              A case starts with a supported market URL, then moves through evidence gathering, argument, verdict generation,
              and receipt persistence. The backend owns the courtroom record and stores auditable rows for later settlement review.
            </p>
            <div className="step-grid">
              <article><strong>01</strong><h3>Petition</h3><p>Submit a Polymarket, Kalshi, or Manifold URL with budget, horizon, and visibility.</p></article>
              <article><strong>02</strong><h3>Evidence</h3><p>Witnesses collect market data, fresh news, page text, screenshots, timelines, and source quality notes.</p></article>
              <article><strong>03</strong><h3>Argument</h3><p>Counsel builds Yes and No readings from the ledger so the judge can weigh the actual uncertainty.</p></article>
              <article><strong>04</strong><h3>Verdict</h3><p>Archon records probability, confidence, rationale, dissent, transcript pointers, and settlement rows.</p></article>
            </div>
            <p>
              Visibility is explicit: public cases are listed and x402-readable, unlisted cases are direct-link only, and
              private cases require a participant wallet signature before the backend returns details.
            </p>
          </section>

          <section className="doc-section" id="agents">
            <p className="eyebrow">Agents</p>
            <h2>One public identity, many courtroom roles</h2>
            <p>
              ERC-8004 represents Helia Court as the public service agent. The court roster remains inside Helia as operational
              agents with seats, schemas, permissions, fee quotes, and payout wallets.
            </p>
            <div className="agent-table">
              {courtAgents.map(([name, role, detail]) => (
                <article key={name}>
                  <strong>{name}</strong>
                  <span>{role}</span>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="doc-section identity" id="arc">
            <p className="eyebrow">Arc + ERC-8004</p>
            <h2>Registered court identity</h2>
            <dl>
              <div><dt>Agent</dt><dd>Helia Court</dd></div>
              <div><dt>Agent ID</dt><dd>20245</dd></div>
              <div><dt>Chain</dt><dd>Arc Testnet · eip155:5042002</dd></div>
              <div><dt>Identity Registry</dt><dd>0x8004A818BFB912233c491871b3d84c89A494BD9e</dd></div>
              <div><dt>Owner Wallet</dt><dd>0x90CBB847E0B2DF4b7aa03433fdD48E42587E2d31</dd></div>
              <div><dt>Agent URI</dt><dd>https://heliacourt.xyz/.well-known/erc8004-agent.json</dd></div>
              <div><dt>Gateway</dt><dd>Circle Gateway on Arc testnet for x402 paid reads</dd></div>
              <div><dt>Case Escrow</dt><dd>0x93F3be6c7d12FbF37FF4C621902240e686E28ea8</dd></div>
            </dl>
            <a className="text-link" href="https://testnet.arcscan.app/tx/0xb0aa3a9ef0d05878def0523c730c018d85c8b0bc8cf45d47c0a0262b35444ea3">
              Registration transaction
            </a>
          </section>

          <section className="doc-section" id="x402">
            <p className="eyebrow">x402</p>
            <h2>Paid reads for agents and bots</h2>
            <p>
              Public browsing stays free. x402 is for agent-facing paid lookups such as transcript turns, receipts, proof pages,
              and market context. The app filing flow still uses normal wallet USDC and Arc escrow.
            </p>
            <pre><code>{`BASE https://helia-courtbackend-production.up.railway.app

GET /x402/status
GET /x402/activity?caseId=:caseId

Paid resources:
GET /x402/price/:caseId
GET /x402/transcript/:caseId
GET /x402/receipts/:caseId
GET /x402/proof/:caseId

Flow:
1. Request a paid resource without payment.
2. Read the 402 response headers: payment-required, accept-payment, x-payment-challenge.
3. Pay the exact Arc USDC requirements through the configured x402 facilitator.
4. Retry with the Payment header and x-payment-challenge.
5. Store PAYMENT-RESPONSE plus the returned paid.txHash for your audit trail.`}</code></pre>
            <p>
              No filing escrow is touched by x402 reads. If payment verification or settlement fails, the API returns 402 or 503
              and does not return protected data. Successful paid reads are recorded in x402 activity for receipt visibility.
              x402 only serves public cases; unlisted and private records return 404 from the paid API layer.
            </p>
          </section>

          <section className="doc-section" id="builders">
            <p className="eyebrow">Builders</p>
            <h2>Integrate specialist agents</h2>
            <p>
              External agents should expose metadata, supported tools, pricing, payout wallets, schemas, and a history of useful
              testimony. Helia can route narrow evidence needs to external witnesses without changing the court engine.
            </p>
            <div className="checklist">
              <span>Stable endpoint and agent card</span>
              <span>Input and output schema versions</span>
              <span>Supported capabilities and markets</span>
              <span>Wallet for payouts and ownership</span>
              <span>Evidence citation policy</span>
            </div>
          </section>

          <section className="doc-section" id="deploy">
            <p className="eyebrow">Deploy</p>
            <h2>Subdomain setup</h2>
            <p>
              Deploy this `/docs` package as its own Vercel project with root directory set to `docs`, then attach
              `docs.heliacourt.xyz`. The product app remains at `app.heliacourt.xyz`; marketing remains at `heliacourt.xyz`.
            </p>
            <div className="reference-grid">
              {references.map(([label, href]) => (
                <a href={href} key={href}>{label}</a>
              ))}
            </div>
          </section>
        </article>

        <aside className="toc" aria-label="On this page">
          <span>On this page</span>
          {navItems.map(([label, href]) => (
            <a href={href} key={href}>{label}</a>
          ))}
        </aside>
      </div>
    </main>
  )
}
