'use client'

import { Scales } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

type Preview = {
  image?: string
}

export function CaseMarketIcon({
  url,
  title,
}: {
  url?: string
  title: string
}) {
  const [image, setImage] = useState<string | undefined>()

  useEffect(() => {
    if (!url) return
    let cancelled = false

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((response) => response.ok ? response.json() as Promise<Preview> : undefined)
      .then((preview) => {
        if (!cancelled) setImage(preview?.image)
      })
      .catch(() => {
        if (!cancelled) setImage(undefined)
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className={`case-market-icon${image ? ' has-image' : ''}`} aria-hidden="true">
      {image ? <img alt="" src={image} /> : <span>{title.trim().slice(0, 1).toUpperCase() || <Scales size={18} />}</span>}
    </div>
  )
}
