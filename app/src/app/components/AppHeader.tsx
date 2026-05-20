import {
  BookOpenText,
  Briefcase,
  SquaresFour,
  UserCircleCheck,
  Wallet,
} from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { WalletButton } from './WalletButton'

type AppHeaderProps = {
  active: 'dashboard' | 'cases' | 'new-case' | 'agents' | 'ledger' | 'settings' | 'docs' | 'profile'
}

const navItems = [
  { key: 'dashboard', label: 'Dashboard', href: '/', icon: SquaresFour },
  { key: 'cases', label: 'Cases', href: '/cases', icon: Briefcase },
  { key: 'agents', label: 'Agents', href: '/agents', icon: UserCircleCheck },
  { key: 'ledger', label: 'Ledger', href: '/ledger', icon: Wallet },
  { key: 'docs', label: 'Help', href: '/docs', icon: BookOpenText },
] as const

export function AppHeader({ active }: AppHeaderProps) {
  return (
    <header className="app-topnav">
      <div className="topnav-brand">
        <Link className="app-brand" href="/" aria-label="Helia Court home" />
      </div>

      <nav className="app-nav topnav-links" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <Link className={active === item.key ? 'active' : undefined} href={item.href} key={item.key}>
              <Icon size={17} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="app-header-wallet">
        <WalletButton className="wallet-connect-button" />
      </div>
    </header>
  )
}
