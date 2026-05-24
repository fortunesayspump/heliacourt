import Link from 'next/link'
import { MarketLogo } from './MarketLogo'

const supportedMarkets = [
  { market: 'polymarket', url: 'https://polymarket.com' },
  { market: 'kalshi', url: 'https://kalshi.com' },
  { market: 'manifold', url: 'https://manifold.markets' },
] as const

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div>
          <Link className="footer-wordmark" href="/" aria-label="Helia Court home">Helia Court</Link>
          <p>Prediction-market hearings, Arc testnet settlement, and auditable verdict records.</p>
        </div>

        <div className="footer-link-stack">
          <div className="footer-market-row" aria-label="Supported markets and network">
            {supportedMarkets.map((market) => (
              <a href={market.url} key={market.url} target="_blank" rel="noreferrer">
                <MarketLogo market={market.market} />
              </a>
            ))}
          </div>
          <span className="footer-copyright">© 2026 Helia Court</span>
          <span className="footer-network-line">Arc Testnet · USDC receipts</span>
        </div>
      </div>
    </footer>
  )
}
