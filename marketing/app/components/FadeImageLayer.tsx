'use client'

import { useEffect, useMemo, useState } from 'react'

type FadeImageLayerProps = {
  src: string
  position?: string
  className?: string
}

const loadedImages = new Set<string>()

export function FadeImageLayer({ src, position = 'center', className = '' }: FadeImageLayerProps) {
  const storageKey = useMemo(() => `agora-image-loaded:${src}`, [src])
  const [loaded, setLoaded] = useState(() => loadedImages.has(src))
  const [seenBefore, setSeenBefore] = useState(() => loadedImages.has(src))

  useEffect(() => {
    const cached = loadedImages.has(src) || window.sessionStorage.getItem(storageKey) === 'true'

    if (cached) {
      loadedImages.add(src)
      setSeenBefore(true)
      setLoaded(true)
      return
    }

    setSeenBefore(false)
    setLoaded(false)

    const image = new Image()
    image.src = src
    image.onload = () => {
      loadedImages.add(src)
      window.sessionStorage.setItem(storageKey, 'true')
      setLoaded(true)
    }
    image.onerror = () => setLoaded(true)
  }, [src, storageKey])

  const classes = [
    'fade-image-layer',
    loaded ? 'is-loaded' : '',
    seenBefore ? 'was-seen' : 'first-load',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      aria-hidden="true"
      className={classes}
      style={{
        backgroundImage: `url("${src}")`,
        backgroundPosition: position,
      }}
    />
  )
}
