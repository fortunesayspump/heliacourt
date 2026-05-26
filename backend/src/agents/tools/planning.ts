import type { MarketCase, ToolEvidence } from '../../court/types'
import { generateRawJson } from '../model'
import { agentRegistry } from '../registry'
import { executableCapabilities } from './capabilities'
import { getMarketGenres } from './text'
import type { ToolIntent, ToolPlan } from './types'

type ToolPlanJson = {
  intents?: Array<{
    capability?: ToolEvidence['capability']
    reason?: string
    primary?: boolean
  }>
}

export async function planWitnessTools(agentId: string, marketCase: MarketCase, instruction: string): Promise<ToolPlan> {
  if (process.env.HELIA_AI_TOOL_PLANNER !== 'false') {
    const aiPlan = await planWitnessToolsWithAi(agentId, marketCase, instruction)
    if (aiPlan?.intents.length) return aiPlan
  }

  return planWitnessToolsDeterministically(agentId, marketCase, instruction)
}

async function planWitnessToolsWithAi(agentId: string, marketCase: MarketCase, instruction: string): Promise<ToolPlan | undefined> {
  const agent = agentRegistry.find((entry) => entry.id === agentId)
  if (!agent) return undefined

  const capabilities = executableCapabilities()
  const result = await generateRawJson<ToolPlanJson>({
    temperature: 0.1,
    system: [
      'You are the tool planner inside an AI witness.',
      'Select only the tools needed for this witness to answer the current court instruction.',
      'The witness is an AI with tools: do not rely on keyword templates, reason from the actual question, context, instruction, and witness role.',
      'Choose primary tools for direct evidence. Add supporting tools only when they materially reduce uncertainty or can verify a gap.',
      'When an instruction includes candidate source URLs from prior evidence, a scraper/source-quality/timeline/research witness should inspect those URLs before asking the user for links.',
      'For unresolved will-markets, prefer tools that test catalysts, blockers, timing windows, and mechanism evidence instead of only checking whether the event already happened.',
      'If this witness lacks the right tool, choose no tool or one narrow supporting check; the speaking AI can request another witness later.',
      'Return JSON only.',
    ].join('\n'),
    user: JSON.stringify({
      witness: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        ownToolCapabilities: agent.toolCapabilities,
      },
      marketCase,
      instruction,
      executableCapabilities: capabilities,
      outputShape: {
        intents: [
          {
            capability: 'one executable capability',
            reason: 'why this tool is needed for the current witness turn',
            primary: true,
          },
        ],
      },
      constraints: [
        'Use only executableCapabilities.',
        'Prefer 1-3 tools. Use 0 tools if this witness cannot usefully gather evidence.',
        'Do not add a scrape or screenshot just because a page might exist; add it when exact page text or visible evidence matters.',
        'Do not add prediction market data unless odds, liquidity, market price, or market existence matters.',
        'Do not add structured weather/sports/calendar data unless the case has a location, team/event, date, or operational timing that the data can measure.',
      ],
    }),
  })

  if (!result.ok) return undefined

  const rawIntents = Array.isArray(result.content.intents) ? result.content.intents : []
  const primary: ToolIntent[] = []
  const supporting: ToolIntent[] = []

  for (const raw of rawIntents) {
    if (!raw.capability || !capabilities.some((capability) => capability.capability === raw.capability)) continue
    const intent = {
      capability: raw.capability,
      reason: raw.reason?.trim() || `AI planner selected ${raw.capability} for ${agent.name}.`,
    }
    if (raw.primary !== false) primary.push(intent)
    else supporting.push(intent)
  }

  const intents = dedupeIntents([...primary, ...supporting]).slice(0, 5)
  if (!intents.length) return undefined
  const primaryCount = Math.max(1, Math.min(primary.length || intents.length, intents.length))
  return { intents, primaryCount }
}

