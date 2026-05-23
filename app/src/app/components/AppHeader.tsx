import Link from 'next/link'
import { NotificationsMenu } from './NotificationsMenu'
import { GatewayBalance } from './GatewayBalance'
import { WalletBalance } from './WalletBalance'
import { WalletButton } from './WalletButton'

type AppHeaderProps = {
  active: 'dashboard' | 'cases' | 'new-case' | 'agents' | 'ledger' | 'x402' | 'docs' | 'profile'
}

const navItems = [
  { key: 'dashboard', label: 'Dashboard', href: '/' },
  { key: 'cases', label: 'Cases', href: '/cases' },
  { key: 'agents', label: 'Agents', href: '/agents' },
  { key: 'ledger', label: 'Ledger', href: '/ledger' },
  { key: 'x402', label: 'x402', href: '/x402' },
  { key: 'docs', label: 'Help', href: '/docs' },
] as const

export function AppHeader({ active }: AppHeaderProps) {
  return (
    <header className="app-topnav">
      <div className="app-topnav-inner">
        <div className="topnav-brand">
          <Link className="app-brand" href="/" aria-label="Helia Court home" />
        </div>

        <nav className="app-nav topnav-links" aria-label="Primary">
          {navItems.map((item) => (
            <Link className={active === item.key ? 'active' : undefined} href={item.href} key={item.key}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-header-wallet">
          <NotificationsMenu />
          <WalletBalance compact label="Wallet" />
          <GatewayBalance compact />
          <WalletButton className="wallet-connect-button" />
        </div>
      </div>
    </header>
  )
}
