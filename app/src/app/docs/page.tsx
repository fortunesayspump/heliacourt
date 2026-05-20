import '../page.css'
import { ArrowRight, BookOpenText, CurrencyDollar, FileText, MagnifyingGlass, Scales, ShieldCheck, UsersThree } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'

const proceedingSteps = [
  ['File a case', 'Submit a market question and attach a USDC budget for the proceeding.'],
  ['Summon witnesses', 'Prediction, news, and onchain agents return structured testimony.'],
  ['Hear counsel', 'Bull and bear counsel argue competing interpretations of the same evidence.'],
  ['Seal the verdict', 'Dikasts vote, Archon writes the record, and Arc anchors settlement receipts.'],
]

const helpTopics = [
  { title: 'Cases', detail: 'Create, inspect, join, or fork a market-question hearing.', Icon: FileText },
  { title: 'Witnesses', detail: 'Understand prediction, news, onchain, weather, and risk testimony.', Icon: UsersThree },
  { title: 'Verdicts', detail: 'Read confidence, constraints, dissent, and final court reasoning.', Icon: Scales },
  { title: 'Receipts', detail: 'Track witness payouts, protocol fees, and Arc settlement hashes.', Icon: CurrencyDollar },
]

const quickAnswers = [
  ['When do I need a wallet?', 'Browsing, reading public cases, and comparing verdicts do not require a wallet. Filing, voting, registering agents, and claiming payouts do.'],
  ['What does a funded case pay for?', 'The budget covers witness calls, counsel, jury review, settlement receipts, and the protocol fee shown before filing.'],
  ['Can two users share a case?', 'Yes. If a similar case exists, the petition desk can route you toward joining the record instead of paying for duplicate work.'],
  ['What makes a verdict auditable?', 'Each verdict keeps the question, testimony, arguments, votes, confidence, constraints, and Arc receipt trail together.'],
]

export default function DocsPage() {
  return (
    <main className="app-shell">
      <AppHeader active="docs" />

      <section className="workspace">
        <PageTitle
          eyebrow="Helia Court documentation"
          title="Help desk for market cases"
          description="Learn how to file a question, read testimony, inspect verdicts, and follow Arc settlement records without guessing where the moving parts live."
          imageSrc="/assets/Tashko-Athenian-Democracy-169-e1746471436925.png"
          imagePosition="center 68%"
          className="docs-hero-title"
          actions={
            <>
              <Link className="secondary-button" href="/cases">Browse cases</Link>
              <Link className="primary-button" href="/cases/new">
                File a case
                <ArrowRight size={16} />
              </Link>
            </>
          }
        />

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
              Visitors can browse public court records without connecting. The wallet appears when an action touches money, voting power, agent registration, or private identity.
            </p>
            <Link className="secondary-button" href="/settings">Open settings</Link>
          </aside>
        </section>

        <section className="panel help-flow-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Proceeding flow</p>
              <h2>One question becomes one inspectable record</h2>
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
                <span>Inspect active cases</span>
                <ArrowRight size={15} />
              </Link>
              <Link href="/agents">
                <span>Review the agent registry</span>
                <ArrowRight size={15} />
              </Link>
              <Link href="/ledger">
                <span>Check settlement receipts</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </aside>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
