type MarketLogoProps = {
  url?: string
  market?: string
  label?: string
  showLabel?: boolean
  className?: string
}

const marketDomains = [
  { test: /polymarket/i, domain: 'polymarket.com', label: 'Polymarket' },
  { test: /kalshi/i, domain: 'kalshi.com', label: 'Kalshi' },
  { test: /manifold/i, domain: 'manifold.markets', label: 'Manifold' },
] as const

export function MarketLogo({ url, market, label, showLabel = false, className }: MarketLogoProps) {
  const provider = getMarketProvider({ url, market })
  const resolvedLabel = label ?? provider?.label ?? 'Market'

  return (
    <span className={`market-logo-chip${showLabel ? ' with-label' : ''}${className ? ` ${className}` : ''}`} title={resolvedLabel}>
      {provider ? (
        <img alt="" src={`https://www.google.com/s2/favicons?domain=${provider.domain}&sz=64`} />
      ) : (
        <i aria-hidden="true">{resolvedLabel.slice(0, 1).toUpperCase()}</i>
      )}
      {showLabel ? <b>{resolvedLabel}</b> : null}
    </span>
  )
}

export function getMarketProvider({ url, market }: { url?: string; market?: string }) {
  const text = `${url ?? ''} ${market ?? ''}`
  const fromText = marketDomains.find((item) => item.test.test(text))
  if (fromText) return fromText

  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
      return marketDomains.find((item) => host === item.domain || host.endsWith(`.${item.domain}`))
    } catch {
      return undefined
    }
  }

  return undefined
}

export function getPredictionMarketLink(links: string[] | undefined) {
  return links?.find((link) => Boolean(getMarketProvider({ url: link }))) ?? links?.[0]
}
