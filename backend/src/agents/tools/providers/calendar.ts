import type { MarketCase, ToolEvidence } from '../../../court/types'
import { fetchJson } from '../http'
import { getCaseSearchQuery, getPossibleCountryCode } from '../text'
import * as cheerio from 'cheerio'

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
  const fomcEvidence = await getFomcCalendarEvidence(calendarText, fetchedAt)

  if (!countryCode) {
    return {
      capability: 'calendar_data',
      provider: [
        deadlineEvidence.observations.length ? 'deadline-parser' : undefined,
        fomcEvidence.observations.length ? 'federal-reserve' : undefined,
        'nager-date',
      ].filter(Boolean).join('+'),
      query,
      fetchedAt,
      status: deadlineEvidence.observations.length || fomcEvidence.observations.length ? 'ok' : 'skipped',
      observations: deadlineEvidence.observations.length || fomcEvidence.observations.length
        ? [
            ...deadlineEvidence.observations,
            ...fomcEvidence.observations,
            'No supported country or location was found, so public-holiday calendar reads were skipped.',
          ]
        : ['No supported country or location was found, so public-holiday calendar reads were skipped.'],
      sources: [...deadlineEvidence.sources, ...fomcEvidence.sources],
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
            ...fomcEvidence.observations,
            ...upcoming.map((holiday) => `${holiday.countryCode ?? countryCode}: ${holiday.name ?? holiday.localName ?? 'public holiday'} on ${holiday.date}.`),
          ]
        : [...deadlineEvidence.observations, ...fomcEvidence.observations, `No upcoming public holidays returned for ${countryCode}.`],
      sources: [
        ...deadlineEvidence.sources,
        ...fomcEvidence.sources,
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

async function getFomcCalendarEvidence(text: string, fetchedAt: string): Promise<Pick<ToolEvidence, 'observations' | 'sources'>> {
  if (!/\b(fed|federal reserve|fomc|rate decision|interest rates?|monetary policy|dot plot|summary of economic projections|sep)\b/i.test(text)) {
    return { observations: [], sources: [] }
  }

  const yearHints = extractYearHints(text)
  const currentYear = new Date().getUTCFullYear()
  const years = yearHints.length ? yearHints : [currentYear]
  const url = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return { observations: [`Federal Reserve FOMC calendar fetch returned HTTP ${response.status}.`], sources: [] }

    const html = await response.text()
    const $ = cheerio.load(html)
    const meetings = years.flatMap((year) => extractFomcMeetingsForYear($, year))
    if (!meetings.length) {
      return {
        observations: [`Federal Reserve FOMC calendar was fetched, but no meeting rows were parsed for ${years.join(', ')}.`],
        sources: [{ title: 'Federal Reserve FOMC meeting calendars', url, observedAt: fetchedAt, value: years.join(', ') }],
      }
    }

    const today = startOfDay(new Date())
    const upcoming = meetings.filter((meeting) => meeting.endDate >= today)
    const selected = upcoming.length ? upcoming : meetings.slice(-3)
    const observation = [
      `Federal Reserve FOMC calendar for ${years.join(', ')}:`,
      selected.map((meeting) => `${meeting.month} ${meeting.dateLabel}${meeting.hasSep ? ' (SEP/projections)' : ''}`).join('; '),
      upcoming.length ? `${upcoming.length} upcoming/remaining meeting(s) in parsed year(s).` : 'No upcoming meeting remains in parsed year(s); showing latest parsed meetings.',
    ].join(' ')

    return {
      observations: [observation],
      sources: selected.map((meeting) => ({
        title: `FOMC meeting ${meeting.month} ${meeting.dateLabel}, ${meeting.year}`,
        url,
        observedAt: meeting.isoEnd,
        value: JSON.stringify({
          year: meeting.year,
          month: meeting.month,
          date: meeting.dateLabel,
          hasSummaryOfEconomicProjections: meeting.hasSep,
          officialSource: 'Federal Reserve FOMC meeting calendars',
        }),
      })),
    }
  } catch (error) {
    return {
      observations: [`Federal Reserve FOMC calendar fetch failed: ${error instanceof Error ? error.message : 'unknown error'}.`],
      sources: [],
    }
  }
}

function extractFomcMeetingsForYear($: cheerio.CheerioAPI, year: number) {
  const anchor = $(`a:contains("${year} FOMC Meetings")`).filter((_, element) => $(element).text().trim() === `${year} FOMC Meetings`).first()
  const panel = anchor.closest('.panel')
  const rows = panel.find('.fomc-meeting').toArray()

  return rows.flatMap((row) => {
    const month = normalizeText($(row).find('.fomc-meeting__month').first().text())
    const dateLabel = normalizeText($(row).find('.fomc-meeting__date').first().text())
    const parsed = parseFomcDate(year, month, dateLabel)
    if (!month || !dateLabel || !parsed) return []

    return [{
      year,
      month,
      dateLabel,
      startDate: parsed.start,
      endDate: parsed.end,
      isoEnd: parsed.end.toISOString().slice(0, 10),
      hasSep: dateLabel.includes('*') || /Projection Materials|Summary of Economic Projections/i.test($(row).text()),
    }]
  })
}

function parseFomcDate(year: number, monthName: string, dateLabel: string) {
  const month = monthIndex(monthName)
  if (month < 0) return undefined
  const parts = dateLabel.replace('*', '').match(/\d{1,2}/g)?.map(Number) ?? []
  if (!parts.length) return undefined
  const startDay = parts[0]
  const endDay = parts[1] ?? parts[0]
  return {
    start: new Date(Date.UTC(year, month, startDay)),
    end: new Date(Date.UTC(year, month, endDay)),
  }
}

function extractYearHints(text: string) {
  return [...new Set((text.match(/\b20\d{2}\b/g) ?? []).map(Number).filter((year) => year >= 2021 && year <= 2028))].slice(0, 3)
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
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
