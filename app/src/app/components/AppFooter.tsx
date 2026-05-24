import Link from 'next/link'
import { TelegramLogo } from '@phosphor-icons/react/ssr'
import { MarketLogo } from './MarketLogo'

const supportedMarkets = [
  { market: 'polymarket', url: 'https://polymarket.com' },
  { market: 'kalshi', url: 'https://kalshi.com' },
  { market: 'manifold', url: 'https://manifold.markets' },
] as const

const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? 'https://t.me/heliacourtbot'

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
          <div className="footer-network-row">
            <a className="footer-telegram-link" href={telegramUrl} target="_blank" rel="noreferrer">
              <TelegramLogo size={16} weight="fill" />
              Telegram
            </a>
            <span className="footer-network-line">Arc Testnet · USDC receipts</span>
          </div>
          <span className="footer-copyright">© 2026 Helia Court</span>
        </div>
      </div>
    </footer>
  )
}
