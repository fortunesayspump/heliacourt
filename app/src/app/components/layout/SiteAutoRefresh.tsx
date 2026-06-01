'use client'

import { usePathname, useRouter } from 'next/navigation'
import { startTransition, useEffect, useLayoutEffect, useRef } from 'react'

const REFRESH_INTERVAL_MS = 30_000
const FOCUS_REFRESH_MIN_AGE_MS = 12_000

export function SiteAutoRefresh() {
  const router = useRouter()
  const pathname = usePathname()
  const lastRefreshRef = useRef(Date.now())
  const pendingScrollRef = useRef<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!pendingScrollRef.current) return
    const { x, y } = pendingScrollRef.current

    const restore = () => window.scrollTo(x, y)
    restore()
    const first = window.setTimeout(restore, 50)
    const second = window.setTimeout(() => {
      restore()
      pendingScrollRef.current = null
    }, 250)

    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  })

  useEffect(() => {
    const refresh = (force = false) => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (!force && now - lastRefreshRef.current < FOCUS_REFRESH_MIN_AGE_MS) return

      lastRefreshRef.current = now
      pendingScrollRef.current = { x: window.scrollX, y: window.scrollY }
      window.dispatchEvent(new CustomEvent('helia:silent-refresh'))
      startTransition(() => {
        router.refresh()
      })
    }

    const interval = window.setInterval(() => refresh(true), REFRESH_INTERVAL_MS)
    const handleFocus = () => refresh(false)
    const handleVisibilityChange = () => refresh(false)

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pathname, router])

  return null
}
