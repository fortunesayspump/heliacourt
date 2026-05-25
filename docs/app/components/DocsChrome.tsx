export function DocsTopbar() {
  return (
    <header className="topbar">
      <a className="brand" href="https://heliacourt.xyz">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-wordmark">Helia Court</span>
        <span className="brand-product">Docs</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="https://app.heliacourt.xyz">App</a>
        <a href="https://heliacourt.xyz">Site</a>
        <a href="/">Docs</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </header>
  )
}

export function DocsFooter() {
  return (
    <footer className="docs-footer">
      <span>© 2026 Helia Court</span>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
    </footer>
  )
}
