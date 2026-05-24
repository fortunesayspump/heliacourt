'use client'

import { useEffect } from 'react'

export function TranscriptLiveMotion({ caseId }: { caseId: string }) {
  useEffect(() => {
    const transcript = document.querySelector<HTMLElement>('[data-live-transcript]')
    if (!transcript) return undefined

    const storageKey = `helia-transcript-seen:${caseId}`
    const storedIds = window.sessionStorage.getItem(storageKey)
    const seenIds = new Set(storedIds ? JSON.parse(storedIds) as string[] : [])
    const currentEntries = Array.from(transcript.querySelectorAll<HTMLElement>('.transcript-entry[id]'))

    if (!seenIds.size) {
      currentEntries.forEach((entry) => seenIds.add(entry.id))
      persistSeenTurnIds(storageKey, seenIds)
    }

    const markNewEntries = () => {
      const entries = Array.from(transcript.querySelectorAll<HTMLElement>('.transcript-entry[id]'))

      entries.forEach((entry) => {
        if (seenIds.has(entry.id)) return
        seenIds.add(entry.id)
        entry.classList.add('is-new-turn')
        window.setTimeout(() => entry.classList.remove('is-new-turn'), 2800)
      })

      persistSeenTurnIds(storageKey, seenIds)
    }

    const observer = new MutationObserver(markNewEntries)
    observer.observe(transcript, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [caseId])

  return null
}

function persistSeenTurnIds(storageKey: string, seenIds: Set<string>) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(seenIds).slice(-160)))
}
