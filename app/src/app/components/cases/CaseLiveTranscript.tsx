'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SourceEmbedCard } from './SourceEmbedCard'
import { getAgentAvatarUrl } from '../../../lib/agent-images'
import type { ApiCourtArtifact, ApiTranscriptTurn } from '../../../lib/backend-data'

type TranscriptSourceCard = {
  url: string
  title: string
  kind: string
  detail?: string
}

type CaseDetailPayload = {
  transcript?: ApiTranscriptTurn[]
  artifacts?: ApiCourtArtifact[]
}

export function CaseLiveTranscript({
  caseId,
  initialTranscript,
  initialArtifacts,
}: {
  caseId: string
  initialTranscript: ApiTranscriptTurn[]
  initialArtifacts: ApiCourtArtifact[]
}) {
  const [transcript, setTranscript] = useState(initialTranscript)
  const [artifacts, setArtifacts] = useState(initialArtifacts)
  const [newTurnCount, setNewTurnCount] = useState(0)
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const knownTurnIdsRef = useRef(new Set(initialTranscript.map((turn) => turn.id)))

  const artifactById = useMemo(() => new Map(artifacts.map((artifact) => [artifact.id, artifact])), [artifacts])

  useEffect(() => {
    knownTurnIdsRef.current = new Set(initialTranscript.map((turn) => turn.id))
    setTranscript(initialTranscript)
    setArtifacts(initialArtifacts)
    setNewTurnCount(0)
  }, [caseId, initialArtifacts, initialTranscript])

  useEffect(() => {
    const storageKey = `helia-transcript-seen:${caseId}`
    const storedIds = window.sessionStorage.getItem(storageKey)
    const seenIds = new Set(storedIds ? JSON.parse(storedIds) as string[] : [])

    if (!seenIds.size) {
      initialTranscript.forEach((turn) => seenIds.add(turn.id))
      persistSeenTurnIds(storageKey, seenIds)
    }

    const transcriptNode = transcriptRef.current
    if (!transcriptNode) return undefined

    const markNewEntries = () => {
      const entries = Array.from(transcriptNode.querySelectorAll<HTMLElement>('.transcript-entry[id]'))

      entries.forEach((entry) => {
        if (seenIds.has(entry.id)) return
        seenIds.add(entry.id)
        entry.classList.add('is-new-turn')
        window.setTimeout(() => entry.classList.remove('is-new-turn'), 2800)
      })

      persistSeenTurnIds(storageKey, seenIds)
    }

    markNewEntries()
    const observer = new MutationObserver(markNewEntries)
    observer.observe(transcriptNode, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [caseId, initialTranscript])

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const poll = async () => {
      if (cancelled || inFlight || document.visibilityState !== 'visible') return
      inFlight = true

      try {
        const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json() as CaseDetailPayload
        const nextTranscript = payload.transcript
        if (!nextTranscript) return

        const knownIds = knownTurnIdsRef.current
        const incomingTurns = nextTranscript.filter((turn) => !knownIds.has(turn.id))
        const wasNearBottom = isNearPageBottom()

        if (incomingTurns.length) {
          incomingTurns.forEach((turn) => knownIds.add(turn.id))
          setTranscript(nextTranscript)
          if (payload.artifacts) setArtifacts(payload.artifacts)

          window.requestAnimationFrame(() => {
            if (wasNearBottom) {
              window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
            } else {
              setNewTurnCount((count) => count + incomingTurns.length)
            }
          })
        } else if (payload.artifacts) {
          setArtifacts(payload.artifacts)
        }
      } finally {
        inFlight = false
      }
    }

    const interval = window.setInterval(poll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [caseId])

  const jumpToLatest = () => {
    setNewTurnCount(0)
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }

  return (
    <>
      <div className="court-transcript" data-live-transcript ref={transcriptRef}>
        {transcript.length ? transcript.map((turn) => {
          const replyTurn = turn.replyToId ? transcript.find((item) => item.id === turn.replyToId) : undefined
          const artifact = turn.artifactId ? artifactById.get(turn.artifactId) : undefined
          const sourceCards = getTurnSourceCards(turn, artifact)
          const hasContext = Boolean(replyTurn)
          const avatarUrl = getAgentAvatarUrl(turn.agentId, turn.agentName)

          return (
            <article className={`transcript-entry role-${formatTurnRole(turn.seat)}${hasContext ? ' has-reply' : ''}`} id={turn.id} key={turn.id}>
              {replyTurn ? (
                <div className="transcript-contexts">
                  <a className="transcript-reply" href={`#${replyTurn.id}`} aria-label={`Jump to ${replyTurn.agentName}`}>
                    <strong>{replyTurn.agentName}</strong>
                    <span>{summarizeTurn(replyTurn)}</span>
                  </a>
                </div>
              ) : null}
              <div className="transcript-avatar">
                {avatarUrl ? <img alt="" src={avatarUrl} /> : turn.agentName.slice(0, 1)}
              </div>
              <div className="transcript-message">
                <div className="transcript-meta">
                  <div>
                    <strong>{turn.agentName}</strong>
                    <span>{turn.stage}</span>
                    {typeof turn.confidence === 'number' && <span>{formatConfidence(turn.confidence)}</span>}
                    {turn.createdAt ? <time dateTime={turn.createdAt}>{formatTurnTime(turn.createdAt)}</time> : null}
                  </div>
                </div>
                <p>{renderTextWithLinks(turn.message)}</p>
                {sourceCards.length ? (
                  <div className="transcript-source-grid" aria-label="Referenced sources">
                    {sourceCards.map((source) => (
                      <SourceEmbedCard detail={source.detail} kind={source.kind} key={`${turn.id}-${source.url}`} title={source.title} url={source.url} />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          )
        }) : (
          <div className="empty-state">
            <strong>No transcript turns yet</strong>
            <p>Run the hearing to add live court turns to this case.</p>
          </div>
        )}
      </div>
      {newTurnCount ? (
        <button className="transcript-new-turn-button" type="button" onClick={jumpToLatest}>
          {newTurnCount} new turn{newTurnCount === 1 ? '' : 's'}
        </button>
      ) : null}
    </>
  )
}

function isNearPageBottom() {
  const viewportBottom = window.scrollY + window.innerHeight
  return document.documentElement.scrollHeight - viewportBottom < 180
}

function persistSeenTurnIds(storageKey: string, seenIds: Set<string>) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(seenIds).slice(-160)))
}

function formatTurnRole(seat: string) {
  if (seat.includes('counsel') && seat.includes('bull')) return 'counsel-bull'
  if (seat.includes('counsel') && seat.includes('bear')) return 'counsel-bear'
  if (seat.includes('witness')) return 'witness'
  if (seat.includes('judge') || seat.includes('magistrate')) return 'bench'
  if (seat.includes('clerk')) return 'clerk'
  if (seat.includes('juror')) return 'jury'
  if (seat.includes('risk')) return 'risk'
  return 'witness'
}

function summarizeTurn(turn: ApiTranscriptTurn) {
  return turn.message.length > 120 ? `${turn.message.slice(0, 117)}...` : turn.message
}

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatTurnTime(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function renderTextWithLinks(text: string) {
  const markdownParts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g)

  return markdownParts.flatMap((part, index) => {
    const markdown = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i.exec(part)
    if (markdown) {
      return (
        <a href={markdown[2]} key={`${markdown[2]}-${index}`} target="_blank" rel="noreferrer">
          {markdown[1]}
        </a>
      )
    }

    const parts = part.split(/(https?:\/\/[^\s)]+)/g)
    return parts.map((piece, pieceIndex) => renderUrlPiece(piece, `${index}-${pieceIndex}`))
  })
}

function renderUrlPiece(part: string, key: string) {
  if (!/^https?:\/\//i.test(part)) return part

  const cleanUrl = part.replace(/[.,;:!?]+$/, '')
  const trailing = part.slice(cleanUrl.length)

  return (
    <span key={`${cleanUrl}-${key}`}>
      <a href={cleanUrl} target="_blank" rel="noreferrer">{formatUrlLabel(cleanUrl)}</a>
      {trailing}
    </span>
  )
}

function getTurnSourceCards(turn: ApiTranscriptTurn, artifact?: ApiCourtArtifact) {
  const turnText = `${turn.message} ${turn.request ?? ''}`
  const directUrls: TranscriptSourceCard[] = extractUrls(turnText).map((url) => ({
    url,
    title: formatUrlLabel(url),
    kind: 'Referenced link',
    detail: domainFromUrl(url),
  }))

  const evidenceSources: TranscriptSourceCard[] = artifact?.toolEvidence
    ?.flatMap((evidence) => evidence.sources?.flatMap((source) => {
      if (!source.url) return []
      if (!shouldShowEvidenceSourceForTurn(source.url, source.title, evidence.capability, turnText)) return []

      return [{
        url: source.url,
        title: source.title ?? formatUrlLabel(source.url),
        kind: evidence.capability ? formatAgentLabel(evidence.capability.replace(/_/g, '-')) : 'Source',
        detail: source.value ?? evidence.provider,
      }]
    }) ?? [])
    ?? []

  const seen = new Set<string>()
  return [...directUrls, ...evidenceSources]
    .filter((source) => {
      const key = source.url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function shouldShowEvidenceSourceForTurn(url: string, title: string | undefined, capability: string | undefined, turnText: string) {
  const directUrls = extractUrls(turnText).map((value) => normalizeUrlForCompare(value))
  if (directUrls.includes(normalizeUrlForCompare(url))) return true

  if (capability && /^(web_page_scrape|visual_page_analysis|screenshot|image_read|social_activity_data)$/i.test(capability)) {
    return true
  }

  const normalizedText = turnText.toLowerCase()
  const host = domainFromUrl(url)?.toLowerCase()
  if (host && normalizedText.includes(host.replace(/^www\./, ''))) return true

  const titleWords = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 5)

  return titleWords.length >= 2 && titleWords.slice(0, 5).filter((word) => normalizedText.includes(word)).length >= 2
}

function extractUrls(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi))
    .map((match) => match[0].replace(/[.,;:!?]+$/, ''))
}

function normalizeUrlForCompare(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return value.replace(/\/$/, '').toLowerCase()
  }
}

function formatUrlLabel(value: string) {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 82)
  } catch {
    return value
  }
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function formatAgentLabel(agentId?: string) {
  if (!agentId) return 'court'

  return agentId
    .replace(/-(?:witness|counsel|judge|clerk|bailiff|juror)$/i, '')
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}
