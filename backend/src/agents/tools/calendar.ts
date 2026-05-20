import type { MarketCase, ToolEvidence } from '../../court/types'
import { fetchJson } from './http'
import { getCaseSearchQuery, getPossibleCountryCode } from './text'

type NagerHoliday = {
  date?: string
  localName?: string
  name?: string
  countryCode?: string
  global?: boolean
}

export async function getCalendarEvidence(marketCase: MarketCase): Promise<ToolEvidence> {
  const query = getCaseSearchQuery(marketCase.question)
  const fetchedAt = new Date().toISOString()
  const countryCode = getPossibleCountryCode(marketCase.question)

  if (!countryCode) {
    return {
      capability: 'calendar_data',
      provider: 'nager-date',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['No supported country or location was found, so public-holiday calendar reads were skipped.'],
      sources: [],
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
        ? upcoming.map((holiday) => `${holiday.countryCode ?? countryCode}: ${holiday.name ?? holiday.localName ?? 'public holiday'} on ${holiday.date}.`)
        : [`No upcoming public holidays returned for ${countryCode}.`],
      sources: upcoming.map((holiday) => ({
        title: holiday.name ?? holiday.localName ?? `${countryCode} public holiday`,
        url: `https://date.nager.at/api/v3/NextPublicHolidays/${countryCode}`,
        observedAt: holiday.date,
        value: holiday.countryCode ?? countryCode,
      })),
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
