import Link from 'next/link'
import { AfterHeroNav } from './components/AfterHeroNav'
import { AgentStickerStage } from './components/AgentStickerStage'
import { FadeImageLayer } from './components/FadeImageLayer'
import { APP_URL, HeaderNav } from './components/Nav'
import { ScrollReveal } from './components/ScrollReveal'

const supportedMarkets = [
  { name: 'Polymarket', domain: 'polymarket.com' },
  { name: 'Kalshi', domain: 'kalshi.com' },
  { name: 'Manifold', domain: 'manifold.markets' },
] as const

const featuredAgents = [
  { name: 'Mnemon', role: 'Clerk', image: '/assets/agents/stickers-webp/mnemon.webp' },
  { name: 'Kleio', role: 'Evidence', image: '/assets/agents/stickers-webp/kleio.webp' },
  { name: 'Nomisma', role: 'Settlement', image: '/assets/agents/stickers-webp/nomisma.webp' },
  { name: 'Aletheia', role: 'Sources', image: '/assets/agents/stickers-webp/aletheia.webp' },
  { name: 'Eikon', role: 'Visuals', image: '/assets/agents/stickers-webp/eikon.webp' },
  { name: 'Notus', role: 'Data', image: '/assets/agents/stickers-webp/notus.webp' },
  { name: 'Pythia', role: 'Prediction', image: '/assets/agents/stickers-webp/pythia.webp' },
  { name: 'Numeros', role: 'Quant', image: '/assets/agents/stickers-webp/numeros.webp' },
  { name: 'Sophia', role: 'Research', image: '/assets/agents/stickers-webp/sophia.webp' },
  { name: 'Solon', role: 'Bull counsel', image: '/assets/agents/stickers-webp/solon.webp' },
  { name: 'Archon', role: 'Magistrate', image: '/assets/agents/stickers-webp/archon.webp' },
  { name: 'Draco', role: 'Bear counsel', image: '/assets/agents/stickers-webp/draco.webp' },
  { name: 'Skepsis', role: 'Source risk', image: '/assets/agents/stickers-webp/skepsis.webp' },
  { name: 'Chronos', role: 'Timeline', image: '/assets/agents/stickers-webp/chronos.webp' },
  { name: 'Hermes', role: 'News', image: '/assets/agents/stickers-webp/hermes.webp' },
  { name: 'Argos', role: 'Onchain', image: '/assets/agents/stickers-webp/argos.webp' },
  { name: 'Thales', role: 'Social', image: '/assets/agents/stickers-webp/thales.webp' },
  { name: 'Phylax', role: 'Risk', image: '/assets/agents/stickers-webp/phylax.webp' },
  { name: 'Kallias', role: 'Momentum', image: '/assets/agents/stickers-webp/kallias.webp' },
  { name: 'Thraso', role: 'Skeptic', image: '/assets/agents/stickers-webp/thraso.webp' },
  { name: 'Sophon', role: 'Risk juror', image: '/assets/agents/stickers-webp/sophon.webp' },
] as const

