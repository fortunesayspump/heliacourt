import type { MarketCase, ToolEvidence } from '../../../court/types'
import { fetchJson } from '../http'
import { getCaseSearchQuery, getPossibleCountryCode } from '../text'
import * as cheerio from 'cheerio'
import { getNewsEvidence } from './news'

type NagerHoliday = {
  date?: string
  localName?: string
  name?: string
  countryCode?: string
  global?: boolean
}

type JsonRecord = Record<string, unknown>

export async function getCalendarEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const calendarText = [marketCase.question, marketCase.context, marketCase.links?.join(' '), instruction].filter(Boolean).join(' ')
  const query = getCaseSearchQuery(calendarText)
  const fetchedAt = new Date().toISOString()
  const countryCode = getPossibleCountryCode(calendarText)
  const deadlineEvidence = getDeadlineEvidence(calendarText)
  const fomcEvidence = await getFomcCalendarEvidence(calendarText, fetchedAt)
  const electionCalendarEvidence = await getElectionCalendarEvidence(calendarText, countryCode, fetchedAt)
  const marketDeadlineEvidence = await getMarketDeadlineEvidence(calendarText, fetchedAt)
  const discoveredDateEvidence = await getDiscoveredDateEvidence(marketCase, instruction, calendarText, fetchedAt)
  const nonHolidayEvidence = [deadlineEvidence, fomcEvidence, electionCalendarEvidence, marketDeadlineEvidence, discoveredDateEvidence]
  const providerParts = [
    deadlineEvidence.observations.length ? 'deadline-parser' : undefined,
    fomcEvidence.observations.length ? 'federal-reserve' : undefined,
    electionCalendarEvidence.observations.length ? 'official-election-calendar' : undefined,
    marketDeadlineEvidence.observations.length ? 'market-deadline-api' : undefined,
    discoveredDateEvidence.observations.length ? 'date-source-discovery' : undefined,
    'nager-date',
  ].filter(Boolean).join('+')
  const priorObservations = nonHolidayEvidence.flatMap((evidence) => evidence.observations)
  const priorSources = nonHolidayEvidence.flatMap((evidence) => evidence.sources)

  if (!countryCode) {
    return {
      capability: 'calendar_data',
      provider: providerParts,
      query,
      fetchedAt,
      status: priorObservations.length ? 'ok' : 'skipped',
      observations: priorObservations.length
        ? [
            ...priorObservations,
            'No supported country or location was found, so public-holiday calendar reads were skipped.',
          ]
        : ['No supported country or location was found, so public-holiday calendar reads were skipped.'],
      sources: priorSources,
    }
  }

  try {
    const holidays = await fetchJson<NagerHoliday[]>(`https://date.nager.at/api/v3/NextPublicHolidays/${countryCode}`)
    const upcoming = holidays.slice(0, 3)

    return {
      capability: 'calendar_data',
      provider: providerParts,
      query,
      fetchedAt,
      status: upcoming.length || priorObservations.length ? 'ok' : 'empty',
      observations: upcoming.length
        ? [
            ...priorObservations,
            ...upcoming.map((holiday) => `${holiday.countryCode ?? countryCode}: ${holiday.name ?? holiday.localName ?? 'public holiday'} on ${holiday.date}.`),
          ]
        : [...priorObservations, `No upcoming public holidays returned for ${countryCode}.`],
      sources: [
        ...priorSources,
        ...upcoming.map((holiday) => ({
          title: holiday.name ?? holiday.localName ?? `${countryCode} public holiday`,
          url: `https://date.nager.at/api/v3/NextPublicHolidays/${countryCode}`,
          observedAt: holiday.date,
          value: holiday.countryCode ?? countryCode,
        })),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calendar tool failed'
    return {
      capability: 'calendar_data',
      provider: providerParts,
      query,
      fetchedAt,
      status: priorObservations.length ? 'ok' : 'error',
      observations: priorObservations.length
        ? [...priorObservations, `Public-holiday calendar read failed for ${countryCode}: ${message}.`]
        : [],
      sources: priorSources,
      error: priorObservations.length ? undefined : message,
    }
  }
}

async function getDiscoveredDateEvidence(marketCase: MarketCase, instruction: string, text: string, fetchedAt: string): Promise<Pick<ToolEvidence, 'observations' | 'sources'>> {
  if (!needsDiscoveredDateEvidence(text)) return { observations: [], sources: [] }

  const suppliedUnknownUrls = extractUrls(text)
    .filter((url) => !/\b(polymarket\.com|kalshi\.com|manifold\.markets|federalreserve\.gov|date\.nager\.at)\b/i.test(url))
    .slice(0, 3)

  const suppliedResults = await Promise.allSettled(suppliedUnknownUrls.map((url) => extractDatesFromUnknownPage(url, text, fetchedAt)))
  const suppliedSources = suppliedResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  let discoveryError: string | undefined
  const discovery = await getNewsEvidence({
    ...marketCase,
    question: `${marketCase.question} official schedule deadline calendar date close time`,
    context: [
      marketCase.context,
      'Calendar/date-source discovery: find official or high-authority sources for schedules, deadlines, event dates, close times, updates, and resolution timing.',
    ].filter(Boolean).join(' '),
  }, instruction).catch((error) => {
    discoveryError = error instanceof Error ? error.message : 'unknown error'
    return undefined
  })
  const discoveredSearchSources = (discovery?.sources ?? [])
    .filter((source) => source.url || source.observedAt || source.title)
    .slice(0, 8)
  const discoverySources = discoveredSearchSources.flatMap((source) => sourceToDateSources(source, text, fetchedAt))
  const discoveryPageResults = await Promise.allSettled(
    discoveredSearchSources
      .filter((source) => source.url)
      .slice(0, 3)
      .map((source) => extractDatesFromUnknownPage(source.url as string, text, fetchedAt)),
  )
  const discoveryPageSources = discoveryPageResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  const sources = dedupeSources([...suppliedSources, ...discoverySources, ...discoveryPageSources]).slice(0, 10)
  const observations = sources.map((source) => {
    const date = source.observedAt ? new Date(source.observedAt) : undefined
    const days = date && Number.isFinite(date.getTime())
      ? Math.ceil((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86_400_000)
      : undefined
    return [
      `Discovered date source: ${source.title}`,
      source.url,
      source.observedAt ? `date ${source.observedAt}` : undefined,
      typeof days === 'number' ? `(${days >= 0 ? `${days} day(s) away` : `${Math.abs(days)} day(s) ago`})` : undefined,
      source.value,
    ].filter(Boolean).join(' ')
  })
  if (!observations.length && discoveryError) observations.push(`Date-source discovery search failed: ${discoveryError}.`)
  if (!observations.length && discovery && !discoveredSearchSources.length) observations.push('Date-source discovery search ran but returned no schedule/deadline/date source candidates.')

  return { observations, sources }
}

function needsDiscoveredDateEvidence(text: string) {
  return /\b(schedule|calendar|deadline|date|meeting|event date|close time|end date|expiry|expires|window|before|after|by|through|until|launch|release|decision|minutes|filing|hearing|conference|tournament|earnings|settlement)\b/i.test(text)
}

async function extractDatesFromUnknownPage(url: string, caseText: string, fetchedAt: string): Promise<ToolEvidence['sources']> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
        'user-agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
      },
    })
    if (!response.ok) return []
    const contentType = response.headers.get('content-type') ?? ''
    const raw = await response.text()
    const finalUrl = response.url || url
    const text = /html/i.test(contentType) ? htmlDateText(raw, finalUrl) : normalizeText(raw).slice(0, 4_000)
    const dateHints = extractDateHints(text).slice(0, 5)
    const pageTitle = /html/i.test(contentType) ? getHtmlTitle(raw, finalUrl) : finalUrl
    const metaDate = /html/i.test(contentType) ? getHtmlDate(raw) : undefined

    return [
      ...(metaDate ? [{
        title: `Page date metadata: ${pageTitle}`,
        url: finalUrl,
        observedAt: metaDate,
        value: 'Date metadata from supplied unknown-domain page',
      }] : []),
      ...dateHints.map((date) => ({
        title: `Date mentioned on ${pageTitle}`,
        url: finalUrl,
        observedAt: date.toISOString().slice(0, 10),
        value: 'Date parsed from supplied unknown-domain page text',
      })),
    ]
  } catch {
    return []
  }
}

