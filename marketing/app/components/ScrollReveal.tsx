'use client'

import { useEffect } from 'react'

export function ScrollReveal() {
  useEffect(() => {
    const scrollRoot = document.querySelector('.site-scroll-root')
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    let frame = 0

    const updateProgress = () => {
      frame = 0
      const root = scrollRoot instanceof HTMLElement ? scrollRoot : document.documentElement
      const scrollTop = scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : window.scrollY
      const maxScroll = Math.max(1, root.scrollHeight - root.clientHeight)
      document.documentElement.style.setProperty('--marketing-scroll', String(Math.min(scrollTop / maxScroll, 1)))
    }

    const requestProgress = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateProgress)
    }

    const revealNow = (target: HTMLElement) => target.classList.add('is-visible')

    const revealVisibleTargets = () => {
      const height = window.innerHeight || document.documentElement.clientHeight
      targets.forEach((target) => {
        if (target.classList.contains('is-visible')) return
        const rect = target.getBoundingClientRect()
        if (rect.top <= height * 0.88 && rect.bottom >= height * 0.05) {
          revealNow(target)
        }
      })
    }

    const requestReveal = () => {
      requestProgress()
      window.requestAnimationFrame(revealVisibleTargets)
    }

    updateProgress()
    scrollRoot?.addEventListener('scroll', requestReveal, { passive: true })
    window.addEventListener('resize', requestReveal)
    window.requestAnimationFrame(revealVisibleTargets)

    if (!targets.length) {
      return () => {
        scrollRoot?.removeEventListener('scroll', requestReveal)
        window.removeEventListener('resize', requestReveal)
        if (frame) window.cancelAnimationFrame(frame)
      }
    }

    if (!('IntersectionObserver' in window)) {
      return () => {
        scrollRoot?.removeEventListener('scroll', requestReveal)
        window.removeEventListener('resize', requestReveal)
        if (frame) window.cancelAnimationFrame(frame)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          revealNow(entry.target as HTMLElement)
          observer.unobserve(entry.target)
        })
      },
      {
        root: scrollRoot,
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.16,
      },
    )

    targets.forEach((target) => observer.observe(target))
    return () => {
      observer.disconnect()
      scrollRoot?.removeEventListener('scroll', requestReveal)
      window.removeEventListener('resize', requestReveal)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
