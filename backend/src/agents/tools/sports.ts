import type { MarketCase, ToolEvidence } from '../../court/types'
import { fetchJson } from './http'
import { getSportsSearchQuery } from './text'

type OddsSport = {
  key?: string
  title?: string
  active?: boolean
  has_outrights?: boolean
}

type SportsDbEventResponse = {
  event?: Array<{
    idEvent?: string
    strEvent?: string
    strSport?: string
    strLeague?: string
    strTimestamp?: string
    intHomeScore?: string
    intAwayScore?: string
    strHomeTeam?: string
    strAwayTeam?: string
  }>
}

export async function getSportsEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const sportsText = [marketCase.question, marketCase.context, instruction].filter(Boolean).join(' ')
  const query = getSportsSearchQuery(sportsText)
  const fetchedAt = new Date().toISOString()
  const caseText = sportsText

  if (!looksLikeSportsQuestion(caseText)) {
    return {
      capability: 'sports_data',
      provider: 'sportsdb+the-odds-api',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['The case question does not look sports-specific, so sports reads were skipped.'],
      sources: [],
    }
  }

  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []

  try {
    const sportsDbKey = process.env.THESPORTSDB_API_KEY || '123'
    const eventPayload = await fetchJson<SportsDbEventResponse>(
      `https://www.thesportsdb.com/api/v1/json/${sportsDbKey}/searchevents.php?e=${encodeURIComponent(query.replace(/\s+vs\s+/i, '_vs_'))}`,
    )
    const events = eventPayload.event ?? []

    for (const event of events.slice(0, 3)) {
      observations.push(
        `${event.strEvent ?? 'Sports event'} (${event.strLeague ?? event.strSport ?? 'unknown league'}) score ${event.intHomeScore ?? '?'}-${event.intAwayScore ?? '?'} at ${event.strTimestamp ?? 'unknown time'}.`,
      )
      sources.push({
        title: event.strEvent ?? 'TheSportsDB event',
        url: event.idEvent ? `https://www.thesportsdb.com/event/${event.idEvent}` : 'https://www.thesportsdb.com/',
        observedAt: event.strTimestamp,
        value: `${event.intHomeScore ?? '?'}-${event.intAwayScore ?? '?'}`,
      })
    }

    if (process.env.THE_ODDS_API_KEY) {
      const sports = await fetchJson<OddsSport[]>(
        `https://api.the-odds-api.com/v4/sports/?apiKey=${process.env.THE_ODDS_API_KEY}`,
      )
      const activeSports = sports.filter((sport) => sport.active).slice(0, 5)
      observations.push(`The Odds API currently lists ${activeSports.length} active sports groups available for odds pulls.`)
      sources.push(...activeSports.map((sport) => ({
        title: sport.title ?? sport.key ?? 'Odds API sport',
        url: 'https://the-odds-api.com/',
        value: sport.key,
      })))
    }

    return {
      capability: 'sports_data',
      provider: process.env.THE_ODDS_API_KEY ? 'sportsdb+the-odds-api' : 'sportsdb',
      query,
      fetchedAt,
      status: observations.length ? 'ok' : 'empty',
      observations,
      sources,
    }
  } catch (error) {
    return {
      capability: 'sports_data',
      provider: 'sportsdb+the-odds-api',
      query,
      fetchedAt,
      status: 'error',
      observations: [],
      sources: [],
      error: error instanceof Error ? error.message : 'Sports tool failed',
    }
  }
}

function looksLikeSportsQuestion(question: string) {
  return /\b(vs\.?|versus|nba|nfl|mlb|nhl|epl|ufc|soccer|football|basketball|baseball|hockey|match|game|player|squad|roster|national team|world cup|fifa|takes the field|spread|total|odds)\b/i.test(question)
}