function sourceToDateSources(source: ToolEvidence['sources'][number], caseText: string, fetchedAt: string): ToolEvidence['sources'] {
  const parsedDates = extractDateHints(`${source.title} ${source.value ?? ''}`).slice(0, 2)
  const observedAt = normalizeObservedAt(source.observedAt)
  const base = source.url ? new URL(source.url).hostname.replace(/^www\./i, '') : 'search source'
  const items: ToolEvidence['sources'] = []

  if (observedAt) {
    items.push({
      title: `Search-discovered dated source: ${source.title}`,
      url: source.url,
      observedAt,
      value: `Observed/publication date from ${base}; inspect exact page before treating as event deadline.`,
    })
  }

  for (const date of parsedDates) {
    items.push({
      title: `Search-discovered date mention: ${source.title}`,
      url: source.url,
      observedAt: date.toISOString().slice(0, 10),
      value: `Date parsed from search title/snippet metadata from ${base}; inspect exact page before treating as event deadline.`,
    })
  }

  if (!items.length && source.url && /\b(schedule|calendar|deadline|fixture|meeting|event|date|close|expiry|expires|timeline|official)\b/i.test(`${source.title} ${source.url}`)) {
    items.push({
      title: `Search-discovered schedule/date source candidate: ${source.title}`,
      url: source.url,
      value: `Candidate date source from ${base}; exact page extraction should confirm dates before testimony.`,
    })
  }

  return items
}

