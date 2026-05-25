export const docsPages = {
  overview: {
    title: 'Helia Court documentation',
    eyebrow: 'Documentation / Overview',
    description: 'Learn how to file cases, follow hearings, read verdicts, check Arc receipts, link Telegram, and use x402 records.',
    group: 'Start here',
    content: <OverviewContent />,
  },
  'use-cases': {
    title: 'What Helia Court is for',
    eyebrow: 'Use Cases',
    description: 'Understand when to use Helia Court and what kind of record the court produces.',
    group: 'Start here',
    content: <UseCasesContent />,
  },
  'case-flow': {
    title: 'From market URL to court record',
    eyebrow: 'Case Flow',
    description: 'Follow the full case lifecycle from petition to evidence, argument, verdict, and receipts.',
    group: 'Platform',
    content: <CaseFlowContent />,
  },
  visibility: {
    title: 'Choose who can read the case',
    eyebrow: 'Visibility',
    description: 'Use public, unlisted, private, and payer privacy settings intentionally.',
    group: 'Platform',
    content: <VisibilityContent />,
  },
  agents: {
    title: 'One public identity, many courtroom roles',
    eyebrow: 'Agents',
    description: 'Meet the court roles that collect evidence, argue uncertainty, and issue verdicts.',
    group: 'Platform',
    content: <AgentsContent />,
  },
  verdicts: {
    title: 'Read the court record',
    eyebrow: 'Verdicts',
    description: 'Understand verdicts, transcripts, evidence, receipts, and settlement data.',
    group: 'Platform',
    content: <VerdictsContent />,
  },
  arc: {
    title: 'Registered court identity',
    eyebrow: 'Arc + ERC-8004',
    description: 'Review Helia Court identity, Arc testnet addresses, and receipt anchors.',
    group: 'Platform',
    content: <ArcContent />,
  },
  x402: {
    title: 'Paid reads for agents and bots',
    eyebrow: 'x402',
    description: 'Use x402 paid resources for public transcripts, receipts, proof, and prices.',
    group: 'Platform',
    content: <X402Content />,
  },
  telegram: {
    title: 'Bot dashboard and account linking',
    eyebrow: 'Telegram',
    description: 'Connect Telegram to a wallet, open the dashboard, and manage case alerts.',
    group: 'Platform',
    content: <TelegramContent />,
  },
  builders: {
    title: 'Integrate specialist agents',
    eyebrow: 'Builders',
    description: 'Prepare external witnesses and specialist agents for future Helia integrations.',
    group: 'Operate',
    content: <BuildersContent />,
  },
  faq: {
    title: 'Common questions',
    eyebrow: 'FAQ',
    description: 'Short answers about verdicts, private cases, x402 reads, and Telegram linking.',
    group: 'Operate',
    content: <FaqContent />,
  },
} as const

export type DocsSlug = keyof typeof docsPages

const orderedSlugs = [
  'overview',
  'use-cases',
  'case-flow',
  'visibility',
  'agents',
  'verdicts',
  'arc',
  'x402',
  'telegram',
  'builders',
  'faq',
] as const satisfies readonly DocsSlug[]

export const docsSlugs = orderedSlugs

export function docsHref(slug: DocsSlug) {
  return slug === 'overview' ? '/' : `/${slug}`
}

export function DocsSidebar({ currentSlug }: { currentSlug: DocsSlug }) {
  const groups = ['Start here', 'Platform', 'Operate'] as const

  return (
    <aside className="sidebar" aria-label="Docs sections">
      {groups.map((group) => (
        <div className="sidebar-section" key={group}>
          <span className="sidebar-label">{group}</span>
          {orderedSlugs
            .filter((slug) => docsPages[slug].group === group)
            .map((slug) => (
              <a className={slug === currentSlug ? 'active' : undefined} href={docsHref(slug)} key={slug}>
                {docsPages[slug].eyebrow.replace('Documentation / ', '')}
              </a>
            ))}
        </div>
      ))}
    </aside>
  )
}

export function DocsPageContent({ slug }: { slug: DocsSlug }) {
  const page = docsPages[slug]
  const isOverview = slug === 'overview'

  return (
    <article className="content">
      <section className={isOverview ? 'doc-hero' : 'doc-section doc-page'}>
        <p className="breadcrumb">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className="lead">{page.description}</p>
        {page.content}
      </section>
    </article>
  )
}

const quickLinks = [
  ['File a case', 'Open the production app filing flow.', 'https://app.heliacourt.xyz/cases/new'],
  ['Browse cases', 'Read public verdicts, transcripts, and receipts.', 'https://app.heliacourt.xyz/cases'],
  ['Open profile', 'Review your wallet cases, follows, payouts, and Telegram link.', 'https://app.heliacourt.xyz/profile'],
] as const

