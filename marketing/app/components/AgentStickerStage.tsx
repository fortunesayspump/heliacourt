'use client'

import { useEffect, useRef } from 'react'

type AgentSticker = {
  name: string
  role: string
  image: string
}

export function AgentStickerStage({ agents }: { agents: readonly AgentSticker[] }) {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    let frame = 0

    const centerStage = () => {
      frame = 0
      stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2)
    }

    const requestCenter = () => {
      if (frame) return
      frame = window.requestAnimationFrame(centerStage)
    }

    const scrollRoot = document.querySelector('.site-scroll-root')
    const root = scrollRoot instanceof HTMLElement ? scrollRoot : null
    const images = Array.from(stage.querySelectorAll('img'))

    requestCenter()
    images.forEach((image) => image.addEventListener('load', requestCenter))
    window.addEventListener('resize', requestCenter)

    if (!('IntersectionObserver' in window)) {
      stage.classList.add('is-visible')
      return () => {
        if (frame) window.cancelAnimationFrame(frame)
        images.forEach((image) => image.removeEventListener('load', requestCenter))
        window.removeEventListener('resize', requestCenter)
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        stage.classList.add('is-visible')
        observer.disconnect()
      },
      {
        root,
        rootMargin: '0px 0px -14% 0px',
        threshold: 0.18,
      },
    )

    observer.observe(stage)

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      images.forEach((image) => image.removeEventListener('load', requestCenter))
      window.removeEventListener('resize', requestCenter)
    }
  }, [])

  return (
    <div ref={stageRef} className="agent-sticker-stage" aria-label="Featured Helia Court agents">
      {agents.map((agent) => (
        <article className="agent-sticker" key={agent.name}>
          <img alt="" decoding="async" loading="lazy" src={agent.image} />
          <span>
            <strong>{agent.name}</strong>
            <small>{agent.role}</small>
          </span>
        </article>
      ))}
    </div>
  )
}
