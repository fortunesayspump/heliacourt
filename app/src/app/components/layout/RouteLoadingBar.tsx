'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

export function RouteLoadingBar() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle')
  const fallbackTimer = useRef<number | undefined>(undefined)
  const doneTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)
  const startedAt = useRef(0)
  const didStart = useRef(false)

  const finish = useCallback(() => {
    if (!didStart.current) return
    const remaining = Math.max(0, 650 - (Date.now() - startedAt.current))

    window.clearTimeout(doneTimer.current)
    doneTimer.current = window.setTimeout(() => {
      setPhase('done')
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => {
        didStart.current = false
        setPhase('idle')
      }, 240)
    }, remaining)
  }, [])

  const start = useCallback(() => {
    window.clearTimeout(fallbackTimer.current)
    window.clearTimeout(doneTimer.current)
    window.clearTimeout(hideTimer.current)
    didStart.current = true
    startedAt.current = Date.now()
    setPhase('loading')
    fallbackTimer.current = window.setTimeout(finish, 4500)
  }, [finish])

  useEffect(() => {
    const handleNavigateIntent = (event: MouseEvent | PointerEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
      const target = event.target instanceof Element ? event.target.closest('a') : null
      if (!(target instanceof HTMLAnchorElement)) return
      if (target.target || target.hasAttribute('download')) return

      const nextUrl = new URL(target.href, window.location.href)
      const currentUrl = new URL(window.location.href)
      if (nextUrl.origin !== currentUrl.origin) return
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) return

      start()
    }

    document.addEventListener('pointerdown', handleNavigateIntent, true)
    document.addEventListener('click', handleNavigateIntent, true)
    return () => {
      document.removeEventListener('pointerdown', handleNavigateIntent, true)
      document.removeEventListener('click', handleNavigateIntent, true)
      window.clearTimeout(fallbackTimer.current)
      window.clearTimeout(doneTimer.current)
      window.clearTimeout(hideTimer.current)
    }
  }, [start])

  useEffect(() => {
    finish()
  }, [finish, pathname])

  return <div className={`route-loading-bar ${phase}`} aria-hidden="true"><span /></div>
}
