'use client'

import { Scales } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { MarketLogo } from './MarketLogo'

type Preview = {
  title?: string
  description?: string
  image?: string
  host?: string
}

export function MarketPreviewImage({
  url,
  fallbackTitle,
  imageUrl,
  preferOgImage = false,
}: {
  url?: string
  fallbackTitle: string
  imageUrl?: string
  preferOgImage?: boolean
}) {
  const [preview, setPreview] = useState<Preview | undefined>()

  useEffect(() => {
    if (!url) return
    let cancelled = false

    const params = new URLSearchParams({ url })
    if (fallbackTitle && !preferOgImage) params.set('title', fallbackTitle)
    fetch(`${preferOgImage ? '/api/link-preview' : '/api/market-image'}?${params.toString()}`)
      .then((response) => response.ok ? response.json() as Promise<Preview> : undefined)
      .then((payload) => {
        if (!cancelled) setPreview(payload)
      })
      .catch(() => {
        if (!cancelled) setPreview(undefined)
      })

    return () => {
      cancelled = true
    }
  }, [fallbackTitle, preferOgImage, url])

  const resolvedImage = preferOgImage ? preview?.image ?? imageUrl : imageUrl ?? preview?.image

  return (
    <a className={`market-preview-image${resolvedImage ? ' has-image' : ''}`} href={url ?? '#'} target={url ? '_blank' : undefined} rel={url ? 'noreferrer' : undefined}>
      {resolvedImage ? (
        <img alt="" src={resolvedImage} />
      ) : (
        <div className="market-preview-fallback">
          <Scales size={28} />
        </div>
      )}
      <div>
        <span className="market-preview-source">
          <MarketLogo url={url} market={preview?.host} />
          {preview?.host ?? (url ? hostFromUrl(url) : 'Market')}
        </span>
        <strong>{preview?.title ?? fallbackTitle}</strong>
      </div>
    </a>
  )
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}
