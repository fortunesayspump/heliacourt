import type { MarketCase } from './types'

export type CourtClock = {
  nowIso: string
  filedAtIso: string
  detectedTimeText?: string
  deadlineIso?: string
  horizonLabel: string
  remainingLabel?: string
  status: 'past-deadline' | 'active-window' | 'future-window' | 'unknown-window'
}

const monthIndex: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}

export function buildCourtClock(marketCase: MarketCase, now = new Date()): CourtClock {
  const text = `${marketCase.question} ${marketCase.context ?? ''}`.replace(/\s+/g, ' ')
  const filedAt = parseDate(marketCase.createdAt) ?? now
  const detected = extractDeadline(text, now)
  const deadline = detected?.date
  const status = getStatus(now, filedAt, deadline)

  return {
    nowIso: now.toISOString(),
    filedAtIso: filedAt.toISOString(),
    detectedTimeText: detected?.text,
    deadlineIso: deadline?.toISOString(),
    horizonLabel: buildHorizonLabel(now, filedAt, deadline),
    remainingLabel: deadline ? buildDurationLabel(deadline.getTime() - now.getTime()) : undefined,
    status,
  }
}

export function describeCourtClock(clock: CourtClock) {
  return [
    `Court clock: now ${clock.nowIso}`,
    `case filed ${clock.filedAtIso}`,
    clock.deadlineIso ? `detected deadline ${clock.deadlineIso}` : 'no explicit deadline detected',
    clock.detectedTimeText ? `from "${clock.detectedTimeText}"` : undefined,
    `status ${clock.status}`,
    `horizon ${clock.horizonLabel}`,
    clock.remainingLabel ? `remaining ${clock.remainingLabel}` : undefined,
  ].filter(Boolean).join('; ')
}

function extractDeadline(text: string, now: Date): { text: string; date: Date } | undefined {
  const monthDay = text.match(
    /\b(?:by|before|through|until|ends?|deadline|reported between[^.]*?and)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+([0-3]?\d)(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?(?:[^.\n]{0,40}?(?:11:59\s*PM\s*ET|ET))?/i,
  )

  if (monthDay) {
    const month = monthIndex[monthDay[1].toLowerCase()]
    const day = Number(monthDay[2])
    const explicitYear = monthDay[3] ? Number(monthDay[3]) : undefined
    const year = explicitYear ?? inferYear(now, month, day)
    const deadline = new Date(Date.UTC(year, month, day, hasEndOfDayHint(monthDay[0]) ? 23 : 23, hasEndOfDayHint(monthDay[0]) ? 59 : 59, 59))
    if (isValidDate(deadline)) return { text: monthDay[0].trim(), date: deadline }
  }

  const isoDate = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/]([0-3]?\d)\b/)
  if (isoDate) {
    const deadline = new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 23, 59, 59))
    if (isValidDate(deadline)) return { text: isoDate[0], date: deadline }
  }

  const relative = text.match(/\b(?:within|in|next)\s+(\d{1,4})\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i)
  if (relative) {
    const amount = Number(relative[1])
    const unit = relative[2].toLowerCase()
    const multiplier = unit.startsWith('minute') || unit.startsWith('min')
      ? 60_000
      : unit.startsWith('hour') || unit.startsWith('hr')
        ? 3_600_000
        : unit.startsWith('week')
          ? 7 * 86_400_000
          : 86_400_000
    return { text: relative[0], date: new Date(now.getTime() + amount * multiplier) }
  }

  return undefined
}

function inferYear(now: Date, month: number, day: number) {
  const currentYear = now.getUTCFullYear()
  const candidate = new Date(Date.UTC(currentYear, month, day, 23, 59, 59))
  return candidate.getTime() < now.getTime() - 14 * 86_400_000 ? currentYear + 1 : currentYear
}

function hasEndOfDayHint(text: string) {
  return /\b(11:59|pm|et|end|ends?|deadline|by)\b/i.test(text)
}

function getStatus(now: Date, filedAt: Date, deadline?: Date): CourtClock['status'] {
  if (!deadline) return 'unknown-window'
  if (now.getTime() > deadline.getTime()) return 'past-deadline'
  if (now.getTime() >= filedAt.getTime()) return 'active-window'

  return 'future-window'
}

function buildHorizonLabel(now: Date, filedAt: Date, deadline?: Date) {
  if (!deadline) return 'unknown duration'

  const total = buildDurationLabel(deadline.getTime() - filedAt.getTime())
  const remaining = buildDurationLabel(deadline.getTime() - now.getTime())

  return `${total} total; ${remaining} remaining`
}

function buildDurationLabel(ms: number) {
  const absolute = Math.abs(ms)
  const days = Math.floor(absolute / 86_400_000)
  const hours = Math.floor((absolute % 86_400_000) / 3_600_000)
  const minutes = Math.floor((absolute % 3_600_000) / 60_000)
  const prefix = ms < 0 ? 'expired ' : ''

  if (days > 0) return `${prefix}${days}d ${hours}h`
  if (hours > 0) return `${prefix}${hours}h ${minutes}m`

  return `${prefix}${minutes}m`
}

function parseDate(value: string) {
  const date = new Date(value)
  return isValidDate(date) ? date : undefined
}

function isValidDate(date: Date) {
  return Number.isFinite(date.getTime())
}
