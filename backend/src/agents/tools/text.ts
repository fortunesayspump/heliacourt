const cryptoAliases: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
}

const countryAliases: Record<string, string> = {
  lagos: 'NG',
  nigeria: 'NG',
  'new york': 'US',
  california: 'US',
  texas: 'US',
  florida: 'US',
  chicago: 'US',
  usa: 'US',
  'united states': 'US',
  london: 'GB',
  britain: 'GB',
  uk: 'GB',
  'united kingdom': 'GB',
  paris: 'FR',
  france: 'FR',
  berlin: 'DE',
  germany: 'DE',
  tokyo: 'JP',
  japan: 'JP',
  singapore: 'SG',
  india: 'IN',
  mumbai: 'IN',
  delhi: 'IN',
  china: 'CN',
  shanghai: 'CN',
  hongkong: 'HK',
  'hong kong': 'HK',
}

export type MarketGenre =
  | 'politics'
  | 'geopolitics'
  | 'sports'
  | 'crypto'
  | 'macro'
  | 'business'
  | 'culture'
  | 'weather'
  | 'health'
  | 'science-tech'
  | 'social'
  | 'transport'
  | 'legal-regulatory'

export function getCaseSearchQuery(question: string) {
  return question
    .replace(/[^\w\s$/"'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

export function getSearchTerms(question: string) {
  const stopwords = new Set([
    'will',
    'would',
    'should',
    'could',
    'the',
    'and',
    'for',
    'or',
    'over',
    'under',
    'play',
    'plays',
    'played',
    'playing',
    'participate',
    'participation',
    'next',
    'near',
    'after',
    'before',
    'within',
    'into',
    'from',
    'case',
    'days',
    'hours',
    'week',
    'weeks',
    'mv',
  ])

  return (question.toLowerCase().match(/[a-z0-9$]+/g) ?? [])
    .map((term) => normalizeSearchText(term.replace(/^\$/, '')))
    .filter((term) => term.length > 2 && !stopwords.has(term))
    .flatMap((term) => {
      const cryptoAlias = cryptoAliases[term]
      return cryptoAlias && cryptoAlias !== term ? [term, cryptoAlias] : [term]
    })
}

export function getCryptoAssetIds(question: string) {
  const tokens = question.toLowerCase().match(/[a-z$]+/g) ?? []
  const ids = new Set<string>()

  for (const token of tokens) {
    const normalized = token.replace(/^\$/, '')
    const id = cryptoAliases[normalized]

    if (id) {
      ids.add(id)
    }
  }

  return [...ids]
}

export function getStockSymbols(question: string) {
  const explicit = [...question.matchAll(/\$([A-Z]{1,5})\b/g)].map((match) => match[1])
  const standaloneTickers = [...question.matchAll(/\b[A-Z]{2,5}\b/g)]
    .map((match) => match[0])
    .filter((symbol) => !commonUppercaseWords.has(symbol))

  return [...new Set([...explicit, ...standaloneTickers])].slice(0, 4)
}

export function getEntityCandidates(question: string) {
  const normalized = question.replace(/https?:\/\/\S+/g, ' ')
  const quoted = [...normalized.matchAll(/["“”']([^"“”']{2,80})["“”']/g)].map((match) => match[1].trim())
  const capitalized = [...normalized.matchAll(/\b(?:[A-Z][A-Za-z0-9&.'-]*)(?:\s+(?:[A-Z][A-Za-z0-9&.'-]*|of|and|&|the|for)){0,5}/g)]
    .map((match) => match[0].trim())
    .filter((value) => value.length > 2 && !/^(Will|What|When|Which|Who|How|By|Yes|No|Up|Down)$/i.test(value))
  const tickers = getStockSymbols(question)

  return [...new Set([...quoted, ...capitalized, ...tickers])].slice(0, 8)
}

export function getMarketGenres(question: string): MarketGenre[] {
  const text = question.toLowerCase()
  const genres: MarketGenre[] = []
  const add = (genre: MarketGenre, pattern: RegExp) => {
    if (pattern.test(text)) genres.push(genre)
  }

  add('geopolitics', /\b(ceasefire|peace deal|sanction|war|strike|military|airspace|diplomatic|embassy|treaty|nuclear|border|territory|iran|ukraine|china|russia|israel|gaza|nato|un\b|foreign minister)\b/)
  add('politics', /\b(election|primary|nominee|president|senate|house|governor|mayor|party|minister|parliament|congress|poll|resign|out by|cabinet)\b/)
  add('sports', /\b(nba|nfl|nhl|mlb|epl|fifa|world cup|champion|playoffs|arsenal|match|game|player|team|squad|roster|goal|score|vs\.?|ufc|ipl)\b/)
  add('crypto', /\b(btc|bitcoin|eth|ethereum|sol|solana|crypto|token|coin|stablecoin|usdc|defi|airdrop|blockchain|wallet|onchain)\b/)
  add('macro', /\b(fed|rate|bps|cpi|inflation|gdp|jobs|unemployment|recession|treasury|yield|oil|wti|gold|commodity|commodities)\b/)
  add('business', /\b(earnings|ipo|stock|shares|company|sells|buys|bitcoin treasury|revenue|profit|ceo|merger|acquisition|bankruptcy|guidance)\b/)
  add('culture', /\b(album|sales|box office|movie|music|drake|oscars|grammy|celebrity|gta|game release|streaming|tv)\b/)
  add('weather', /\b(weather|rain|storm|hurricane|temperature|flood|airspace|heat|snow|wind)\b/)
  add('health', /\b(pandemic|virus|hantavirus|disease|outbreak|vaccine|who\b|cdc\b|health)\b/)
  add('science-tech', /\b(ai|model|gemini|spacex|rocket|launch|satellite|ufo|aliens|declassif|technology|science)\b/)
  add('social', /\b(tweet|tweets|post|posts|followers|photographed|mention|mentions|interview|say during|will .* say)\b/)
  add('transport', /\b(port|shipping|shipment|flight|airport|airspace|strait|canal|rail|transport|logistics)\b/)
  add('legal-regulatory', /\b(law|bill|act|signed into law|sec\b|cftc\b|court|judge|lawsuit|regulation|regulatory|clarity act)\b/)

  return [...new Set(genres)]
}

export function getUsdTarget(question: string) {
  const compactMatch = question.match(/\$?\b([0-9]{1,4})(?:\.\d+)?\s*k\b/i)
  if (compactMatch?.[1]) {
    const value = Number(compactMatch[1]) * 1000
    return Number.isFinite(value) ? value : undefined
  }

  const match = question.match(/\$?\b([0-9]{2,3}(?:,[0-9]{3})+|[0-9]{4,9})(?:\.\d+)?\b/)
  if (!match?.[1]) return undefined

  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? value : undefined
}

export function normalizeSearchText(value = '') {
  return value
    .toLowerCase()
    .replace(/\$?\b([0-9]{1,3}),([0-9]{3})\b/g, '$1$2')
    .replace(/\b([0-9]+)k\b/g, (_, amount: string) => `${Number(amount) * 1000}`)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const commonUppercaseWords = new Set([
  'US',
  'UK',
  'EU',
  'UN',
  'FBI',
  'CIA',
  'SEC',
  'GDP',
  'CPI',
  'NBA',
  'NFL',
  'NHL',
  'MLB',
  'EPL',
  'FIFA',
  'UFC',
  'IPO',
  'ETF',
  'TV',
  'AI',
])

export function getSportsSearchQuery(question: string) {
  const cleaned = question
    .replace(/^\s*will\s+/i, '')
    .replace(/[?]/g, ' ')
  const versusMatch = cleaned.match(/([A-Za-z .-]{2,30}?)\s+(?:vs\.?|versus|v)\s+([A-Za-z .-]{2,30}?)(?:\s+(?:go|win|cover|close|over|under|by|on|at|in)\b|$)/i)

  if (versusMatch) {
    return `${versusMatch[1].trim()} vs ${versusMatch[2].trim()}`
  }

  return getCaseSearchQuery(cleaned)
}

export function getPossibleLocation(question: string) {
  const explicit = question.match(/\b(?:location|place|city|region|country)\s*:\s*([A-Z][A-Za-z\s,.-]{2,60})(?:[.;]|$)/i)
  if (explicit?.[1]) return cleanLocationCandidate(explicit[1])

  const prepositionMatch = question.match(/\b(?:in|near|around|at|for)\s+([A-Z][A-Za-z\s,.-]{2,60})(?:\?|,|\.| after| before| over| within| disrupt| affect| impact| delay| close| open| win| lose| by| on|$)/)
  const prepositionLocation = cleanLocationCandidate(prepositionMatch?.[1])
  if (prepositionLocation) return prepositionLocation

  const affectedPlaceMatch = question.match(/\b(?:disrupt|affect|impact|delay|close|open|hit|strike|flood|rain over|rain in)\s+([A-Z][A-Za-z\s,.-]{2,60})(?:\?|,|\.| after| before| within| by| on| in | next|$)/)
  const affectedPlace = cleanLocationCandidate(affectedPlaceMatch?.[1])
  if (affectedPlace) return affectedPlace

  return undefined
}

function cleanLocationCandidate(location: string | undefined) {
  if (!location) return undefined
  const cleaned = location
    .replace(/\b(?:disrupt|affect|impact|delay|close|open|win|lose|by|on)\b.*$/i, '')
    .replace(/\b(?:port|ports|airport|airports|logistics|shipping|market|markets|weather|forecast|case|cases|outbreak|event|events|interview|price|prices|odds|hearing)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[,.\s]+$/g, '')
    .trim()
  if (cleaned.length < 2) return undefined
  return cleaned
}

export function getPossibleCountryCode(question: string) {
  const normalized = question.toLowerCase()
  const location = getPossibleLocation(question)?.toLowerCase()

  for (const [alias, code] of Object.entries(countryAliases)) {
    if (normalized.includes(alias) || location?.includes(alias)) return code
  }

  return undefined
}

export function getAddresses(question: string) {
  return [...question.matchAll(/0x[a-fA-F0-9]{40}/g)].map((match) => match[0])
}

export function getSolanaAddresses(question: string) {
  return [...question.matchAll(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g)]
    .map((match) => match[0])
    .filter((address) => !address.startsWith('0x'))
}
