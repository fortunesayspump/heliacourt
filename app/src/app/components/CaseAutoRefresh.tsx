'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useEffect } from 'react'

export function CaseAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      startTransition(() => {
        router.refresh()
      })
    }, 5000)

    return () => window.clearInterval(interval)
  }, [active, router])

  return null
}
