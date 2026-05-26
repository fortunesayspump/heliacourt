import type { MarketCase, ToolEvidence } from '../../../court/types'
import { fetchJson } from '../http'
import { getSportsSearchQuery } from '../text'

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

type EspnScoreboard = {
  events?: Array<{
    id?: string
    name?: string
    shortName?: string
    date?: string
    status?: {
      type?: {
        name?: string
        description?: string
        completed?: boolean
      }
    }
    competitions?: Array<{
      competitors?: Array<{
        homeAway?: string
        score?: string
        team?: {
          displayName?: string
          shortDisplayName?: string
          abbreviation?: string
        }
      }>
    }>
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

    const espnObservations = await getEspnScoreboardObservations(caseText, query)
    observations.push(...espnObservations.observations)
    sources.push(...espnObservations.sources)

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
      status: sources.length ? 'ok' : 'empty',
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
  return /\b(vs\.?|versus|nba|nfl|mlb|nhl|epl|ufc|soccer|football|basketball|baseball|hockey|tennis|atp|wta|roland garros|ipl|cricket|match|game|player|squad|roster|national team|world cup|fifa|takes the field|spread|total|odds)\b/i.test(question)
}

async function getEspnScoreboardObservations(text: string, query: string) {
  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []
  const leagues = getEspnLeagueCandidates(text)
  const dates = getEspnDateCandidates(text)
  const terms = getSportsTerms(`${text} ${query}`)
  const seenEvents = new Set<string>()

  for (const league of leagues.slice(0, 4)) {
    for (const date of dates.slice(0, 3)) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard${date ? `?dates=${date}` : ''}`
      const payload = await fetchJson<EspnScoreboard>(url).catch(() => undefined)
      const events = payload?.events ?? []
      const relevantEvents = events
        .map((event) => ({ event, score: scoreEspnEvent(event, terms) }))
        .filter(({ event, score }) => score >= getMinimumEspnScore(text) && !seenEvents.has(event.id ?? `${event.name}:${event.date}`))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      for (const { event } of relevantEvents) {
        seenEvents.add(event.id ?? `${event.name}:${event.date}`)
        const competitors = event.competitions?.[0]?.competitors ?? []
        const scoreText = competitors
          .map((competitor) => `${competitor.team?.shortDisplayName ?? competitor.team?.displayName ?? competitor.team?.abbreviation ?? 'Team'} ${competitor.score ?? '?'}`)
          .join(' - ')
        const status = event.status?.type?.description ?? event.status?.type?.name ?? 'unknown status'
        observations.push(`ESPN scoreboard fallback (${league.label}): ${event.name ?? event.shortName ?? 'event'} is ${status}${scoreText ? `, ${scoreText}` : ''} at ${event.date ?? 'unknown time'}.`)
        sources.push({
          title: event.name ?? event.shortName ?? `${league.label} scoreboard event`,
          url: event.id ? `https://www.espn.com/${league.sport}/${league.league}/game/_/gameId/${event.id}` : `https://www.espn.com/${league.sport}/${league.league}/scoreboard`,
          observedAt: event.date,
          value: [status, scoreText].filter(Boolean).join(' | '),
        })
      }
    }
  }

  if (!observations.length && leagues.length) {
    observations.push(`ESPN scoreboard fallback checked ${leagues.map((league) => league.label).join(', ')} but found no matching live/final event for "${query}".`)
  }

  return { observations, sources }
}

function getEspnLeagueCandidates(text: string) {
  const lower = text.toLowerCase()
  const candidates: Array<{ sport: string; league: string; label: string }> = []
  if (/\b(nba|basketball|knicks|cavaliers|lakers|celtics|warriors)\b/.test(lower)) candidates.push({ sport: 'basketball', league: 'nba', label: 'NBA' })
  if (/\b(mlb|baseball|rays|orioles|brewers|cardinals)\b/.test(lower)) candidates.push({ sport: 'baseball', league: 'mlb', label: 'MLB' })
  if (/\b(nfl|football)\b/.test(lower) && !/\b(world cup|fifa|soccer)\b/.test(lower)) candidates.push({ sport: 'football', league: 'nfl', label: 'NFL' })
  if (/\b(nhl|hockey)\b/.test(lower)) candidates.push({ sport: 'hockey', league: 'nhl', label: 'NHL' })
  if (/\b(tennis|atp|roland garros|casper ruud|ben shelton)\b/.test(lower)) candidates.push({ sport: 'tennis', league: 'atp', label: 'ATP tennis' })
  if (/\b(tennis|wta|roland garros|svitolina|bondar)\b/.test(lower)) candidates.push({ sport: 'tennis', league: 'wta', label: 'WTA tennis' })
  if (/\b(fifa|world cup|soccer|football|france|morocco|colombia|ecuador|norway|canada|neymar|messi)\b/.test(lower)) {
    candidates.push({ sport: 'soccer', league: 'fifa.world', label: 'FIFA World Cup' })
    candidates.push({ sport: 'soccer', league: 'fifa', label: 'FIFA' })
  }
  return candidates.length ? candidates : [{ sport: 'basketball', league: 'nba', label: 'NBA' }, { sport: 'baseball', league: 'mlb', label: 'MLB' }]
}

function getEspnDateCandidates(text: string) {
  const dates = new Set<string>()
  const isoDates = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []
  for (const date of isoDates) dates.add(date.replaceAll('-', ''))
  const current = new Date()
  dates.add(current.toISOString().slice(0, 10).replaceAll('-', ''))
  const yesterday = new Date(current)
  yesterday.setUTCDate(current.getUTCDate() - 1)
  dates.add(yesterday.toISOString().slice(0, 10).replaceAll('-', ''))
  const tomorrow = new Date(current)
  tomorrow.setUTCDate(current.getUTCDate() + 1)
  dates.add(tomorrow.toISOString().slice(0, 10).replaceAll('-', ''))
  dates.add('')
  return Array.from(dates)
}

function getSportsTerms(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3)
    .filter((term) => !/^(will|the|and|for|with|market|case|question|versus|match|game|team|win|winner|before|after|2026|2027)$/.test(term))
}

function scoreEspnEvent(event: NonNullable<EspnScoreboard['events']>[number], terms: string[]) {
  const haystack = [
    event.name,
    event.shortName,
    ...(event.competitions?.[0]?.competitors ?? []).flatMap((competitor) => [
      competitor.team?.displayName,
      competitor.team?.shortDisplayName,
      competitor.team?.abbreviation,
    ]),
  ].filter(Boolean).join(' ').toLowerCase()

  return terms.filter((term) => haystack.includes(term)).length
}

function getMinimumEspnScore(text: string) {
  return /\b(tennis|atp|wta|roland garros)\b/i.test(text) ? 2 : 1
}