async function getMarketDeadlineEvidence(text: string, fetchedAt: string): Promise<Pick<ToolEvidence, 'observations' | 'sources'>> {
  const urls = extractUrls(text).filter((url) => /\b(polymarket\.com|kalshi\.com|manifold\.markets)\b/i.test(url))
  if (!urls.length) return { observations: [], sources: [] }

  const results = await Promise.allSettled(urls.slice(0, 5).map((url) => getMarketDeadlineForUrl(url, fetchedAt)))
  const entries = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  if (!entries.length) return { observations: ['Market deadline check found supported market links, but no close/end dates were returned by public APIs.'], sources: [] }

  const observations = entries.slice(0, 8).map((entry) => {
    const date = new Date(entry.observedAt ?? '')
    const days = Number.isFinite(date.getTime()) ? Math.ceil((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86_400_000) : undefined
    return [
      `Market deadline: ${entry.title}`,
      entry.observedAt ? `closes/ends ${entry.observedAt}` : undefined,
      typeof days === 'number' ? `(${days >= 0 ? `${days} day(s) away` : `${Math.abs(days)} day(s) ago`})` : undefined,
      entry.value,
    ].filter(Boolean).join(' ')
  })

  return {
    observations,
    sources: entries,
  }
}

async function getElectionCalendarEvidence(text: string, countryCode: string | undefined, fetchedAt: string): Promise<Pick<ToolEvidence, 'observations' | 'sources'>> {
  if (!/\b(election|elections|electoral|first round|runoff|presidential|president|candidate|ballot|elei[cç][aã]o|elei[cç][oõ]es|turno|presidente)\b/i.test(text)) {
    return { observations: [], sources: [] }
  }
  if (countryCode !== 'BR' && !/\b(Brazil|Brasil|Brazilian|Brasileir[ao]s?|TSE|Tribunal Superior Eleitoral)\b/i.test(text)) {
    return { observations: [], sources: [] }
  }

  const urls = [
    'https://www.tse.jus.br/legislacao/compilada/res/2026/resolucao-no-23-751-de-26-de-fevereiro-de-2026',
    'https://www.tse.jus.br/legislacao/compilada/res/2026/resolucao-no-23-760-de-2-de-marco-de-2026',
    'https://www.tse.jus.br/comunicacao/noticias/2026/Marco/eleicoes-2026-confira-as-principais-datas-do-calendario-eleitoral',
  ]
  const results = await Promise.allSettled(urls.map((url) => extractBrazilElectionDates(url, fetchedAt)))
  const sources = dedupeSources(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])))
  if (!sources.length) {
    return {
      observations: ['Official Brazil election-calendar check ran against TSE sources, but no first-round/second-round dates were parsed.'],
      sources: [],
    }
  }

  return {
    observations: sources.slice(0, 4).map((source) => {
      const date = source.observedAt ? new Date(source.observedAt) : undefined
      const days = date && Number.isFinite(date.getTime())
        ? Math.ceil((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86_400_000)
        : undefined
      return [
        `Official Brazil election calendar: ${source.title}`,
        source.observedAt ? `date ${source.observedAt}` : undefined,
        typeof days === 'number' ? `(${days >= 0 ? `${days} day(s) away` : `${Math.abs(days)} day(s) ago`})` : undefined,
        source.value,
      ].filter(Boolean).join(' ')
    }),
    sources,
  }
}