function planWitnessToolsDeterministically(agentId: string, marketCase: MarketCase, instruction: string): ToolPlan {
  const text = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''} ${instruction}`.toLowerCase()
  const primaryIntents = planPrimaryWitnessTools(agentId, marketCase, text)
  const supportingIntents = planSupportingContextTools(agentId, marketCase, text, primaryIntents)
  const intents = dedupeIntents([...primaryIntents, ...supportingIntents])

  return { intents, primaryCount: primaryIntents.length }
}

function planPrimaryWitnessTools(agentId: string, marketCase: MarketCase, text: string): ToolIntent[] {
  switch (agentId) {
    case 'web-scraper-witness':
      return [{ capability: 'web_page_scrape', reason: 'Aletheia needs to scrape supplied or ledger-discovered URLs and extract exact page claims, dates, source trails, and relevance to the resolution rule.' }]
    case 'visual-evidence-witness':
      return [{ capability: 'visual_page_analysis', reason: 'Eikon needs to inspect supplied images or screenshots for visible text, charts, timestamps, logos, and visual-only evidence.' }]
    case 'pythia-prediction-witness': {
      const intents: ToolIntent[] = [{ capability: 'prediction_market_data', reason: 'Pythia needs market odds, crypto prices, liquidity, and target-distance context for prediction-market testimony.' }]
      if (/\b(stock|equity|shares|\$[A-Z]{1,5}\b|[A-Z]{2,5}|btc|bitcoin|eth|ethereum|sol|solana|crypto|price target)\b/i.test(marketCase.question)) {
        intents.push({ capability: 'market_data', reason: 'The question mentions tradfi/crypto price context, so quote, trend, volatility, and target-distance data may support the market read.' })
      }
      return intents
    }
    case 'hermes-news-witness':
      return [{ capability: 'web_news_search', reason: 'Hermes needs current source flow and reference context, then must filter irrelevant or stale hits before testimony.' }]
    case 'social-count-witness':
      return [{ capability: 'social_activity_data', reason: 'Thales needs an audited account handle, counting window, and social activity provider/archive evidence for exact post-count testimony.' }]
    case 'argos-onchain-witness':
      return /\b(0x[a-f0-9]{40}|wallet|onchain|exchange flow|address|stablecoin|transfer)\b/i.test(text)
        ? [{ capability: 'onchain_data', reason: 'The question or examination asks about wallet, address, exchange-flow, transfer, or stablecoin evidence.' }]
        : []
    case 'notus-weather-data-witness': {
      const intents: ToolIntent[] = []
      if (/\b(weather|rain|storm|flood|wind|temperature|port|flight|shipment|logistics|delay|disrupt)\b/i.test(text)) {
        intents.push({ capability: 'weather_data', reason: 'The question needs measured conditions or forecast data tied to a location and horizon.' })
      }
      if (/\b(sport|sports|game|match|team|player|squad|roster|national team|fifa|world cup|win|cover|score)\b/i.test(text)) {
        intents.push({ capability: 'sports_data', reason: 'The question looks sports-specific, so event and odds data may be relevant.' })
      }
      if (/\b(holiday|calendar|business day|deadline|horizon|expiry|expires|by|before|after|date|port|flight|shipment|logistics|market open|market close)\b/i.test(text)) {
        intents.push({ capability: 'calendar_data', reason: 'The question may depend on public holidays, market/business days, or operational-calendar context.' })
      }
      if (/\b(stock|equity|shares|\$[A-Z]{1,5}\b|[A-Z]{2,5})\b/.test(marketCase.question)) {
        intents.push({ capability: 'market_data', reason: 'The question includes stock/equity context that may need quote data.' })
      }
      return intents
    }
    case 'skepsis-source-quality-witness':
      return [
        { capability: 'web_news_search', reason: 'Skepsis needs source flow to grade authority, freshness, directness, and conflicts.' },
        { capability: 'web_page_scrape', reason: 'Skepsis needs exact page extraction to verify what cited or discovered sources actually prove.' },
      ]
    case 'chronos-timeline-witness':
      return [
        { capability: 'web_news_search', reason: 'Chronos needs source timestamps and event timing from search/news results.' },
        { capability: 'web_page_scrape', reason: 'Chronos needs exact page dates, publication timing, and dated source passages.' },
        { capability: 'calendar_data', reason: 'Chronos uses calendar data when deadlines, horizons, market days, or public holidays matter.' },
      ]
    case 'sophia-research-witness':
      return [
        { capability: 'web_news_search', reason: 'Sophia needs broad source discovery and fresh context before synthesizing research.' },
        { capability: 'web_page_scrape', reason: 'Sophia needs exact page content so broad research stays tied to sources.' },
      ]
    case 'numeros-quant-witness': {
      const intents: ToolIntent[] = [{ capability: 'prediction_market_data', reason: 'Numeros needs market-implied probabilities, liquidity, and nearby prediction-market structure.' }]
      if (/\b(price|reach|above|below|close|ath|all time high|stock|equity|shares|\$[A-Z]{1,5}\b|btc|bitcoin|eth|ethereum|sol|solana|volatility|funding|expiry)\b/i.test(text)) {
        intents.push({ capability: 'market_data', reason: 'Numeros needs quote/price context for distance, volatility, and numerical constraints.' })
      }
      return intents
    }
    default:
      return []
  }
}

function planSupportingContextTools(agentId: string, marketCase: MarketCase, text: string, primaryIntents: ToolIntent[]): ToolIntent[] {
  const intents: ToolIntent[] = []
  const genres = getMarketGenres(text)
  const has = (capability: ToolEvidence['capability']) => primaryIntents.some((intent) => intent.capability === capability)
  const isCrypto = /\b(btc|bitcoin|eth|ethereum|sol|solana|crypto|token|coin|stablecoin|usdc)\b/i.test(text)
  const isEventOrOperational = genres.some((genre) => ['politics', 'geopolitics', 'business', 'culture', 'weather', 'health', 'science-tech', 'social', 'transport', 'legal-regulatory'].includes(genre))
    || /\b(news|headline|source|report|announce|election|policy|weather|rain|storm|flood|port|flight|shipment|logistics|delay|disrupt|supply|outage|hack|lawsuit|regulation)\b/i.test(text)
  const isMarketOrPrice = /\b(price|reach|above|below|close|ath|all time high|odds|liquidity|volatility|funding|expiry)\b/i.test(text)
  const isTimeSensitive = /\b(within|next|today|tomorrow|hours?|days?|week|deadline|horizon|expiry|after|before)\b/i.test(text)
  const isAddressOrFlow = /\b(0x[a-f0-9]{40}|wallet|onchain|exchange flow|address|stablecoin|transfer|bridge|mint|burn)\b/i.test(text)
  const isStock = /\b(stock|equity|shares|\$[A-Z]{1,5}\b|nvidia|tesla|apple|microsoft|google|meta|amazon|coinbase|mstr)\b/i.test(marketCase.question)
  const isSports = /\b(vs\.?|versus|nba|nfl|mlb|nhl|epl|ufc|soccer|football|basketball|baseball|hockey|tennis|atp|wta|roland garros|ipl|cricket|match|game|player|squad|roster|national team|world cup|fifa|spread|total)\b/i.test(text)
  const asksForExactSources = /https?:\/\//i.test(text) || /\b(scrape|website|url|page|official|credible|source|reported|article|forecast|roster|squad|fifa|weather site)\b/i.test(text)
  const asksVisualEvidence = /\b(image|photo|picture|screenshot|visual|chart|graph|map|diagram|tweet image|market card|read image|screen grab|screengrab)\b/i.test(text)
  const suppliedSocialProfile = /https?:\/\/(?:www\.)?(?:tiktok\.com\/@|instagram\.com\/|x\.com\/|twitter\.com\/|youtube\.com\/@)/i.test(text)
  const asksSocialCount = /\b(tweet|tweets|post|posts|followers|mentions?)\b/i.test(text)
    && /\b(#|number|count|how many|between|at least|more than|less than|from|during|week|daily)\b/i.test(text)

  if (agentId === 'social-count-witness') {
    const socialSupporting: ToolIntent[] = []
    if (!has('visual_page_analysis') && (asksVisualEvidence || asksSocialCount || suppliedSocialProfile)) {
      socialSupporting.push({ capability: 'visual_page_analysis', reason: 'Thales supporting context: inspect rendered screenshots/images when social counters may only be visible on the profile page.' })
    }
    if (!has('web_page_scrape') && asksForExactSources && /\b(scrape|source|official|page text|profile html|website text)\b/i.test(text)) {
      socialSupporting.push({ capability: 'web_page_scrape', reason: 'Thales supporting context: scrape exact supplied/source pages when examination asks for source text beyond social profile counters.' })
    }
    return socialSupporting
  }

  if (agentId !== 'social-count-witness' && !has('social_activity_data') && asksSocialCount) {
    intents.push({ capability: 'social_activity_data', reason: 'Supporting context: social count markets need audited account/window/count evidence, not just narrative source flow.' })
  }
  if (agentId !== 'hermes-news-witness' && !has('web_news_search') && (isEventOrOperational || isCrypto || isMarketOrPrice)) {
    intents.push({ capability: 'web_news_search', reason: 'Supporting context: current search/news flow can confirm whether the primary testimony is missing obvious fresh catalysts or source-quality issues.' })
  }
  if (agentId !== 'pythia-prediction-witness' && !has('prediction_market_data') && (isCrypto || marketCase.type === 'prediction-market' || /\b(polymarket|kalshi|manifold|prediction market|odds|price target|reach|above|below|close)\b/i.test(text))) {
    intents.push({ capability: 'prediction_market_data', reason: 'Supporting context: prediction-market and price-distance evidence can help compare factual testimony against market-implied expectations.' })
  }
  if (!has('market_data') && (isStock || isCrypto)) {
    intents.push({ capability: 'market_data', reason: 'Supporting context: quote, trend, realized volatility, and drawdown data can anchor numerical claims about current market movement.' })
  }
  if (!has('sports_data') && isSports) {
    intents.push({ capability: 'sports_data', reason: 'Supporting context: sports markets need schedule, live/final status, team/player, and event data before counsel argues from generic sports narratives.' })
  }
  if (agentId !== 'argos-onchain-witness' && !has('onchain_data') && isAddressOrFlow) {
    intents.push({ capability: 'onchain_data', reason: 'Supporting context: address or transfer language requires address-level public RPC checks before anyone argues flow.' })
  }
  if (!has('calendar_data') && isTimeSensitive) {
    intents.push({ capability: 'calendar_data', reason: 'Supporting context: deadlines, days remaining, business days, holidays, and operational calendars can limit or explain the event horizon.' })
  }
  if (agentId !== 'web-scraper-witness' && !has('web_page_scrape') && (asksForExactSources || isEventOrOperational)) {
    intents.push({ capability: 'web_page_scrape', reason: 'Supporting context: exact page extraction can verify what cited or search-discovered sources actually say.' })
  }
  if (agentId !== 'visual-evidence-witness' && !has('visual_page_analysis') && asksVisualEvidence) {
    intents.push({ capability: 'visual_page_analysis', reason: 'Supporting context: visual evidence may contain text, chart values, labels, or screenshot-only claims that normal scraping misses.' })
  }

  return intents
}

function dedupeIntents(intents: ToolIntent[]) {
  const seen = new Set<ToolEvidence['capability']>()
  const output: ToolIntent[] = []

  for (const intent of intents) {
    if (seen.has(intent.capability)) continue
    seen.add(intent.capability)
    output.push(intent)
  }

  return output
}
