'use client'

import { useEffect, useMemo, useState } from 'react'

export type FadeImageSource = string | {
  src: string
  position?: string
}

type FadeImageLayerProps = {
  src: string
  sources?: FadeImageSource[]
  position?: string
  className?: string
}

const loadedImages = new Set<string>()

export function FadeImageLayer({ src, sources, position = 'center', className = '' }: FadeImageLayerProps) {
  const imageSources = useMemo(() => normalizeSources(sources, src, position), [position, sources, src])
  const [nextIndex, setNextIndex] = useState(0)
  const [frontLayer, setFrontLayer] = useState<'current' | 'staged'>('current')
  const [currentImage, setCurrentImage] = useState(imageSources[0])
  const [stagedImage, setStagedImage] = useState(imageSources[0])
  const visibleSrc = frontLayer === 'current' ? currentImage.src : stagedImage.src
  const storageKey = useMemo(() => `helia-image-loaded:${visibleSrc}`, [visibleSrc])
  const [loaded, setLoaded] = useState(() => loadedImages.has(visibleSrc))
  const [seenBefore, setSeenBefore] = useState(() => loadedImages.has(visibleSrc))

  useEffect(() => {
    const cached = loadedImages.has(visibleSrc) || window.sessionStorage.getItem(storageKey) === 'true'

    if (cached) {
      loadedImages.add(visibleSrc)
      setSeenBefore(true)
      setLoaded(true)
      return
    }

    setSeenBefore(false)
    setLoaded(false)

    const image = new Image()
    image.src = visibleSrc
    image.onload = () => {
      loadedImages.add(visibleSrc)
      window.sessionStorage.setItem(storageKey, 'true')
      setLoaded(true)
    }
    image.onerror = () => setLoaded(true)
  }, [visibleSrc, storageKey])

  useEffect(() => {
    if (imageSources.length <= 1) return undefined

    const interval = window.setInterval(() => {
      setNextIndex((index) => {
        const nextImageIndex = (index + 1) % imageSources.length
        const nextImage = imageSources[nextImageIndex] ?? imageSources[0]
        const nextSrc = nextImage.src
        const image = new Image()
        image.src = nextSrc
        const showNextImage = () => {
          loadedImages.add(nextSrc)
          window.sessionStorage.setItem(`helia-image-loaded:${nextSrc}`, 'true')
          setFrontLayer((layer) => {
            if (layer === 'current') {
              setStagedImage(nextImage)
              return 'staged'
            }

            setCurrentImage(nextImage)
            return 'current'
          })
        }
        image.onload = showNextImage
        image.onerror = showNextImage
        return nextImageIndex
      })
    }, 20000)

    return () => window.clearInterval(interval)
  }, [imageSources, imageSources.length])

  useEffect(() => {
    setNextIndex(0)
    setCurrentImage(imageSources[0])
    setStagedImage(imageSources[0])
    setFrontLayer('current')
  }, [imageSources])

  const classes = [
    'fade-image-layer',
    loaded ? 'is-loaded' : '',
    seenBefore ? 'was-seen' : 'first-load',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div aria-hidden="true" className={classes}>
      <span
        className={`fade-image-frame${frontLayer === 'current' ? ' is-front' : ''}`}
        style={{
          backgroundImage: `url("${currentImage.src}")`,
          backgroundPosition: currentImage.position,
        }}
      />
      <span
        className={`fade-image-frame${frontLayer === 'staged' ? ' is-front' : ''}`}
        style={{
          backgroundImage: `url("${stagedImage.src}")`,
          backgroundPosition: stagedImage.position,
        }}
      />
    </div>
  )
}

function normalizeSources(sources: FadeImageSource[] | undefined, fallbackSrc: string, fallbackPosition: string) {
  const sourceList = sources?.length ? sources : [fallbackSrc]
  const seen = new Set<string>()

  return sourceList.flatMap((source) => {
    const item = typeof source === 'string'
      ? { src: source, position: fallbackPosition }
      : { src: source.src, position: source.position ?? fallbackPosition }

    if (!item.src || seen.has(item.src)) return []
    seen.add(item.src)
    return item
  })
}
