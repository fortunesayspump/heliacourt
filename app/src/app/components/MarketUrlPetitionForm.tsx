'use client'

import { ArrowRight, LinkSimple, Stamp } from '@phosphor-icons/react'
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
      fetch(`/api/link-preview?url=${encodeURIComponent(value)}`, { cache: 'no-store' })
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
        <span className="petition-visual-bars" />
        <div className="petition-visual-copy">
          <LinkSimple size={18} />
          <strong>Market URL</strong>
          <small>Question, image, outcomes, horizon</small>
        </div>
      </div>
      <label className="petition-url-field" htmlFor="dashboard-market-url">
        <span>Polymarket, Kalshi, or Manifold URL</span>
        <input
          id="dashboard-market-url"
          placeholder="https://polymarket.com/event/..."
          value={marketUrl}
          onChange={(event) => setMarketUrl(event.target.value)}
        />
      </label>
      <div className="petition-flow-strip" aria-hidden="true">
        <span>Auto-fill</span>
        <ArrowRight size={13} />
        <span>Fund</span>
        <ArrowRight size={13} />
        <span>Verdict</span>
      </div>
      <div className="petition-card-footer">
        <span className="petition-market-logos">
          <MarketLogo market="polymarket" />
          <MarketLogo market="kalshi" />
          <MarketLogo market="manifold" />
        </span>
        <button className="primary-button" type="submit">
          Continue
          <Stamp size={16} />
        </button>
      </div>
    </form>
  )
}
