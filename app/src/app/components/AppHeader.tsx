import Link from 'next/link'
import { Briefcase, CurrencyCircleDollar, House, Question, Receipt, UsersThree } from '@phosphor-icons/react/ssr'
import { NotificationsMenu } from './NotificationsMenu'
import { GatewayBalance } from './GatewayBalance'
import { WalletBalance } from './WalletBalance'
import { WalletButton } from './WalletButton'

type AppHeaderProps = {
  active: 'dashboard' | 'cases' | 'new-case' | 'agents' | 'ledger' | 'x402' | 'docs' | 'profile'
}

const navItems = [
  { key: 'dashboard', label: 'Dashboard', href: '/', icon: House },
  { key: 'cases', label: 'Cases', href: '/cases', icon: Briefcase },
  { key: 'agents', label: 'Agents', href: '/agents', icon: UsersThree },
  { key: 'ledger', label: 'Ledger', href: '/ledger', icon: Receipt },
  { key: 'x402', label: 'x402', href: '/x402', icon: CurrencyCircleDollar },
  { key: 'docs', label: 'Help', href: '/help', icon: Question },
] as const

export function AppHeader({ active }: AppHeaderProps) {
  return (
    <header className="app-topnav">
      <div className="app-topnav-inner">
        <div className="topnav-brand">
          <Link className="app-brand" href="/" aria-label="Helia Court home" />
        </div>

        <nav className="app-nav topnav-links" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <Link className={active === item.key ? 'active' : undefined} href={item.href} key={item.key} aria-label={item.label}>
                <Icon className="app-nav-icon" size={20} weight="regular" />
                <span className="app-nav-label">{item.label}</span>
              </Link>
            )
          })}
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
