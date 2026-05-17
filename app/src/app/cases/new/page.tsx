import { ArrowRight, CurrencyDollar, BookOpenText, GitFork, MagnifyingGlass, Scales, ShieldCheck, UserCircleCheck } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { PageTitle } from '../../components/PageTitle'
import { WalletNotice } from '../../components/WalletNotice'
import { similarCaseCandidates } from '../../../data/cases'
import '../../page.css'

const witnessOptions = [
  ['Prediction markets', 'Pythia', 'Odds, spreads, liquidity, implied probability'],
  ['Web and news search', 'Hermes', 'Fresh articles, source quality, event clustering'],
  ['Onchain flows', 'Argos', 'Wallet movement, exchange flows, stablecoin pressure'],
  ['Weather/data APIs', 'Notus', 'Weather, sports, macro calendars, external datasets'],
  ['Risk limits', 'Phylax', 'Uncertainty, manipulation risk, liquidity, invalidation'],
]

export default function NewCasePage() {
  return (
    <main className="app-shell">
      <AppHeader active="new-case" />

      <section className="workspace">
        <PageTitle
          eyebrow="Petition desk"
          title="File a prediction case"
          description="Define the market question, choose the hearing depth, set visibility, and let the court seat the right witnesses before budget is reserved."
          imageSrc="/assets/socrates-address-louis-joseph-lebrun-1867-credit-public-domain-wikimedia-commons.jpeg"
          imagePosition="center 42%"
          actions={
            <>
              <Link className="secondary-button" href="/cases">Cancel</Link>
              <a className="primary-button" href="#case-preview">
                Preview case
                <ArrowRight size={16} />
              </a>
            </>
          }
        />

        <WalletNotice
          title="Fund the case budget before the court starts"
          detail="Standard prediction hearings usually reserve 5-10 USDC so witnesses can be questioned more than once before the verdict."
          action="Connect and fund"
        />

        <section className="form-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Case brief</p>
                <h2>Market question</h2>
              </div>
            </div>
            <div className="case-box case-form">
              <label htmlFor="question">Question</label>
              <textarea id="question" defaultValue="Will ETH outperform SOL over the next 7 days?" />
              <label htmlFor="horizon">Time horizon</label>
              <input id="horizon" defaultValue="7 days" />
              <label htmlFor="budget">Maximum court budget</label>
              <input id="budget" defaultValue="8.00 USDC" />
              <label htmlFor="hearing-type">Hearing type</label>
              <input id="hearing-type" defaultValue="Standard hearing, verdict only" />
              <label htmlFor="visibility">Visibility</label>
              <input id="visibility" defaultValue="Public verdict, private payer" />
            </div>
          </section>

          <aside className="panel similar-case-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Similarity check</p>
                <h2>Existing hearings found</h2>
              </div>
              <MagnifyingGlass size={19} />
            </div>
            <p className="panel-copy">
              Before funding, the court checks whether this question already has an active or recent record.
            </p>
            <div className="similar-case-list">
              {similarCaseCandidates.map((item) => (
                <article className="similar-case-card" key={item.id}>
                  <div>
                    <span className="state-dot active">{item.match}</span>
                    <span className="muted-inline">{item.status}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.reason}</p>
                  <strong>{item.recommendation}</strong>
                  <Link href={`/cases/${item.id}`}>
                    {item.action}
                    <ArrowRight size={15} />
                  </Link>
                </article>
              ))}
            </div>
          </aside>

          <aside className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Witness bench</p>
                <h2>Court-selected agents</h2>
              </div>
              <UserCircleCheck size={19} />
            </div>
            <p className="panel-copy">
              Heliaia seats witnesses from the case brief, market type, horizon, and budget. Users do not manually pick agents for the MVP.
            </p>
            <div className="compact-list">
              {witnessOptions.map(([category, agent, detail]) => (
                <article className="witness-option" key={category}>
                  <span>{category}</span>
                  <strong>{agent}</strong>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </aside>

          <aside className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Settlement</p>
                <h2>Budget preview</h2>
              </div>
              <CurrencyDollar size={19} />
            </div>
            <div className="settlement-table">
              <div>
                <span>Witness rounds</span>
                <strong>4.20 USDC</strong>
              </div>
              <div>
                <span>Counsel and jury</span>
                <strong>2.40 USDC</strong>
              </div>
              <div>
                <span>Protocol fee</span>
                <strong>0.60 USDC</strong>
              </div>
              <div>
                <span>Reserved total</span>
                <strong>7.20 USDC</strong>
              </div>
            </div>
            <button className="primary-button full-width wallet-primary" type="button">
              Connect wallet to reserve budget
            </button>
            <div className="direction-strip inline-strip">
              <ShieldCheck size={19} />
              <p>Agent payouts stay scoped to the approved budget before the court begins.</p>
            </div>
          </aside>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Case routing</p>
              <h2>Choose how this question should proceed</h2>
            </div>
            <GitFork size={19} />
          </div>
          <div className="route-choice-grid">
            <article>
              <span>01</span>
              <h3>Join existing case</h3>
              <p>Add funding, follow updates, and receive access to the shared verdict without duplicating work.</p>
              <button type="button">Join active hearing</button>
            </article>
            <article>
              <span>02</span>
              <h3>Request fresh hearing</h3>
              <p>Run an updated hearing when market conditions changed after the original court record.</p>
              <button type="button">Refresh verdict</button>
            </article>
            <article>
              <span>03</span>
              <h3>Open private fork</h3>
              <p>Keep the same market question private with custom context, budget, resolution notes, or constraints.</p>
              <button type="button">Fork privately</button>
            </article>
          </div>
        </section>

        <section className="panel case-preview-panel" id="case-preview">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Draft preview</p>
              <h2>Review before filing</h2>
            </div>
            <BookOpenText size={19} />
          </div>

          <div className="case-preview-grid">
            <article className="case-box preview-summary">
              <div>
                <p className="eyebrow">Case question</p>
                <h3>Will ETH outperform SOL over the next 7 days?</h3>
              </div>
              <p>
                The court will seat market, onchain, news, and risk witnesses before counsel argues both sides
                and the dikasts produce a signed verdict record. Heliaia may question witnesses again when counsel finds contradictions.
              </p>
              <div className="preview-pill-row">
                <span>7 day horizon</span>
                <span>Standard hearing</span>
                <span>Public verdict</span>
                <span>Joinable match found</span>
                <span>8.00 USDC max</span>
              </div>
            </article>

            <article className="case-box">
              <p className="eyebrow">Auto-seated bench</p>
              <div className="preview-witness-list">
                {witnessOptions.map(([category, agent]) => (
                  <div key={category}>
                    <span>{category}</span>
                    <strong>{agent}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="case-box">
              <p className="eyebrow">Settlement route</p>
              <div className="preview-route">
                <Scales size={19} />
                <p>Choose join, refresh, or private fork first. Then reserve budget, pay summoned agents, store the receipt, and release payouts after verdict.</p>
              </div>
            </article>

            <article className="case-box">
              <p className="eyebrow">Budget check</p>
              <div className="settlement-table preview-budget">
                <div>
                  <span>Estimated spend</span>
                  <strong>7.20 USDC</strong>
                </div>
                <div>
                  <span>Unspent reserve</span>
                  <strong>0.80 USDC</strong>
                </div>
              </div>
            </article>
          </div>

          <div className="preview-actions">
            <a className="secondary-button" href="#question">Back to edit</a>
            <button className="primary-button wallet-primary" type="button">
              File case
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
