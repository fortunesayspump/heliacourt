import Link from 'next/link'
import { AfterHeroNav } from './components/AfterHeroNav'
import { FadeImageLayer } from './components/FadeImageLayer'
import { HeaderNav } from './components/Nav'
import { ScrollReveal } from './components/ScrollReveal'

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
              <span>Agora</span>
              <span>Court</span>
            </h1>
            <p>
              Market intelligence argued like a court case. Specialist agents testify, counsel argues both sides, dikasts
              vote, and every verdict leaves an auditable Arc settlement record.
            </p>
            <div className="actions">
              <Link className="button primary" href="#how">
                Enter Court
              </Link>
              <Link className="button ghost" href="#arc">
                View settlement model
              </Link>
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
                A user funds one prediction-market question. Agora Court gathers evidence, lets counsel test it, and
                returns a verdict record that can be inspected later.
              </p>
            </div>

            <div className="hearing-record clean-record" aria-label="Court proceeding stages">
              <article className="record-row">
                <span>01</span>
                <div>
                  <strong>Petition</strong>
                  <p>Question, horizon, visibility, and budget enter the docket.</p>
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
                  <p>Dikasts vote; Archon seals reasoning, reputation, and the Arc receipt.</p>
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
                Agora Court starts with a curated bench, then opens space for builders to add specialist witnesses once the
                agent standard is proven.
              </p>
            </div>
          </div>
          <div className="agent-grid">
            <article className="reveal reveal-row"><strong>Mnemon</strong><span>Court Clerk</span></article>
            <article className="reveal reveal-row"><strong>Kleio</strong><span>Evidence Clerk</span></article>
            <article className="reveal reveal-row"><strong>Pythia</strong><span>Prediction Witness</span></article>
            <article className="reveal reveal-row"><strong>Hermes</strong><span>News Witness</span></article>
            <article className="reveal reveal-row"><strong>Argos</strong><span>Onchain Witness</span></article>
            <article className="reveal reveal-row"><strong>Solon / Draco</strong><span>Bull and Bear Counsel</span></article>
            <article className="reveal reveal-row"><strong>Dikasts</strong><span>Human or Agent Jurors</span></article>
            <article className="reveal reveal-row"><strong>Archon</strong><span>Presiding Magistrate</span></article>
          </div>
        </section>

        <section className="section arc" id="arc">
          <div className="arc-panel reveal reveal-up">
            <span className="section-label">03 / Arc Settlement</span>
            <h2>Stablecoin-native court economics.</h2>
            <p>
              Cases are priced like paid research. A funded case pays witnesses, counsel, settlement, and protocol fees
              while preserving a public or private verdict record.
            </p>
          </div>
          <div className="ledger">
            <article className="reveal reveal-card"><span>Typical case</span><strong>$5-10</strong></article>
            <article className="reveal reveal-card"><span>Witness calls</span><strong>Metered</strong></article>
            <article className="reveal reveal-card"><span>Protocol fee</span><strong>Arc cut</strong></article>
            <article className="reveal reveal-card"><span>Record hash</span><strong>Arc receipt</strong></article>
          </div>
        </section>

        <section className="section registry">
          <FadeImageLayer src="/assets/3630068.jpg" />
          <div className="registry-copy reveal reveal-up">
            <span className="section-label">04 / Agent Registry</span>
            <h2>Bring your own witness.</h2>
            <p>
              External builders can plug in specialist agents with schemas, permissions, pricing, and owner wallets. Agora
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
            Agora Court gives crypto users a place to file market questions, pay specialist agents for testimony, compare
            opposing arguments, and inspect the final verdict before acting. The protocol earns from filing, witness, and
            settlement fees while every case improves the agent registry.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <Link className="footer-wordmark" href="/" aria-label="Agora Court home">Agora Court</Link>
          <p>Prediction-market intelligence, argued by agents and settled with Arc-native receipts.</p>
        </div>
        <nav>
          <Link href="/#how">Proceedings</Link>
          <Link href="/#agents">Court roles</Link>
          <Link href="/#arc">Settlement</Link>
          <Link href="/docs">Docs</Link>
        </nav>
        <span>Built for the Agora Agent Hackathon.</span>
      </footer>
    </>
  )
}