async function extractBrazilElectionDates(url: string, fetchedAt: string): Promise<ToolEvidence['sources']> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
        'user-agent': process.env.HELIA_HTTP_USER_AGENT ?? 'HeliaCourt/0.1',
      },
    })
    if (!response.ok) return []
    const raw = normalizeText(await response.text())
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
    const finalUrl = response.url || url
    const sources: ToolEvidence['sources'] = []

    if (/(4 de outubro de 2026|4 de outubro|4º? de outubro).{0,260}(primeiro turno|1º turno|1o turno|dia das eleições|presidente da república|eleger ocupantes)|(?:primeiro turno|1º turno|1o turno|dia das eleições|presidente da república|eleger ocupantes).{0,260}(4 de outubro de 2026|4 de outubro|4º? de outubro)/i.test(raw)) {
      sources.push({
        title: 'TSE 2026 first-round election date',
        url: finalUrl,
        observedAt: '2026-10-04',
        value: 'Parsed from Tribunal Superior Eleitoral source text mentioning 4 de outubro and 1º turno/dia das eleições.',
      })
    }
    if (/(25 de outubro de 2026|25 de outubro|25º? de outubro).{0,180}(segundo turno|2º turno|2o turno)|(?:segundo turno|2º turno|2o turno).{0,180}(25 de outubro de 2026|25 de outubro|25º? de outubro)/i.test(raw)) {
      sources.push({
        title: 'TSE 2026 second-round election date',
        url: finalUrl,
        observedAt: '2026-10-25',
        value: 'Parsed from Tribunal Superior Eleitoral source text mentioning 25 de outubro and 2º turno.',
      })
    }

    return sources
  } catch {
    return []
  }
}

async function getMarketDeadlineForUrl(url: string, fetchedAt: string): Promise<ToolEvidence['sources']> {
  const parsed = safeUrl(url)
  if (!parsed) return []
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()

  if (host.endsWith('manifold.markets')) return getManifoldDeadline(parsed, fetchedAt)
  if (host.endsWith('kalshi.com')) return getKalshiDeadline(parsed, fetchedAt)
  if (host.endsWith('polymarket.com')) return getPolymarketDeadline(parsed, fetchedAt)
  return []
}

