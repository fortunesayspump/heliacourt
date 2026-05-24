'use client'

import { LinkSimple } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

type Preview = {
  title?: string
  description?: string
  image?: string
  host?: string
}

export function SourceEmbedCard({
  url,
  title,
  kind,
  detail,
}: {
  url: string
  title: string
  kind: string
  detail?: string
}) {
  const [preview, setPreview] = useState<Preview | undefined>()

  useEffect(() => {
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

  const displayTitle = preview?.title || title
  const displayDetail = preview?.description || detail || preview?.host

  return (
    <a className={`transcript-source-card${preview?.image ? ' has-image' : ''}`} href={url} target="_blank" rel="noreferrer">
      <div className="source-card-media">
        {preview?.image ? <img alt="" src={preview.image} /> : <span>{hostFromUrl(url).slice(0, 1).toUpperCase()}</span>}
      </div>
      <span>{kind}</span>
      <strong>{displayTitle}</strong>
      {displayDetail ? <em>{displayDetail}</em> : null}
      <small>
        <span>{preview?.host ?? detail ?? hostFromUrl(url)}</span>
        <LinkSimple size={12} />
      </small>
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
