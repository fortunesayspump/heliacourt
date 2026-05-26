import type { MarketCase, ToolEvidence } from '../../../court/types'
import { fetchJson } from '../http'
import { getCaseSearchQuery, getPossibleCountryCode } from '../text'

type NagerHoliday = {
  date?: string
  localName?: string
  name?: string
  countryCode?: string
  global?: boolean
}

export async function getCalendarEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const calendarText = [marketCase.question, marketCase.context, marketCase.links?.join(' '), instruction].filter(Boolean).join(' ')
  const query = getCaseSearchQuery(calendarText)
  const fetchedAt = new Date().toISOString()
  const countryCode = getPossibleCountryCode(calendarText)
  const deadlineEvidence = getDeadlineEvidence(calendarText)

  if (!countryCode) {
    return {
      capability: 'calendar_data',
      provider: deadlineEvidence.observations.length ? 'deadline-parser' : 'nager-date',
      query,
      fetchedAt,
      status: deadlineEvidence.observations.length ? 'ok' : 'skipped',
      observations: deadlineEvidence.observations.length
        ? [
            ...deadlineEvidence.observations,
            'No supported country or location was found, so public-holiday calendar reads were skipped.',
          ]
        : ['No supported country or location was found, so public-holiday calendar reads were skipped.'],
      sources: deadlineEvidence.sources,
    }
  }

  try {
    const holidays = await fetchJson<NagerHoliday[]>(`https://date.nager.at/api/v3/NextPublicHolidays/${countryCode}`)
    const upcoming = holidays.slice(0, 3)

    return {
      capability: 'calendar_data',
      provider: 'nager-date',
      query,
      fetchedAt,
      status: upcoming.length ? 'ok' : 'empty',
      observations: upcoming.length
        ? [
            ...deadlineEvidence.observations,
            ...upcoming.map((holiday) => `${holiday.countryCode ?? countryCode}: ${holiday.name ?? holiday.localName ?? 'public holiday'} on ${holiday.date}.`),
          ]
        : [...deadlineEvidence.observations, `No upcoming public holidays returned for ${countryCode}.`],
      sources: [
        ...deadlineEvidence.sources,
        ...upcoming.map((holiday) => ({
          title: holiday.name ?? holiday.localName ?? `${countryCode} public holiday`,
          url: `https://date.nager.at/api/v3/NextPublicHolidays/${countryCode}`,
          observedAt: holiday.date,
          value: holiday.countryCode ?? countryCode,
        })),
      ],
    }
  } catch (error) {
    return {
      capability: 'calendar_data',
      provider: 'nager-date',
      query,
      fetchedAt,
      status: 'error',
      observations: [],
      sources: [],
      error: error instanceof Error ? error.message : 'Calendar tool failed',
    }
  }
}

function getDeadlineEvidence(text: string): Pick<ToolEvidence, 'observations' | 'sources'> {
  const dates = extractDateHints(text)
  const now = new Date()
  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []

  for (const date of dates.slice(0, 4)) {
    const days = Math.ceil((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000)
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date)
    const iso = date.toISOString().slice(0, 10)
    const businessDays = countWeekdays(now, date)
    const timing = days >= 0 ? `${days} day(s) away` : `${Math.abs(days)} day(s) ago`
    const weekend = [0, 6].includes(date.getUTCDay()) ? 'weekend' : 'weekday'

    observations.push(`Parsed deadline/date ${iso}: ${timing}, ${weekday}, ${weekend}, about ${Math.abs(businessDays)} weekday(s) ${days >= 0 ? 'remaining' : 'elapsed'}.`)
    if (days < 0) {
      observations.push(`Timing warning: ${iso} is already in the past, so witnesses should reason in resolution/audit mode instead of forecasting mode.`)
    } else if (days <= 7) {
      observations.push(`Timing warning: ${iso} is within 7 days, so witnesses should treat live status and final-source confirmation as high priority.`)
    }
    sources.push({
      title: `Parsed calendar date ${iso}`,
      observedAt: iso,
      value: `${days} days`,
    })
  }

  return { observations, sources }
}

function extractDateHints(text: string) {
  const dates = new Map<string, Date>()
  const isoMatches = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []
  const monthMatches = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}\b/gi) ?? []

  for (const value of isoMatches) {
    const parsed = parseIsoDateAsUtc(value)
    if (Number.isFinite(parsed.getTime())) {
      dates.set(parsed.toISOString().slice(0, 10), parsed)
    }
  }

  for (const value of monthMatches) {
    const parsed = parseMonthDateAsUtc(value)
    if (parsed && Number.isFinite(parsed.getTime())) {
      dates.set(parsed.toISOString().slice(0, 10), parsed)
    }
  }

  return [...dates.values()].sort((left, right) => left.getTime() - right.getTime())
}

function parseIsoDateAsUtc(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function parseMonthDateAsUtc(value: string) {
  const match = value.match(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/)
  if (!match) return undefined
  const month = monthIndex(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  if (month < 0 || !Number.isFinite(day) || !Number.isFinite(year)) return undefined
  return new Date(Date.UTC(year, month, day))
}

function monthIndex(value: string) {
  const key = value.slice(0, 3).toLowerCase()
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key)
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function countWeekdays(start: Date, end: Date) {
  const direction = end.getTime() >= start.getTime() ? 1 : -1
  const cursor = startOfDay(start)
  const stop = startOfDay(end)
  let count = 0

  while ((direction > 0 && cursor < stop) || (direction < 0 && cursor > stop)) {
    cursor.setUTCDate(cursor.getUTCDate() + direction)
    if (![0, 6].includes(cursor.getUTCDay())) {
      count += direction
    }
  }

  return count
}