async function getManifoldDeadline(parsed: URL, fetchedAt: string): Promise<ToolEvidence['sources']> {
  const slug = parsed.pathname.split('/').filter(Boolean).at(-1)
  if (!slug) return []
  const market = await fetchJson<JsonRecord>(`https://api.manifold.markets/v0/slug/${encodeURIComponent(slug)}`).catch(() => undefined)
  const question = asString(market?.question) ?? slug
  const closeTime = typeof market?.closeTime === 'number' ? new Date(market.closeTime).toISOString() : undefined
  return closeTime ? [{
    title: `Manifold deadline: ${question}`,
    url: parsed.toString(),
    observedAt: closeTime,
    value: 'Public Manifold API closeTime',
  }] : []
}

async function getKalshiDeadline(parsed: URL, fetchedAt: string): Promise<ToolEvidence['sources']> {
  const parts = parsed.pathname.split('/').filter(Boolean)
  const ticker = [...parts].reverse().find((part) => /^kx/i.test(part))?.toUpperCase()
  if (!ticker) return []
  const payload = await fetchJson<{ market?: JsonRecord }>(`https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(ticker)}`).catch(() => undefined)
  const market = payload?.market
  const title = asString(market?.title) ?? ticker
  const closeTime = asString(market?.close_time) ?? asString(market?.expected_expiration_time)
  return closeTime ? [{
    title: `Kalshi deadline: ${title}`,
    url: parsed.toString(),
    observedAt: closeTime,
    value: `Public Kalshi API ticker ${ticker}`,
  }] : []
}

async function getPolymarketDeadline(parsed: URL, fetchedAt: string): Promise<ToolEvidence['sources']> {
  const parts = parsed.pathname.split('/').filter(Boolean)
  const eventIndex = parts.findIndex((part) => part === 'event')
  const eventSlug = eventIndex >= 0 ? parts[eventIndex + 1] : undefined
  const marketSlug = eventIndex >= 0 ? parts[eventIndex + 2] : parts.at(-1)
  const sources: ToolEvidence['sources'] = []

  if (marketSlug) {
    const markets = await fetchJson<JsonRecord[]>(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(marketSlug)}`).catch(() => [])
    sources.push(...markets.flatMap((market) => polymarketMarketDeadlineSource(market, parsed.toString())))
  }

  if (!sources.length && eventSlug) {
    const events = await fetchJson<JsonRecord[]>(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug)}`).catch(() => [])
    for (const event of events.slice(0, 2)) {
      const markets = Array.isArray(event.markets) ? event.markets.filter(isJsonRecord) : []
      sources.push(...markets.slice(0, 6).flatMap((market) => polymarketMarketDeadlineSource(market, parsed.toString())))
    }
  }

  return sources
}