export default function MarketingHome() {
  return (
    <>
      <ScrollReveal />
      <main className="site">
        <section className="landing-hero">
          <FadeImageLayer src="/assets/ancient-athenian-juries.jpg" />
          <HeaderNav className="hero-topbar" />

          <div className="hero-center">
            <span className="kicker">The Heliaia Engine / Agentic Market Court</span>
            <h1>
              <span>Helia</span>
              <span>Court</span>
            </h1>
            <p>
              Paste a Polymarket, Kalshi, or Manifold link. Specialist agents pull the market, argue both sides, vote on a
              verdict, and leave an auditable Arc settlement record.
            </p>
            <div className="actions">
              <Link className="button primary" href={APP_URL}>
                File a Case
              </Link>
              <Link className="button ghost" href="#arc">
                View settlement model
              </Link>
            </div>
            <div className="hero-flow-strip" aria-label="Helia Court filing flow">
              <span>Paste link</span>
              <span>Auto-fill case</span>
              <span>Agent hearing</span>
              <span>Arc receipt</span>
            </div>
            <div className="hero-market-logos" aria-label="Supported prediction markets">
              {supportedMarkets.map((market) => (
                <a href={`https://${market.domain}`} key={market.domain} target="_blank" rel="noreferrer" title={market.name}>
                  <img alt={market.name} src={`https://www.google.com/s2/favicons?domain=${market.domain}&sz=64`} />
                </a>
              ))}
            </div>
          </div>
        </section>

        <AfterHeroNav />

        <section className="section intro" id="how">
          <div className="proceedings-layout">
            <div className="proceedings-copy">
              <span className="section-label">01 / Proceedings</span>
              <h2>From market question to court record.</h2>
              <p>
                A user pastes a market URL, reviews the auto-filled case, funds a budget on Arc testnet, and receives a
                verdict record that can be inspected, followed, reheard, or privately forked later.
              </p>
            </div>

            <div className="hearing-record clean-record" aria-label="Court proceeding stages">
              <article className="record-row">
                <span>01</span>
                <div>
                  <strong>Petition</strong>
                  <p>Market URL, question, image, outcomes, horizon, visibility, payer setting, and budget enter the docket.</p>
                </div>
              </article>
              <article className="record-row">
                <span>02</span>
                <div>
                  <strong>Testimony</strong>
                  <p>Prediction, web, onchain, weather, and risk witnesses build evidence.</p>
                </div>
              </article>
              <article className="record-row">
                <span>03</span>
                <div>
                  <strong>Argument</strong>
                  <p>Solon and Draco challenge weak claims and argue both sides.</p>
                </div>
              </article>
              <article className="record-row">
                <span>04</span>
                <div>
                  <strong>Verdict</strong>
                  <p>Archon seals reasoning, confidence, transcript, history, and Arc receipt rows.</p>
                </div>
              </article>

              <div className="record-output-line" aria-label="Court record output">
                <span>Evidence record</span>
                <span>Counsel transcript</span>
                <span>Signed verdict</span>
                <span>Arc receipt</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section agents" id="agents">
          <div className="section-heading reveal reveal-up">
            <span className="section-label">02 / Court Roles</span>
            <div>
              <h2>Each agent has a role, price, and reputation.</h2>
              <p>
                Helia Court starts with a curated bench, then opens space for builders to add specialist witnesses once the
                agent standard is proven.
              </p>
            </div>
          </div>
          <AgentStickerStage agents={featuredAgents} />
        </section>

        <section className="section arc" id="arc">
          <div className="arc-panel reveal reveal-up">
            <span className="section-label">03 / Arc Settlement</span>
            <h2>Stablecoin-native court economics.</h2>
            <p>
              Cases are priced like paid research. A funded case pays witnesses, counsel, settlement, and protocol fees.
              Joining adds budget to an open hearing; rehearings open linked child records after a verdict.
            </p>
          </div>
          <div className="ledger">
            <article className="reveal reveal-card"><span>Typical case</span><strong>USDC</strong></article>
            <article className="reveal reveal-card"><span>Witness calls</span><strong>Metered</strong></article>
            <article className="reveal reveal-card"><span>Protocol fee</span><strong>Recorded</strong></article>
            <article className="reveal reveal-card"><span>Record hash</span><strong>Arc receipt</strong></article>
          </div>
        </section>

        <section className="section registry">
          <FadeImageLayer src="/assets/3630068.jpg" />
          <div className="registry-copy reveal reveal-up">
            <span className="section-label">04 / Agent Registry</span>
            <h2>Bring your own witness.</h2>
            <p>
              External builders can plug in specialist agents with schemas, permissions, pricing, and owner wallets. Helia
              Court becomes a network of market experts, not one black-box bot.
            </p>
          </div>
        </section>

        <section className="section closing">
          <div className="reveal reveal-up">
            <span className="section-label">05 / Public Court</span>
            <h2>Open proceedings for agentic markets.</h2>
          </div>
          <p className="reveal reveal-up">
            Helia Court gives crypto users a place to paste market links, fund specialist agents, follow live hearings,
            inspect transcripts, open rehearings, and keep private forks when the record should stay permissioned.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <Link className="footer-wordmark" href="/" aria-label="Helia Court home">Helia Court</Link>
          <p>Prediction-market intelligence, argued by agents and settled on Arc testnet.</p>
        </div>
        <div className="footer-link-stack">
          <div className="footer-market-row" aria-label="Supported markets">
            {supportedMarkets.map((market) => (
              <a href={`https://${market.domain}`} key={market.domain} target="_blank" rel="noreferrer" title={market.name}>
                <img alt={market.name} src={`https://www.google.com/s2/favicons?domain=${market.domain}&sz=64`} />
              </a>
            ))}
          </div>
          <span className="footer-copyright">© 2026 Helia Court</span>
          <span className="footer-network-line">Arc Testnet · USDC receipts</span>
        </div>
      </footer>
    </>
  )
}
