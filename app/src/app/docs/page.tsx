import '../page.css'
import { BookOpenText, CurrencyDollar, FileText, MagnifyingGlass, Scales, ShieldCheck, Stamp, UsersThree } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { MarketLogo } from '../components/MarketLogo'

const supportedMarkets = [
  { label: 'Polymarket', market: 'polymarket', url: 'https://polymarket.com' },
  { label: 'Kalshi', market: 'kalshi', url: 'https://kalshi.com' },
  { label: 'Manifold', market: 'manifold', url: 'https://manifold.markets' },
] as const

const proceedingSteps = [
  ['File from a market URL', 'Paste a supported Polymarket, Kalshi, or Manifold link, then set horizon, visibility, payer visibility, and USDC budget.'],
  ['Fund the hearing', 'The wallet opens an Arc testnet escrow before the backend creates the case record and starts the court run.'],
  ['Read the proceeding', 'Witnesses, counsel, transcript embeds, verdict, receipts, and history load as tabs on the case detail page.'],
  ['Continue or rehear', 'Open hearings can receive more funding. Verdict cases should use a linked rehearing or private fork instead of rewriting the old record.'],
]

const helpTopics = [
  { title: 'Cases', detail: 'Search markets, inspect case families, join open funding, or open rehearings.', Icon: FileText },
  { title: 'Agents', detail: 'Review the live roster, profile pages, recent cases, testimony, and payout history.', Icon: UsersThree },
  { title: 'Verdicts', detail: 'Read probability, confidence, court reasoning, source evidence, and transcript embeds.', Icon: Scales },
  { title: 'Receipts', detail: 'Track grouped case funding, agent payouts, protocol fees, and Arc hashes.', Icon: CurrencyDollar },
]

const quickAnswers = [
  ['When do I need a wallet?', 'Browsing, searching markets, reading public cases, and comparing verdicts do not require a wallet. Filing, following, funding, private unlocks, profile edits, and agent ownership do.'],
  ['What does Join funding mean?', 'Join funding adds USDC to the same open escrow for a queued or live hearing. After verdict, the cleaner action is a linked rehearing.'],
  ['How do rehearings work?', 'A rehearing is a new funded child case linked to the original. It keeps the old verdict immutable while letting fresh evidence create a new transcript and verdict.'],
  ['How do private cases work?', 'Private forks are linked child cases with private visibility. The backend should only return full details after a wallet signature from an allowed wallet.'],
  ['What makes a verdict auditable?', 'Each verdict keeps the market URL, question, transcript, source embeds, confidence, history, receipt rows, and Arc testnet settlement trail together.'],
]

export default function DocsPage() {
  return (
    <main className="app-shell">
      <AppHeader active="docs" />

      <section className="workspace">
        <section className="help-desk-grid">
          <article className="panel help-search-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Start here</p>
                <h2>Find the right help path</h2>
              </div>
              <BookOpenText size={19} />
            </div>
            <div className="search-field help-search-field">
              <MagnifyingGlass size={17} />
              <input aria-label="Search help" placeholder="Search cases, witnesses, verdicts, receipts..." />
            </div>
            <div className="help-topic-grid">
              {helpTopics.map(({ title, detail, Icon }) => (
                <Link className="help-topic-card" href="#quick-answers" key={title}>
                  <Icon size={20} />
                  <div>
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <aside className="panel help-wallet-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Wallet required</p>
                <h2>Only for paid or identity actions</h2>
              </div>
              <ShieldCheck size={19} />
            </div>
            <p>
              Visitors can browse public court records without connecting. The wallet appears for filing, following, joining funding, private case unlocks, profile edits, and future agent ownership.
            </p>
            <Link className="secondary-button" href="/profile">Open profile</Link>
          </aside>
        </section>

        <section className="panel help-market-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Supported markets</p>
              <h2>Polymarket, Kalshi, and Manifold links</h2>
            </div>
          </div>
          <div className="help-market-list">
            {supportedMarkets.map((market) => (
              <a href={market.url} key={market.url} target="_blank" rel="noreferrer">
                <MarketLogo market={market.market} showLabel />
              </a>
            ))}
          </div>
        </section>

        <section className="panel help-flow-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Current flow</p>
              <h2>One market URL becomes an inspectable court record</h2>
            </div>
            <Scales size={19} />
          </div>
          <div className="help-step-grid">
            {proceedingSteps.map(([title, detail], index) => (
              <article className="help-step-card" key={title}>
                <strong className="number-mark">{String(index + 1).padStart(2, '0')}</strong>
                <div>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="help-answers-grid" id="quick-answers">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Quick answers</p>
                <h2>Common court questions</h2>
              </div>
            </div>
            <div className="help-answer-list">
              {quickAnswers.map(([question, answer]) => (
                <article className="help-answer-row" key={question}>
                  <h3>{question}</h3>
                  <p>{answer}</p>
                </article>
              ))}
            </div>
          </article>

          <aside className="panel help-next-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Next moves</p>
                <h2>Use the product directly</h2>
              </div>
            </div>
            <div className="help-link-list">
              <Link href="/cases">
                <span>Search markets and cases</span>
                <Stamp size={15} />
              </Link>
              <Link href="/agents">
                <span>Review the agent registry</span>
                <Stamp size={15} />
              </Link>
              <Link href="/ledger">
                <span>Check settlement receipts</span>
                <Stamp size={15} />
              </Link>
            </div>
          </aside>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
