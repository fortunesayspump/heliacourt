'use client'

import { useEffect, useState } from 'react'
import { HeaderNav } from './Nav'

export function AfterHeroNav() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const scrollRoot = document.querySelector('.site-scroll-root')
    const hero = document.querySelector('.landing-hero')
    if (!hero) return

    const update = () => {
      const rootTop = scrollRoot?.getBoundingClientRect().top ?? 0
      setVisible(hero.getBoundingClientRect().bottom <= rootTop)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const scrolled = (scrollRoot?.scrollTop ?? window.scrollY) > 8
        setVisible(scrolled && !entry.isIntersecting)
      },
      { root: scrollRoot, threshold: 0 },
    )

    observer.observe(hero)
    update()
    scrollRoot?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      scrollRoot?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return <HeaderNav className={`after-hero-topbar ${visible ? 'is-visible' : ''}`} showCourtButton />
}
