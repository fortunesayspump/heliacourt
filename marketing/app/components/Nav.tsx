import Link from 'next/link'

export function BrandMark({ href = '/' }: { href?: string }) {
  return <Link className="brand-mark" href={href} aria-label="Agora Court home" />
}

export function HeaderNav({ className = '', showCourtButton = false }: { className?: string; showCourtButton?: boolean }) {
  return (
    <nav className={`topbar ${className}`}>
      <BrandMark />
      <div>
        <Link href="/#how">How it works</Link>
        <Link href="/#agents">Agents</Link>
        <Link href="/#arc">Arc</Link>
        <Link href="/docs">Docs</Link>
        {showCourtButton ? (
          <Link className="nav-court-button" href="http://localhost:3000">
            Enter Court
          </Link>
        ) : null}
      </div>
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
