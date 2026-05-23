'use client'

import { Stamp } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import { MarketLogo } from './MarketLogo'

export function MarketUrlPetitionForm() {
  const router = useRouter()
  const [marketUrl, setMarketUrl] = useState('')
  const [marketImage, setMarketImage] = useState<string | undefined>()

  useEffect(() => {
    const value = marketUrl.trim()
    if (!value || !/^https?:\/\//i.test(value)) {
      setMarketImage(undefined)
      return
    }

    let cancelled = false
    const timeout = window.setTimeout(() => {
      fetch(`/api/market-image?url=${encodeURIComponent(value)}`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() as Promise<{ image?: string }> : undefined)
        .then((payload) => {
          if (!cancelled) setMarketImage(payload?.image)
        })
        .catch(() => {
          if (!cancelled) setMarketImage(undefined)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [marketUrl])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = marketUrl.trim()
    router.push(value ? `/cases/new?market=${encodeURIComponent(value)}` : '/cases/new')
  }

  return (
    <form className="case-box petition-card" onSubmit={submit}>
      <div className="petition-card-visual" aria-hidden="true">
        {marketImage ? <img alt="" src={marketImage} /> : null}
        <span />
        <strong>URL</strong>
      </div>
      <label className="petition-url-field" htmlFor="dashboard-market-url">
        <span>Paste market URL</span>
        <input
          id="dashboard-market-url"
          placeholder="https://..."
          value={marketUrl}
          onChange={(event) => setMarketUrl(event.target.value)}
        />
      </label>
      <div className="petition-card-footer">
        <span className="petition-market-logos">
          <MarketLogo market="polymarket" />
          <MarketLogo market="kalshi" />
          <MarketLogo market="manifold" />
        </span>
        <button className="primary-button" type="submit">
          File case
          <Stamp size={16} />
        </button>
      </div>
    </form>
  )
}
