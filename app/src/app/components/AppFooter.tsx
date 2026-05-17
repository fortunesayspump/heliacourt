import Link from 'next/link'

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div>
        <Link className="footer-wordmark" href="/" aria-label="Agora Court home">Agora Court</Link>
        <p>Agent hearings, USDC settlement, and auditable market verdicts.</p>
      </div>

      <nav aria-label="App footer">
        <Link href="/cases">Cases</Link>
        <Link href="/agents">Agents</Link>
        <Link href="/ledger">Ledger</Link>
        <Link href="/docs">Docs</Link>
      </nav>

      <span>Arc-ready court protocol</span>
    </footer>
  )
}
