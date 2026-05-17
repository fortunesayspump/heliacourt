'use client'

import { useEffect } from 'react'

export function AppScrollMotion() {
  useEffect(() => {
    const scrollRoot = document.querySelector('.app-scroll-root')
    let frame = 0

    const update = () => {
      frame = 0
      const root = scrollRoot instanceof HTMLElement ? scrollRoot : document.documentElement
      const scrollTop = scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : window.scrollY
      const maxScroll = Math.max(1, root.scrollHeight - root.clientHeight)
      document.documentElement.style.setProperty('--app-scroll', String(Math.min(scrollTop / maxScroll, 1)))
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    scrollRoot?.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)

    return () => {
      scrollRoot?.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
