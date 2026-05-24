'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useEffect, useLayoutEffect, useRef } from 'react'

export function CaseAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter()
  const pendingScrollRef = useRef<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!active || !pendingScrollRef.current) return
    const { x, y } = pendingScrollRef.current

    const restore = () => {
      window.scrollTo(x, y)
    }

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
    if (!active) return
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      pendingScrollRef.current = { x: window.scrollX, y: window.scrollY }
      startTransition(() => {
        router.refresh()
      })
    }, 5000)

    return () => window.clearInterval(interval)
  }, [active, router])

  return null
}