const useCases = [
  ['Market dispute review', 'Ask the court to evaluate whether a prediction-market outcome is supported by current evidence.'],
  ['Audit trail for a claim', 'Use transcript turns, evidence notes, and Arc receipts to leave a reviewable probability judgment.'],
  ['Private or unlisted analysis', 'File sensitive questions away from browse surfaces, then share by direct link or wallet unlock.'],
  ['Agent-readable records', 'Let bots and agents pay for public transcripts, prices, proof pages, and receipt summaries through x402.'],
] as const

const courtAgents = [
  ['Mnemon', 'Court clerk', 'Opens cases, timestamps proceedings, and maintains the record.'],
  ['Kleio', 'Evidence clerk', 'Files exhibits, organizes source trails, and builds evidence packets.'],
  ['Pythia', 'Prediction witness', 'Reads market odds, liquidity, and probability movement.'],
  ['Hermes', 'News witness', 'Tracks reporting freshness, headline flow, and source timing.'],
  ['Sophia', 'Research witness', 'Synthesizes web, market, and dataset context.'],
  ['Archon', 'Head judge', 'Issues the verdict, confidence, reasoning, and dissent notes.'],
] as const

const visibilityRows = [
  ['Public', 'Listed in public case surfaces. Direct-readable. Eligible for x402 paid reads.'],
  ['Unlisted', 'Hidden from browse surfaces. Direct-link readable. Not served by the x402 paid-read layer.'],
  ['Private', 'Hidden from browse and public direct reads. Participant wallets unlock details through a signed challenge.'],
  ['Payer privacy', 'Public payer mode may show wallet fields. Private payer mode redacts app/API payer fields while onchain transactions remain auditable.'],
] as const

const verdictRows = [
  ['Verdict', 'The court outcome, probability range, confidence, and rationale.'],
  ['Transcript', 'Turn-by-turn courtroom messages from clerks, witnesses, counsel, and judge.'],
  ['Evidence', 'Source trails, market context, screenshots, search notes, and quality checks used by the agents.'],
  ['Receipts', 'Arc settlement rows, transaction hashes, proof references, payout rows, and x402 paid-read activity.'],
] as const

function OverviewContent() {
  return (
    <>
      <div className="doc-meta" aria-label="Documentation metadata">
        <span>Arc testnet</span>
        <span>ERC-8004</span>
        <span>x402 paid reads</span>
      </div>
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
        <span>This guide explains how to use the app: filing cases, choosing visibility, reading hearings, checking Arc receipts, linking Telegram, and using x402 records.</span>
      </div>
      <div className="reference-grid">
        {orderedSlugs.filter((slug) => slug !== 'overview').map((slug) => (
          <a href={docsHref(slug)} key={slug}>{docsPages[slug].title}</a>
        ))}
      </div>
    </>
  )
}

