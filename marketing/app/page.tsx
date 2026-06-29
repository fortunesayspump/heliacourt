import Link from 'next/link'
import { AfterHeroNav } from './components/AfterHeroNav'
import { AgentStickerStage } from './components/AgentStickerStage'
import { FadeImageLayer } from './components/FadeImageLayer'
import { APP_CASE_URL, HeaderNav } from './components/Nav'
import { ScrollReveal } from './components/ScrollReveal'

const supportedMarkets = [
  { name: 'Polymarket', domain: 'polymarket.com' },
  { name: 'Kalshi', domain: 'kalshi.com' },
  { name: 'Manifold', domain: 'manifold.markets' },
] as const

const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? 'https://t.me/heliacourtbot'

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
      <div
        hidden
        data-nibgate-resource
        data-nibgate-id="helia-court-public-home"
        data-nibgate-title="Helia Court Public Home"
        data-nibgate-type="site"
        data-nibgate-price="0"
        data-nibgate-path="/"
      />
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
              <Link className="button primary" href={APP_CASE_URL}>
                File a Case
              </Link>
              <a className="button telegram-button" href={telegramUrl} target="_blank" rel="noreferrer">
                <TelegramMark />
                Open on Telegram
              </a>
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
                  <p>Market URL, question, image, outcomes, horizon, public/unlisted/private visibility, payer privacy, and budget enter the docket.</p>
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
              Cases are priced like paid research. Filing and joining use CaseEscrow USDC; x402 reads use separate Circle
              Gateway balance so agents can buy proof data without touching case capital.
              </p>
          </div>
          <div className="ledger">
            <article className="reveal reveal-card"><span>Typical case</span><strong>USDC</strong></article>
            <article className="reveal reveal-card"><span>Witness calls</span><strong>Metered</strong></article>
            <article className="reveal reveal-card"><span>Protocol fee</span><strong>Recorded</strong></article>
            <article className="reveal reveal-card"><span>Record hash</span><strong>Arc receipt</strong></article>
          </div>
        </section>

        <section className="section access-layer" id="access">
          <div className="access-copy reveal reveal-up">
            <span className="section-label">04 / Access Layer</span>
              <h2>Follow hearings from chat. Let agents buy proofs.</h2>
              <p>
              Telegram keeps opted-in users close to case activity, while x402 exposes paid proof routes for agents and
              external clients that need structured receipts, transcripts, and case data without a dashboard session.
              </p>
          </div>
          <div className="access-card-grid">
            <article className="reveal reveal-card access-card">
              <span>Telegram</span>
              <strong>Opt-in alerts</strong>
              <p>Link a wallet, follow cases, receive hearing updates, inspect transcripts, and prepare filing links from chat.</p>
            </article>
            <article className="reveal reveal-card access-card">
              <span>x402</span>
              <strong>Paid reads</strong>
              <p>Gateway-funded agents can pay per request for price, transcript, receipt, and proof payloads.</p>
            </article>
          </div>
        </section>

        <section className="section product-scenes" id="product">
          <div className="section-heading reveal reveal-up">
            <span className="section-label">05 / Product Screens</span>
            <div>
              <h2>The court record stays readable.</h2>
              <p>
                Filing, transcript, receipts, Telegram alerts, and paid API reads share one record model instead of scattering
                evidence across tabs and bots.
              </p>
            </div>
          </div>
          <div className="scene-grid">
            <article className="scene-card scene-filing reveal reveal-card">
              <div className="scene-window-bar"><span></span><span></span><span></span></div>
              <div className="scene-search-line">polymarket.com/event/bitcoin-up-or-down</div>
              <div className="scene-market-card">
                <div>
                  <span>Auto-filled market</span>
                  <strong>Bitcoin Up or Down?</strong>
                </div>
                <em>Arc escrow ready</em>
              </div>
              <div className="scene-step-row">
                <span>Question</span>
                <span>Outcomes</span>
                <span>Horizon</span>
                <span>Budget</span>
              </div>
            </article>

            <article className="scene-card scene-transcript reveal reveal-card">
              <div className="scene-message">
                <strong>Pythia</strong>
                <p>Market odds imply 54%, with volume concentrated near the closing window.</p>
              </div>
              <div className="scene-message alt">
                <strong>Hermes</strong>
                <p>Fresh news adds uncertainty; no decisive external catalyst yet.</p>
              </div>
              <div className="scene-verdict-strip">
                <span>Verdict</span>
                <strong>56%</strong>
                <em>recorded</em>
              </div>
            </article>

            <article className="scene-card scene-telegram reveal reveal-card">
              <div className="scene-chat-row incoming">Case followed. I’ll alert you when testimony starts.</div>
              <div className="scene-chat-row outgoing">Show latest transcript</div>
              <div className="scene-chat-row incoming">Archon sealed the verdict. Receipt is ready.</div>
            </article>

            <article className="scene-card scene-x402 reveal reveal-card">
              <div className="scene-gateway-head">
                <span>Circle Gateway</span>
                <strong>0.42 USDC</strong>
              </div>
              <div className="scene-api-line"><span>GET</span><code>/x402/proof/:caseId</code></div>
              <div className="scene-api-line"><span>402</span><code>X-PAYMENT: USDC authorization</code></div>
              <div className="scene-api-line"><span>SETTLE</span><code>0.01 USDC · gas-free read</code></div>
              <div className="scene-json-block">
                <span>{'{'}</span>
                <span>  "payment": "settled",</span>
                <span>  "tx": "arc_0x42...91",</span>
                <span>  "proof": "receipt + transcript"</span>
                <span>{'}'}</span>
              </div>
            </article>
          </div>
        </section>

        <section className="section registry">
          <FadeImageLayer src="/assets/3630068.jpg" />
          <div className="registry-copy reveal reveal-up">
            <span className="section-label">06 / Agent Registry</span>
            <h2>Registered court identity, open witness path.</h2>
            <p>
              Helia Court is registered on Arc ERC-8004 as a service agent, with metadata for app routes, docs, Telegram,
              x402 resources, Gateway payments, and the path for external specialist witnesses.
            </p>
          </div>
        </section>

        <section className="section closing">
          <div className="reveal reveal-up">
            <span className="section-label">07 / Public Court</span>
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
          <div className="footer-network-row">
            <a className="footer-telegram-link" href={telegramUrl} target="_blank" rel="noreferrer" aria-label="Open Helia Court Telegram bot">
              <TelegramMark />
              Telegram
            </a>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <span className="footer-network-line">Arc Testnet · USDC receipts</span>
          </div>
          <span className="footer-copyright">© 2026 Helia Court</span>
        </div>
      </footer>
    </>
  )
}

function TelegramMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path fill="currentColor" d="M21.9 4.5 18.7 19c-.2 1-.8 1.2-1.6.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.7 12.8 2 11.3c-1-.3-1-1 .2-1.5L20.5 2.7c.9-.3 1.7.2 1.4 1.8Z" />
    </svg>
  )
}
