'use client'

export type ActionStatusTone = 'info' | 'loading' | 'success' | 'error'

export type ActionStatusState = {
  text: string
  tone?: ActionStatusTone
}

export function ActionStatus({ status, compact = false }: {
  status?: ActionStatusState | string
  compact?: boolean
}) {
  if (!status) return null

  const normalized = typeof status === 'string'
    ? { text: status, tone: 'info' as const }
    : { text: status.text, tone: status.tone ?? 'info' }

  if (!normalized.text) return null

  return (
    <p className={`action-status action-status-${normalized.tone} ${compact ? 'action-status-compact' : ''}`} role="status" aria-live="polite">
      {normalized.tone === 'loading' ? <span className="action-status-spinner" aria-hidden="true" /> : null}
      <span>{normalized.text}</span>
    </p>
  )
}
