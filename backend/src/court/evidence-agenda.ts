import { getMarketGenres } from '../agents/tools/text'
import type { MarketCase, ToolEvidence } from './types'
import { buildCourtClock, describeCourtClock } from './court-time'

export type EvidenceAgendaItem = {
  id: string
  label: string
  whyItMatters: string
  preferredCapabilities: ToolEvidence['capability'][]
  preferredWitnesses: string[]
}

export type EvidenceAgenda = {
  resolutionRule: string
  courtClock: string
  genres: string[]
  requiredFacts: EvidenceAgendaItem[]
  sourcePlan: string[]
  uncertaintyMap: string[]
  initialWitnessFocus: string[]
}

export function buildEvidenceAgenda(marketCase: MarketCase): EvidenceAgenda {
  const text = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''}`
  const genres = getMarketGenres(text)
  const lower = text.toLowerCase()
  const requiredFacts = dedupeAgendaItems([
    resolutionRuleItem(marketCase),
    eventOutcomeStructureItem(),
    deadlineItem(),
    directResolutionStatusItem(),
    futurePathwayItem(),
    marketContextItem(),
    quantBridgeItem(),
    ...domainAgendaItems(lower, genres),
    sourceQualityItem(),
  ])

  return {
    resolutionRule: marketCase.context
      ? `Use this resolution rule: ${marketCase.context}`
      : `Infer the resolution rule from the case question; flag ambiguity before verdict: ${marketCase.question}`,
    courtClock: describeCourtClock(buildCourtClock(marketCase)),
    genres,
    requiredFacts,
    sourcePlan: buildSourcePlan(lower, genres),
    uncertaintyMap: buildUncertaintyMap(lower, genres),
    initialWitnessFocus: requiredFacts
      .flatMap((item) => item.preferredWitnesses.map((witness) => `${witness}: ${item.label}`))
      .slice(0, 10),
  }
}

export function summarizeEvidenceAgenda(agenda: EvidenceAgenda | undefined, maxItems = 8) {
  if (!agenda) return undefined

  return {
    resolutionRule: agenda.resolutionRule,
    courtClock: agenda.courtClock,
    genres: agenda.genres,
    requiredFacts: agenda.requiredFacts.slice(0, maxItems).map((item) => ({
      id: item.id,
      label: item.label,
      whyItMatters: item.whyItMatters,
      preferredCapabilities: item.preferredCapabilities,
      preferredWitnesses: item.preferredWitnesses,
    })),
    sourcePlan: agenda.sourcePlan.slice(0, maxItems),
    uncertaintyMap: agenda.uncertaintyMap.slice(0, maxItems),
    initialWitnessFocus: agenda.initialWitnessFocus.slice(0, maxItems),
  }
}

function resolutionRuleItem(marketCase: MarketCase): EvidenceAgendaItem {
  return {
    id: 'resolution-rule',
    label: 'Resolution rule and qualifying event',
    whyItMatters: marketCase.context
      ? 'Every factual claim must match the supplied resolution rule, not just the headline.'
      : 'The court cannot score evidence until it knows what exactly counts.',
    preferredCapabilities: ['web_page_scrape', 'web_news_search'],
    preferredWitnesses: ['skepsis-source-quality-witness', 'web-scraper-witness'],
  }
}

function eventOutcomeStructureItem(): EvidenceAgendaItem {
  return {
    id: 'event-outcome-structure',
    label: 'Binary contract vs multi-outcome event structure',
    whyItMatters: 'Event pages can contain many contracts, candidates, dates, thresholds, or Yes/No pairs; the court must forecast the filed outcome while using sibling outcomes for calibration.',
    preferredCapabilities: ['prediction_market_data', 'web_page_scrape'],
    preferredWitnesses: ['pythia-prediction-witness', 'web-scraper-witness', 'skepsis-source-quality-witness'],
  }
}

function deadlineItem(): EvidenceAgendaItem {
  return {
    id: 'deadline-window',
    label: 'Deadline, time remaining, reporting lag, and event window',
    whyItMatters: 'A future-event forecast depends on whether a plausible mechanism can complete before the deadline.',
    preferredCapabilities: ['calendar_data', 'web_news_search', 'web_page_scrape'],
    preferredWitnesses: ['chronos-timeline-witness'],
  }
}

function futurePathwayItem(): EvidenceAgendaItem {
  return {
    id: 'future-pathway-catalysts',
    label: 'Future pathway, catalysts, loopholes, and blockers',
    whyItMatters: 'For unresolved will-markets, the forecast turns on what could still happen before the deadline, not only whether the event has happened already.',
    preferredCapabilities: ['web_news_search', 'web_page_scrape', 'calendar_data', 'prediction_market_data'],
    preferredWitnesses: ['hermes-news-witness', 'chronos-timeline-witness', 'sophia-research-witness', 'numeros-quant-witness'],
  }
}

function directResolutionStatusItem(): EvidenceAgendaItem {
  return {
    id: 'direct-resolution-status',
    label: 'Direct status from official or primary resolution sources',
    whyItMatters: 'Direct evidence settles past/resolved cases and anchors unresolved cases without overreading background news.',
    preferredCapabilities: ['web_news_search', 'web_page_scrape', 'visual_page_analysis'],
    preferredWitnesses: ['hermes-news-witness', 'web-scraper-witness', 'skepsis-source-quality-witness'],
  }
}

function marketContextItem(): EvidenceAgendaItem {
  return {
    id: 'market-context',
    label: 'Prediction-market odds, volume, liquidity, and API/search misses',
    whyItMatters: 'Market odds are calibration context, not proof; liquidity and search misses decide how much weight to give them.',
    preferredCapabilities: ['prediction_market_data', 'market_data'],
    preferredWitnesses: ['pythia-prediction-witness', 'numeros-quant-witness'],
  }
}

function quantBridgeItem(): EvidenceAgendaItem {
  return {
    id: 'scenario-probability-bridge',
    label: 'Scenario tree or probability bridge from facts to forecast',
    whyItMatters: 'The court needs a mechanism, blocker, and rough range rather than a pile of source summaries.',
    preferredCapabilities: ['prediction_market_data', 'market_data', 'web_news_search'],
    preferredWitnesses: ['numeros-quant-witness', 'sophia-research-witness'],
  }
}

function sourceQualityItem(): EvidenceAgendaItem {
  return {
    id: 'source-quality',
    label: 'Source authority, freshness, directness, and missing-source limits',
    whyItMatters: 'A good forecast distinguishes official/direct evidence from fresh but indirect reporting.',
    preferredCapabilities: ['web_news_search', 'web_page_scrape', 'visual_page_analysis'],
    preferredWitnesses: ['skepsis-source-quality-witness', 'web-scraper-witness'],
  }
}

function domainAgendaItems(text: string, genres: string[]): EvidenceAgendaItem[] {
  const items: EvidenceAgendaItem[] = []

  if (genres.includes('health') || /\b(ebola|virus|pandemic|outbreak|case|cdc|who|health)\b/i.test(text)) {
    items.push({
      id: 'health-official-status',
      label: 'Official health status, affected geography, and case definition',
      whyItMatters: 'Health markets usually hinge on official case definitions, reporting geography, and whether exposure can cross the market boundary.',
      preferredCapabilities: ['web_news_search', 'web_page_scrape'],
      preferredWitnesses: ['hermes-news-witness', 'web-scraper-witness', 'skepsis-source-quality-witness'],
    })
    items.push({
      id: 'health-transmission-pathway',
      label: 'Transmission/importation pathway, controls, and failure modes',
      whyItMatters: 'A future health event needs a plausible route from current outbreak facts to the target jurisdiction by deadline.',
      preferredCapabilities: ['web_news_search', 'web_page_scrape', 'calendar_data'],
      preferredWitnesses: ['chronos-timeline-witness', 'sophia-research-witness', 'numeros-quant-witness'],
    })
  }

  if (genres.includes('sports') || /\b(player|team|match|game|roster|squad|fifa|nba|nfl|nhl|epl|world cup)\b/i.test(text)) {
    items.push({
      id: 'sports-eligibility-status',
      label: 'Official roster, eligibility, injury/status, and match-window evidence',
      whyItMatters: 'Sports markets often resolve from official participation/status, not generic commentary.',
      preferredCapabilities: ['sports_data', 'web_news_search', 'web_page_scrape'],
      preferredWitnesses: ['notus-weather-data-witness', 'hermes-news-witness', 'web-scraper-witness'],
    })
  }

  if (genres.includes('politics') || genres.includes('geopolitics') || /\b(trump|iran|election|law|bill|deal|sanction|government|white house|congress)\b/i.test(text)) {
    items.push({
      id: 'official-policy-action',
      label: 'Official government action, legal text, announcement, and implementation status',
      whyItMatters: 'Political/geopolitical markets need official acts and implementation, not only reported intent.',
      preferredCapabilities: ['web_news_search', 'web_page_scrape', 'visual_page_analysis'],
      preferredWitnesses: ['hermes-news-witness', 'web-scraper-witness', 'skepsis-source-quality-witness'],
    })
  }

  if (genres.includes('social') || /\b(tweet|tweets|followers|instagram|tiktok|youtube|x\.com|twitter|post|posts)\b/i.test(text)) {
    items.push({
      id: 'social-visible-counts',
      label: 'Account identity, visible posts/followers/counts, and archived/screenshot evidence',
      whyItMatters: 'Social markets often need counts from JS-heavy pages, screenshots, or archives.',
      preferredCapabilities: ['social_activity_data', 'visual_page_analysis', 'web_page_scrape'],
      preferredWitnesses: ['social-count-witness', 'visual-evidence-witness', 'web-scraper-witness'],
    })
  }

  if (genres.includes('crypto') || /\b(btc|bitcoin|eth|ethereum|sol|solana|crypto|token|price|volatility)\b/i.test(text)) {
    items.push({
      id: 'price-distance-market-state',
      label: 'Current price, distance to threshold, volatility, and market structure',
      whyItMatters: 'Price/crypto markets need current state and distance-to-target before narrative arguments matter.',
      preferredCapabilities: ['market_data', 'prediction_market_data', 'web_news_search'],
      preferredWitnesses: ['pythia-prediction-witness', 'numeros-quant-witness'],
    })
  }

  return items
}

function buildSourcePlan(text: string, genres: string[]) {
  const plan = [
    'Start with direct/official resolution sources if named in the case context.',
    'For unresolved will-markets, use direct status only as the anchor; then search for catalysts, loopholes, blockers, and mechanisms that could still complete before the deadline.',
    'For multi-outcome event pages, identify the filed contract/outcome and inspect sibling contracts/outcomes for calibration pressure.',
    'Search broad news for fresh catalysts and blockers, then scrape the best pages before relying on snippets.',
    'If pages are JS-heavy, blocked, image-based, or social, escalate to screenshot/visual analysis.',
    'Treat prediction-market odds as calibration context and verify liquidity/search misses.',
  ]

  if (genres.includes('health') || /\b(cdc|who|outbreak|virus|case)\b/i.test(text)) {
    plan.push('For health markets, prefer CDC/WHO/government pages, then credible reporting for exposure pathways.')
  }
  if (genres.includes('sports')) plan.push('For sports markets, prefer official league/team/FIFA sources before commentary.')
  if (genres.includes('social')) plan.push('For social markets, verify account identity and visible counts with social tools or screenshots.')

  return plan
}

function buildUncertaintyMap(text: string, genres: string[]) {
  const map = [
    'Is there direct evidence matching the exact resolution wording?',
    'Is the filed item a single binary market or one contract inside a broader event with sibling outcomes?',
    'What is the strongest Yes mechanism and what would break it?',
    'What is the strongest No blocker and what evidence would overcome it?',
    'Does the timeline allow the mechanism before the deadline?',
    'What does the market price add beyond the factual record?',
  ]

  if (genres.includes('health') || /\b(outbreak|case|virus|ebola)\b/i.test(text)) {
    map.push('Is there a documented exposure/importation bridge to the target geography, or only background outbreak risk?')
  }

  return map
}

function dedupeAgendaItems(items: EvidenceAgendaItem[]) {
  const seen = new Set<string>()
  const output: EvidenceAgendaItem[] = []

  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    output.push(item)
  }

  return output
}