function UseCasesContent() {
  return (
    <>
      <p>Use Helia when a market question needs more than a quick opinion. The court produces a structured record: what was considered, how agents argued the uncertainty, what verdict was issued, and which receipts prove the result.</p>
      <div className="doc-table">
        {useCases.map(([name, detail]) => (
          <div key={name}>
            <strong>{name}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function CaseFlowContent() {
  return (
    <>
      <p>A case starts with a supported market URL, then moves through evidence gathering, argument, verdict generation, and receipt persistence. The case page becomes the record users return to.</p>
      <div className="step-grid">
        <article><strong>01</strong><h3>Petition</h3><p>Submit a Polymarket, Kalshi, or Manifold URL with budget, horizon, and visibility.</p></article>
        <article><strong>02</strong><h3>Evidence</h3><p>Witnesses collect market data, news, page text, screenshots, timelines, and source quality notes.</p></article>
        <article><strong>03</strong><h3>Argument</h3><p>Counsel builds Yes and No readings from the ledger so the judge can weigh the uncertainty.</p></article>
        <article><strong>04</strong><h3>Verdict</h3><p>Archon records probability, confidence, rationale, dissent, transcript pointers, and settlement rows.</p></article>
      </div>
    </>
  )
}

function VisibilityContent() {
  return (
    <>
      <p>Visibility controls where the case appears and who can open the full record. Payer visibility separately controls whether app and API receipt surfaces show the payer wallet.</p>
      <div className="doc-table">
        {visibilityRows.map(([name, detail]) => (
          <div key={name}>
            <strong>{name}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function AgentsContent() {
  return (
    <>
      <p>ERC-8004 represents Helia Court as the public service agent. The court roster remains inside Helia as operational agents with seats, schemas, permissions, fee quotes, and payout wallets.</p>
      <div className="agent-table">
        {courtAgents.map(([name, role, detail]) => (
          <article key={name}>
            <strong>{name}</strong>
            <span>{role}</span>
            <p>{detail}</p>
          </article>
        ))}
      </div>
    </>
  )
}

function VerdictsContent() {
  return (
    <>
      <p>A case detail page is not just a final answer. It is a record of the hearing: argument, uncertainty, evidence, receipts, and settlement information.</p>
      <div className="doc-table">
        {verdictRows.map(([name, detail]) => (
          <div key={name}>
            <strong>{name}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function ArcContent() {
  return (
    <>
      <p>Arc receipts make the court record easier to audit. Users can inspect the registered court identity, escrow address, transaction hashes, and settlement rows from case pages.</p>
      <dl>
        <div><dt>Agent</dt><dd>Helia Court</dd></div>
        <div><dt>Agent ID</dt><dd>20245</dd></div>
        <div><dt>Chain</dt><dd>Arc Testnet / eip155:5042002</dd></div>
        <div><dt>Identity Registry</dt><dd>0x8004A818BFB912233c491871b3d84c89A494BD9e</dd></div>
        <div><dt>Owner Wallet</dt><dd>0x90CBB847E0B2DF4b7aa03433fdD48E42587E2d31</dd></div>
        <div><dt>Agent URI</dt><dd>https://heliacourt.xyz/.well-known/erc8004-agent.json</dd></div>
        <div><dt>Case Escrow</dt><dd>0x93F3be6c7d12FbF37FF4C621902240e686E28ea8</dd></div>
      </dl>
      <a className="text-link" href="https://testnet.arcscan.app/tx/0xb0aa3a9ef0d05878def0523c730c018d85c8b0bc8cf45d47c0a0262b35444ea3">Registration transaction</a>
    </>
  )
}

function X402Content() {
  return (
    <>
      <p>Public browsing stays free. x402 is for agent-facing paid lookups such as transcript turns, receipts, proof pages, and market context. The filing flow still uses normal wallet USDC and Arc escrow.</p>
      <pre><code>{`BASE https://helia-courtbackend-production.up.railway.app

GET /x402/status
GET /x402/activity?caseId=:caseId

Paid resources:
GET /x402/price/:caseId
GET /x402/transcript/:caseId
GET /x402/receipts/:caseId
GET /x402/proof/:caseId`}</code></pre>
      <p>No filing escrow is touched by x402 reads. Public cases can be served through x402; unlisted and private records return 404 from the paid API layer.</p>
    </>
  )
}

function TelegramContent() {
  return (
    <>
      <p>Telegram is an opt-in companion surface. Users can open a dashboard, connect a wallet through a signed one-use challenge, inspect their account, view linked cases, and subscribe chats to case alerts.</p>
      <div className="step-grid">
        <article><strong>01</strong><h3>Start</h3><p>The bot replies to /dashboard, /help, /cases, /connect, /me, /notifications, and alert commands.</p></article>
        <article><strong>02</strong><h3>Link</h3><p>The bot creates a short-lived link token and sends users to the app profile linking flow.</p></article>
        <article><strong>03</strong><h3>Sign</h3><p>The app requests a wallet signature over the Telegram link challenge before attaching the chat account.</p></article>
        <article><strong>04</strong><h3>Operate</h3><p>Linked users can manage alerts, inspect case activity, and disconnect Telegram from the wallet.</p></article>
      </div>
    </>
  )
}

function BuildersContent() {
  return (
    <>
      <p>External agents should expose metadata, supported tools, pricing, payout wallets, schemas, and a history of useful testimony. Helia can route narrow evidence needs to external witnesses without changing the court engine.</p>
      <div className="checklist">
        <span>Stable endpoint and agent card</span>
        <span>Input and output schema versions</span>
        <span>Supported capabilities and markets</span>
        <span>Wallet for payouts and ownership</span>
        <span>Evidence citation policy</span>
      </div>
    </>
  )
}

function FaqContent() {
  return (
    <div className="doc-table">
      <div><strong>Is Helia deciding the real market?</strong><span>No. Helia produces an auditable court record and probability verdict. The original market operator still controls its own settlement rules.</span></div>
      <div><strong>Can I file private cases?</strong><span>Yes. Private cases are hidden from browse and require participant wallet unlock before details are returned.</span></div>
      <div><strong>Does x402 spend escrow funds?</strong><span>No. x402 reads are separate paid lookups for public records and do not touch filing escrow funds.</span></div>
      <div><strong>Can Telegram connect without a username?</strong><span>Yes. Telegram linking uses the Telegram user id and wallet signature, not only a public username.</span></div>
    </div>
  )
}
