import { ArrowRight, Briefcase, Clock, Gavel } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'
import { CaseMarketIcon } from '../components/CaseMarketIcon'
import { type ApiCase, formatConfidence, formatUpdated, getBackendCases } from '../../lib/backend-data'
import '../page.css'
import './cases.css'

export default async function CasesPage() {
  const backendCases = await getBackendCases()

  return (
    <main className="app-shell">
      <AppHeader active="cases" />

      <section className="workspace">
        <PageTitle
          eyebrow="Docket"
          title="Cases"
          description="Track active prediction-market intelligence cases by odds, horizon, and hearing status."
          imageSrc="/assets/socrates.1400x0.jpg"
          imagePosition="center 38%"
          actions={
            <Link className="primary-button" href="/cases/new">
              File case
              <ArrowRight size={16} />
            </Link>
          }
        />

        <section className="cases-docket-panel">
          <div className="cases-market-heading">
            <div>
              <p className="eyebrow">Prediction docket</p>
              <h2>Markets under review</h2>
              <span>{backendCases.length} backend case{backendCases.length === 1 ? '' : 's'} synced</span>
            </div>
            <Briefcase size={20} />
          </div>

          {backendCases.length ? (
          <div className="docket-case-grid">
            {backendCases.map((item) => {
              const marketLink = getPredictionMarketLink(item)
              const provider = marketLink ? formatMarketProvider(marketLink) : item.market ?? 'Market source missing'
              const probability = item.probability ?? formatConfidence(item.confidence)
              const budget = item.onchain?.budgetUsdc ? `${item.onchain.budgetUsdc} USDC` : 'Not funded'

              return (
              <article className="docket-case-card" key={item.id}>
                <div className="docket-case-card-head">
                  <CaseMarketIcon url={marketLink} title={item.title} />
                  <div>
                    <Link href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                      <h3>{item.title}</h3>
                    </Link>
                    <span>{provider}</span>
                  </div>
                  <strong className="case-status-pill">{item.status}</strong>
                </div>

                <div className="docket-case-card-main">
                  <p>{item.resolution ?? item.verdict ?? 'Live hearing record pending.'}</p>
                </div>

                <div className="case-market-lines">
                  <div>
                    <span>Probability</span>
                    <strong>{probability}</strong>
                  </div>
                  <div>
                    <span>Horizon</span>
                    <strong>{item.horizon ?? 'Open'}</strong>
                  </div>
                  <div>
                    <span>Budget</span>
                    <strong>{budget}</strong>
                  </div>
                </div>

                <div className="case-market-foot">
                  <span>{shortCaseId(item.id)}</span>
                  <span>{item.witnesses?.length ?? 0} witness{(item.witnesses?.length ?? 0) === 1 ? '' : 'es'}</span>
                  <span>
                    <Clock size={13} />
                    {formatUpdated(item.updated)}
                  </span>
                </div>

                <div className="docket-case-card-actions">
                  {marketLink ? (
                    <a className="market-source-link" href={marketLink} target="_blank" rel="noreferrer">
                      Market
                    </a>
                  ) : (
                    <span className="market-source-link disabled">No source</span>
                  )}
                  <Link className="docket-case-card-link" href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                    Open
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
              )
            })}
          </div>
          ) : (
            <div className="empty-state">
              <h3>No backend hearings yet</h3>
              <p>File a case to create the first live docket record. The docket reads backend records only.</p>
              <Link className="primary-button" href="/cases/new">
                File case
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>

        <section className="metrics-grid">
          <div className="metric">
            <Briefcase size={19} />
            <div>
              <span>Drafts</span>
              <strong>{backendCases.filter((item) => item.status === 'Queued').length} cases</strong>
            </div>
          </div>
          <div className="metric">
            <Gavel size={19} />
            <div>
              <span>In hearing</span>
              <strong>{backendCases.filter((item) => item.status === 'Hearing').length} cases</strong>
            </div>
          </div>
          <div className="metric">
            <Clock size={19} />
            <div>
              <span>Awaiting vote</span>
              <strong>{backendCases.filter((item) => item.status === 'Queued' || item.status === 'Hearing').length} cases</strong>
            </div>
          </div>
          <div className="metric">
            <ArrowRight size={19} />
            <div>
              <span>Settled today</span>
              <strong>{backendCases.filter((item) => item.status === 'Verdict').length} receipts</strong>
            </div>
          </div>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}

function getPredictionMarketLink(item: ApiCase) {
  const links = item.links ?? []
  return links.find((link) => {
    try {
      const host = new URL(link).hostname.replace(/^www\./, '')
      return ['polymarket.com', 'kalshi.com', 'manifold.markets'].some((supported) => host === supported || host.endsWith(`.${supported}`))
    } catch {
      return false
    }
  }) ?? links[0]
}

function formatMarketProvider(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('polymarket')) return 'Polymarket'
    if (host.includes('kalshi')) return 'Kalshi'
    if (host.includes('manifold')) return 'Manifold'
    return host
  } catch {
    return 'Prediction market'
  }
}

function shortCaseId(id: string) {
  if (id.startsWith('0x') && id.length > 18) return `${id.slice(0, 8)}...${id.slice(-6)}`
  if (id.length > 18) return `${id.slice(0, 12)}...`
  return id
}
