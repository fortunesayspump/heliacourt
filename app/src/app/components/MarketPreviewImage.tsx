'use client'

import { ChartLineUp } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

type Preview = {
  title?: string
  description?: string
  image?: string
  host?: string
}

export function MarketPreviewImage({
  url,
  fallbackTitle,
}: {
  url?: string
  fallbackTitle: string
}) {
  const [preview, setPreview] = useState<Preview | undefined>()

  useEffect(() => {
    if (!url) return
    let cancelled = false

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
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
  }, [url])

  return (
    <a className={`market-preview-image${preview?.image ? ' has-image' : ''}`} href={url ?? '#'} target={url ? '_blank' : undefined} rel={url ? 'noreferrer' : undefined}>
      {preview?.image ? (
        <img alt="" src={preview.image} />
      ) : (
        <div className="market-preview-fallback">
          <ChartLineUp size={28} />
        </div>
      )}
      <div>
        <span>{preview?.host ?? (url ? hostFromUrl(url) : 'Prediction market')}</span>
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
