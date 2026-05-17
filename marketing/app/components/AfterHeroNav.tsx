'use client'

import { useEffect, useState } from 'react'
import { HeaderNav } from './Nav'

export function AfterHeroNav() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const scrollRoot = document.querySelector('.site-scroll-root')

    const update = () => {
      const hero = document.querySelector('.landing-hero')
      if (!hero) return
      setVisible(hero.getBoundingClientRect().bottom <= 0)
    }

    update()
    scrollRoot?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      scrollRoot?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return <HeaderNav className={`after-hero-topbar ${visible ? 'is-visible' : ''}`} showCourtButton />
}
