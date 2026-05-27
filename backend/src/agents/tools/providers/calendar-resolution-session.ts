import type { MarketCase, ToolEvidence } from '../../../court/types'
import { getCalendarEvidence } from './calendar'
import { getNewsEvidence } from './news'
import { getWebPageScrapeEvidence } from './web-scraper'

export async function getCalendarResolutionSessionEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const fetchedAt = new Date().toISOString()
  const query = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''} ${instruction}`.trim()
  const calendarEvidence = await getCalendarEvidence(marketCase, instruction)
  const needsRecovery = shouldRecoverCalendar(calendarEvidence, query)
  const discoveryEvidence = needsRecovery
    ? await getNewsEvidence({
        ...marketCase,
        question: `${marketCase.question} official calendar schedule date deadline close time event date source`,
        context: [
          marketCase.context,
          'Calendar-resolution recovery: find official schedules, market close times, election calendars, meeting calendars, deadlines, and dated primary sources.',
        ].filter(Boolean).join(' '),
      }, instruction).catch((error) => ({
        capability: 'web_news_search',
        provider: 'calendar-resolution-discovery',
        query,
        fetchedAt,
        status: 'error',
        observations: [`Calendar source discovery failed: ${error instanceof Error ? error.message : 'unknown error'}`],
        sources: [],
        error: error instanceof Error ? error.message : 'unknown error',
      } satisfies ToolEvidence))
    : undefined
  const readerEvidence = needsRecovery && discoveryEvidence?.sources.some((source) => source.url)
    ? await getWebPageScrapeEvidence({
        ...marketCase,
        links: discoveryEvidence.sources.filter((source) => source.url).slice(0, 5).map((source) => source.url as string),
        context: [
          marketCase.context,
          'Read these discovered calendar/date sources to confirm exact dates, deadlines, publication dates, and source authority.',
        ].filter(Boolean).join(' '),
      }, instruction).catch((error) => ({
        capability: 'web_page_scrape',
        provider: 'calendar-resolution-reader',
        query,
        fetchedAt,
        status: 'error',
        observations: [`Calendar source reader failed: ${error instanceof Error ? error.message : 'unknown error'}`],
        sources: [],
        error: error instanceof Error ? error.message : 'unknown error',
      } satisfies ToolEvidence))
    : undefined

  const resolution = classifyCalendarResolution(calendarEvidence, discoveryEvidence, readerEvidence)
  const observations = [
    `Calendar resolution session: ${resolution.status}.`,
    `Date/deadline map: ${resolution.map}.`,
    `Source authority: ${resolution.authority}.`,
    ...calendarEvidence.observations.slice(0, 8).map((item) => `Calendar data: ${item}`),
    ...(discoveryEvidence?.observations.slice(0, 4).map((item) => `Date discovery: ${item}`) ?? []),
    ...(readerEvidence?.observations.slice(0, 4).map((item) => `Date reader: ${item}`) ?? []),
    resolution.warning,
  ].filter((item): item is string => Boolean(item))

  return {
    capability: 'calendar_resolution_session',
    provider: [
      'calendar-data',
      discoveryEvidence ? 'date-discovery' : undefined,
      readerEvidence ? 'date-reader' : undefined,
    ].filter(Boolean).join('+'),
    query,
    fetchedAt,
    status: calendarEvidence.status === 'ok' || discoveryEvidence?.status === 'ok' || readerEvidence?.status === 'ok' ? 'ok' : calendarEvidence.status,
    observations: observations.slice(0, 16),
    sources: [
      ...tagSources(calendarEvidence.sources, { mode: 'calendar-resolution-primary' }),
      ...tagSources(discoveryEvidence?.sources ?? [], { mode: 'calendar-resolution-discovery' }),
      ...tagSources(readerEvidence?.sources ?? [], { mode: 'calendar-resolution-reader' }),
    ],
    error: calendarEvidence.error,
  }
}

function shouldRecoverCalendar(evidence: ToolEvidence, query: string) {
  const text = `${query} ${evidence.status} ${evidence.error ?? ''} ${evidence.observations.join(' ')}`
  const timingCase = /\b(deadline|date|schedule|calendar|meeting|election|first round|primary|FOMC|close time|end date|expires|before|by|until)\b/i.test(query)
  const unresolved = /\b(unconfirmed|cannot confirm|no confirmed|unknown|skipped|no supported country|no close\/end dates|no meeting rows|no first-round|no schedule|candidate date source)\b/i.test(text)
  return timingCase && (evidence.status !== 'ok' || unresolved)
}

function classifyCalendarResolution(...items: Array<ToolEvidence | undefined>) {
  const text = items.filter(Boolean).map((item) => `${item?.observations.join(' ')} ${item?.sources.map((source) => `${source.title} ${source.url ?? ''} ${source.observedAt ?? ''} ${source.value ?? ''}`).join(' ')}`).join(' ')
  const official = /\b(official|Federal Reserve|FOMC|TSE|Tribunal Superior Eleitoral|Public Manifold API|Public Polymarket Gamma API|Public Kalshi API|\.gov|federalreserve\.gov|tse\.jus\.br)\b/i.test(text)
  const hasDate = /\b20\d{2}-\d{2}-\d{2}\b|closes\/ends|date \d{4}-\d{2}-\d{2}|Parsed deadline\/date/i.test(text)
  const unresolved = /\b(unconfirmed|cannot confirm|no confirmed|unknown|skipped|no supported country|no close\/end dates|no meeting rows|no first-round|candidate date source)\b/i.test(text)
  const marketClose = /\b(Market deadline|closeTime|closes\/ends|Public Manifold API|Public Polymarket Gamma API|Public Kalshi API)\b/i.test(text)

  const status = hasDate && official
    ? 'anchored to official/API date evidence'
    : hasDate
    ? 'date evidence found but authority/directness needs grading'
    : unresolved
    ? 'date remains unresolved after recovery attempt'
    : 'partial timing evidence found'
  const map = [
    hasDate ? 'dated source(s) found' : 'no exact date extracted',
    official ? 'official/API source present' : 'official source not confirmed',
    marketClose ? 'market close/deadline present' : 'market close/deadline absent or not applicable',
    unresolved ? 'some timing gaps remain' : 'no explicit unresolved timing gap detected',
  ].join('; ')
  const authority = official ? 'high for official/API dates; still compare event date vs market close' : 'medium/low until Skepsis grades source directness'
  const warning = hasDate
    ? undefined
    : 'Warning: witnesses should not say “typically” or “likely aligns” as if it were anchored; route another source or cap confidence.'

  return { status, map, authority, warning }
}

function tagSources(sources: ToolEvidence['sources'], extra: Record<string, unknown>) {
  return sources.map((source) => ({
    ...source,
    value: mergeValue(source.value, extra),
  }))
}

function mergeValue(value: string | undefined, extra: Record<string, unknown>) {
  if (!value) return JSON.stringify(extra)
  try {
    return JSON.stringify({ ...JSON.parse(value), ...extra })
  } catch {
    return JSON.stringify({ ...extra, sourceValue: value })
  }
}
