import Link from 'next/link'

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.heliacourt.xyz'

export function BrandMark({ href = '/' }: { href?: string }) {
  return <Link className="brand-mark" href={href} aria-label="Helia Court home" />
}

export function HeaderNav({ className = '', showCourtButton = false }: { className?: string; showCourtButton?: boolean }) {
  const links = (
    <>
      <Link href="/#how">How it works</Link>
      <Link href="/#agents">Agents</Link>
      <Link href="/#arc">Arc</Link>
      <Link href="/help">Help</Link>
      {showCourtButton ? (
        <Link className="nav-court-button" href={APP_URL}>
          File a Case
        </Link>
      ) : null}
    </>
  )

  return (
    <nav className={`topbar ${className}`}>
      <BrandMark />
      <div className="topbar-links">{links}</div>
      <details className="topbar-menu">
        <summary aria-label="Open navigation" title="Menu">
          <span />
          <span />
          <span />
        </summary>
        <div className="topbar-menu-panel">{links}</div>
      </details>
    </nav>
  )
}

export function PageNav() {
  return (
    <nav className="page-nav">
      <BrandMark />
      <div>
        <Link href="/">Home</Link>
        <Link href="/agents">Agents</Link>
        <Link href="/protocol">Protocol</Link>
      </div>
    </nav>
  )
}