function polymarketMarketDeadlineSource(market: JsonRecord, url: string): ToolEvidence['sources'] {
  const question = asString(market.question) ?? asString(market.title) ?? asString(market.slug) ?? 'Polymarket market'
  const endDate = asString(market.endDate) ?? asString(market.endDateIso) ?? asString(market.closedTime)
  return endDate ? [{
    title: `Polymarket deadline: ${question}`,
    url,
    observedAt: endDate,
    value: 'Public Polymarket Gamma API endDate',
  }] : []
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
  const monthRangeMatches = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\s*[-–]\s*\d{1,2},?\s+20\d{2}\b/gi) ?? []
  const beforeMonthYearMatches = text.match(/\bbefore\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+20\d{2}\b/gi) ?? []
  const monthYearMatches = text.match(/\b(?:end of|by the end of|before the end of|through|during|in)?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+20\d{2}\b/gi) ?? []
  const endOfYearMatches = text.match(/\b(?:end of|by the end of|before the end of|through|until|by|before)\s+(20\d{2})\b/gi) ?? []
  const beforeMonthYearLabels = new Set(beforeMonthYearMatches.map((value) => value.replace(/\bbefore\s+/i, '').trim().toLowerCase()))

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

  for (const value of monthRangeMatches) {
    const parsed = parseMonthRangeEndAsUtc(value)
    if (parsed && Number.isFinite(parsed.getTime())) {
      dates.set(parsed.toISOString().slice(0, 10), parsed)
    }
  }

  for (const value of beforeMonthYearMatches) {
    const parsed = parseMonthYearAsUtc(value)
    if (parsed && Number.isFinite(parsed.getTime())) {
      dates.set(parsed.toISOString().slice(0, 10), parsed)
    }
  }

  for (const value of monthYearMatches) {
    if (beforeMonthYearLabels.has(value.trim().toLowerCase())) continue
    const parsed = parseMonthYearAsUtc(value)
    if (parsed && Number.isFinite(parsed.getTime())) {
      dates.set(parsed.toISOString().slice(0, 10), parsed)
    }
  }

  for (const value of endOfYearMatches) {
    const parsed = parseEndOfYearAsUtc(value)
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

function parseMonthRangeEndAsUtc(value: string) {
  const match = value.match(/\b([A-Za-z]+)\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(20\d{2})\b/)
  if (!match) return undefined
  const month = monthIndex(match[1])
  const endDay = Number(match[3])
  const year = Number(match[4])
  if (month < 0 || !Number.isFinite(endDay) || !Number.isFinite(year)) return undefined
  return new Date(Date.UTC(year, month, endDay))
}

function parseMonthYearAsUtc(value: string) {
  const match = value.match(/\b(?:(before|by|through|during|in|end of|by the end of|before the end of)\s+)?([A-Za-z]+)\.?\s+(20\d{2})\b/i)
  if (!match) return undefined
  const prefix = (match[1] ?? '').toLowerCase()
  const month = monthIndex(match[2])
  const year = Number(match[3])
  if (month < 0 || !Number.isFinite(year)) return undefined
  if (prefix === 'before') return new Date(Date.UTC(year, month, 0))
  return new Date(Date.UTC(year, month + 1, 0))
}

function parseEndOfYearAsUtc(value: string) {
  const match = value.match(/\b(20\d{2})\b/)
  if (!match) return undefined
  const year = Number(match[1])
  if (!Number.isFinite(year)) return undefined
  return new Date(Date.UTC(year, 11, 31))
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

function extractUrls(value: string) {
  return [...value.matchAll(/https?:\/\/[^\s)\]}"'<>]+/gi)]
    .map((match) => match[0].replace(/[.,;:]+$/g, ''))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function safeUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeObservedAt(value?: string) {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function htmlDateText(html: string, url: string) {
  const $ = cheerio.load(html)
  $('script, style, noscript, svg').remove()
  const dateishAttrs = [
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[property="article:modified_time"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('meta[name="pubdate"]').attr('content'),
    $('time[datetime]').map((_, element) => $(element).attr('datetime')).get().join(' '),
  ].filter(Boolean).join(' ')
  const likelyBlocks = $('title,h1,h2,h3,time,[class*="date" i],[class*="time" i],[class*="schedule" i],[class*="calendar" i],[class*="deadline" i],[class*="event" i],[class*="meeting" i],p,li')
    .map((_, element) => $(element).text())
    .get()
    .join(' ')

  return normalizeText(`${url} ${dateishAttrs} ${likelyBlocks}`).slice(0, 12_000)
}

function getHtmlTitle(html: string, url: string) {
  const $ = cheerio.load(html)
  return normalizeText($('meta[property="og:title"]').attr('content') ?? $('title').first().text() ?? url) || url
}

function getHtmlDate(html: string) {
  const $ = cheerio.load(html)
  const value = $('meta[property="article:published_time"]').attr('content')
    ?? $('meta[property="article:modified_time"]').attr('content')
    ?? $('meta[name="date"]').attr('content')
    ?? $('meta[name="pubdate"]').attr('content')
    ?? $('time[datetime]').first().attr('datetime')
  return normalizeObservedAt(value)
}

function dedupeSources(sources: ToolEvidence['sources']) {
  const seen = new Set<string>()
  const output: ToolEvidence['sources'] = []

  for (const source of sources) {
    const key = `${source.title}:${source.url ?? ''}:${source.observedAt ?? ''}:${source.value ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(source)
  }

  return output
}
