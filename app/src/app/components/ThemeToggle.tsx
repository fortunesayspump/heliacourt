'use client'

import { useEffect, useState } from 'react'

type ThemeChoice = 'light' | 'dark'

const labels: Record<ThemeChoice, string> = {
  light: 'Light',
  dark: 'Dark',
}

function applyTheme(choice: ThemeChoice) {
  document.documentElement.dataset.theme = choice
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>('light')

  useEffect(() => {
    const saved = window.localStorage.getItem('helia-theme') as ThemeChoice | null
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initial = saved === 'light' || saved === 'dark' ? saved : systemTheme
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const nextTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    window.localStorage.setItem('helia-theme', next)
    applyTheme(next)
  }

  return (
    <button className="theme-toggle" type="button" aria-label={`Theme: ${labels[theme]}`} aria-pressed={theme === 'dark'} onClick={nextTheme}>
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb" />
      </span>
    </button>
  )
}
