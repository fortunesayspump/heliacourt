import type { MarketCase, ToolEvidence } from '../../court/types'
import { generateRawJson } from '../model'
import { agentRegistry } from '../registry'
import { getCalendarEvidence } from './calendar'
import { getMarketDataEvidence } from './market-data'
import { getNewsEvidence } from './news'
import { getOnchainEvidence } from './onchain'
import { getPredictionMarketEvidence } from './prediction-market'
import { getSocialActivityEvidence } from './social-activity'
import { getSportsEvidence } from './sports'
import { getMarketGenres } from './text'
import { getVisualPageEvidence } from './visual-analysis'
import { getWeatherEvidence } from './weather'
import { getWebPageScrapeEvidence } from './web-scraper'

type ToolIntent = {
  capability: ToolEvidence['capability']
  reason: string
}

type ToolPlanJson = {
  intents?: Array<{
    capability?: ToolEvidence['capability']
    reason?: string
    primary?: boolean
  }>
}

type ToolActionJson = {
  action?: 'call_tool' | 'finish'
  capability?: ToolEvidence['capability']
  reason?: string
}

const toolEvidenceCache = new Map<string, { createdAt: number; evidence: ToolEvidence }>()
const toolEvidenceCacheTtlMs = 2 * 60 * 1000

export async function getWitnessToolEvidence(agentId: string, marketCase: MarketCase, instruction = ''): Promise<ToolEvidence[]> {
  if (process.env.HELIA_AI_TOOL_LOOP !== 'false') {
    const loopEvidence = await runAiToolLoop(agentId, marketCase, instruction)
    if (loopEvidence?.length) return loopEvidence
  }

  const plan = await planWitnessTools(agentId, marketCase, instruction)
  const intents = plan.intents
  const evidence = await Promise.all(intents.map((intent) => runToolIntentWithTimeout(intent.capability, marketCase, instruction)))
  const fallbackVisualReason = getVisualFallbackReason(agentId, marketCase, instruction, intents, evidence)

  if (fallbackVisualReason) {
    evidence.push(await runToolIntentWithTimeout('visual_page_analysis', marketCase, instruction))
    intents.push({
      capability: 'visual_page_analysis',
      reason: fallbackVisualReason,
    })
  }

  return evidence.map((item, index) => ({
    ...item,
    selected: true,
    relevance: index < plan.primaryCount ? 'primary' : item.status === 'ok' ? 'supporting' : 'low',
    plannerReason: intents[index]?.reason,
  }))
}

async function runAiToolLoop(agentId: string, marketCase: MarketCase, instruction: string): Promise<ToolEvidence[] | undefined> {
  const agent = agentRegistry.find((entry) => entry.id === agentId)
  if (!agent) return undefined

  const maxCalls = readPositiveIntegerEnv('HELIA_AI_TOOL_LOOP_MAX_CALLS', 3)
  const capabilities = executableCapabilities()
  const evidence: ToolEvidence[] = []
  const used = new Set<ToolEvidence['capability']>()

  for (let index = 0; index < maxCalls; index += 1) {
    const decision = await decideNextToolCall({
      agent,
      marketCase,
      instruction,
      capabilities,
      evidence,
    })
    if (!decision || decision.action !== 'call_tool' || !decision.capability) break
    if (used.has(decision.capability)) break
    if (!capabilities.some((capability) => capability.capability === decision.capability)) break

    used.add(decision.capability)
    const item = await runToolIntentWithTimeout(decision.capability, marketCase, instruction)
    evidence.push({
      ...item,
      selected: true,
      relevance: index === 0 ? 'primary' : item.status === 'ok' ? 'supporting' : 'low',
      plannerReason: decision.reason ?? `AI witness called ${decision.capability}.`,
    })

    const fallbackVisualReason = getVisualFallbackReason(agentId, marketCase, instruction, [...used].map((capability) => ({ capability, reason: 'AI witness tool loop' })), evidence)
    if (fallbackVisualReason && !used.has('visual_page_analysis')) {
      used.add('visual_page_analysis')
      const visualEvidence = await runToolIntentWithTimeout('visual_page_analysis', marketCase, instruction)
      evidence.push({
        ...visualEvidence,
        selected: true,
        relevance: visualEvidence.status === 'ok' ? 'supporting' : 'low',
        plannerReason: fallbackVisualReason,
      })
    }
  }

  return evidence.length ? evidence : undefined
}

async function decideNextToolCall({
  agent,
  marketCase,
  instruction,
  capabilities,
  evidence,
}: {
  agent: NonNullable<ReturnType<typeof agentRegistry.find>>
  marketCase: MarketCase
  instruction: string
  capabilities: ReturnType<typeof executableCapabilities>
  evidence: ToolEvidence[]
}): Promise<ToolActionJson | undefined> {
  const result = await generateRawJson<ToolActionJson>({
    temperature: 0.15,
    system: [
      'You are the tool-use brain inside an AI witness.',
      'Decide the next tool call, one step at a time, after reading prior tool observations.',
      'This is not keyword routing. Reason from the witness role, the court instruction, the case context, and what prior tools did or did not answer.',
      'Call a tool only if it can materially improve the witness answer. Finish when enough evidence exists or the next step should be another witness, not another tool.',
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
      priorToolEvidence: evidence.map((item) => ({
        capability: item.capability,
        provider: item.provider,
        status: item.status,
        relevance: item.relevance,
        plannerReason: item.plannerReason,
        observations: item.observations.slice(0, 3),
        sources: item.sources.slice(0, 4).map((source) => ({
          title: source.title,
          url: source.url,
          observedAt: source.observedAt,
        })),
        error: item.error,
      })),
      outputShape: {
        action: 'call_tool or finish',
        capability: 'only when action is call_tool',
        reason: 'why this tool is the next best action',
      },
      constraints: [
        'Use only executableCapabilities.',
        'Do not call the same capability twice.',
        'If a different witness is needed, finish; the speaking witness can request that witness in its final JSON.',
        'If prior evidence already answers the narrow request, finish.',
      ],
    }),
  })

  if (!result.ok) return undefined
  return result.content
}

async function runToolIntentWithTimeout(capability: ToolEvidence['capability'], marketCase: MarketCase, instruction = '') {
  const timeoutMs = getToolTimeoutMs(capability)

  return Promise.race([
    runCachedToolIntent(capability, marketCase, instruction),
    new Promise<ToolEvidence>((resolve) => {
      setTimeout(() => {
        resolve({
          capability,
          provider: 'tool-timeout',
          query: marketCase.question,
          fetchedAt: new Date().toISOString(),
          status: 'error',
          observations: [`${capability} timed out after ${timeoutMs}ms; court should treat this as missing evidence, not a negative fact.`],
          sources: [],
          error: `Tool timed out after ${timeoutMs}ms`,
        })
      }, timeoutMs).unref?.()
    }),
  ])
}

function getToolTimeoutMs(capability: ToolEvidence['capability']) {
  const configured = Number(process.env.HELIA_TOOL_TIMEOUT_MS)
  if (Number.isFinite(configured) && configured > 0) return configured

  if (capability === 'visual_page_analysis') return Number(process.env.HELIA_VISUAL_TOOL_TIMEOUT_MS ?? 35_000)
  if (capability === 'web_page_scrape') return Number(process.env.HELIA_SCRAPE_TOOL_TIMEOUT_MS ?? 25_000)
  if (capability === 'web_news_search') return Number(process.env.HELIA_SEARCH_TOOL_TIMEOUT_MS ?? 20_000)
  if (capability === 'social_activity_data') return Number(process.env.HELIA_SOCIAL_TOOL_TIMEOUT_MS ?? 25_000)

  return 15_000
}

function getVisualFallbackReason(agentId: string, marketCase: MarketCase, instruction: string, intents: ToolIntent[], evidence: ToolEvidence[]) {
  if (agentId === 'visual-evidence-witness') return undefined
  if (intents.some((intent) => intent.capability === 'visual_page_analysis')) return undefined
  if (!canUseVisualFallback(marketCase, instruction)) return undefined

  const scrape = evidence.find((item) => item.capability === 'web_page_scrape')
  if (scrape && isWeakTextExtraction(scrape)) {
    return 'Fallback context: normal page scraping returned blocked, empty, gated, JS-only, or weak text evidence, so inspect a rendered screenshot for visible source content.'
  }

  const social = evidence.find((item) => item.capability === 'social_activity_data')
  if (social && isWeakTextExtraction(social)) {
    return 'Fallback context: social profile/count data was incomplete, so inspect a rendered screenshot for visible counters or account identity.'
  }

  return undefined
}

function canUseVisualFallback(marketCase: MarketCase, instruction: string) {
  const text = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''} ${instruction}`.toLowerCase()
  const hasUrl = /https?:\/\//i.test(text)
  const likelyVisualOrJsPage = /\b(tiktok|instagram|x\.com|twitter|youtube|polymarket|kalshi|market card|chart|graph|profile|followers|posts?|tweets?|video|watch|screenshot|image|visual)\b/i.test(text)
  const exactSourceRequest = /\b(scrape|source|official|page|website|transcript|quote|remarks|interview|read|visible)\b/i.test(text)

  return hasUrl || likelyVisualOrJsPage || exactSourceRequest
}

function isWeakTextExtraction(evidence: ToolEvidence) {
  if (evidence.status !== 'ok') return true
  const text = `${evidence.error ?? ''} ${evidence.observations.join(' ')}`.toLowerCase()

  return /\b(blocked|access denied|forbidden|captcha|bot protection|login|sign up|javascript|js-only|empty|shell|waf|challenge|no readable text|no visual target|did not expose|could not be inspected|unavailable)\b/i.test(text)
    || /does not prove: the page did not expose/i.test(text)
}

async function runCachedToolIntent(capability: ToolEvidence['capability'], marketCase: MarketCase, instruction = '') {
  const instructionKey = compactCacheKey(instruction)
  const key = `${marketCase.id}:${capability}:${marketCase.question}:${instructionKey}`
  const cached = toolEvidenceCache.get(key)

  if (cached && Date.now() - cached.createdAt < toolEvidenceCacheTtlMs) {
    return { ...cached.evidence, observations: [...cached.evidence.observations], sources: [...cached.evidence.sources] }
  }

  const evidence = await runToolIntent(capability, marketCase, instruction)
  toolEvidenceCache.set(key, { createdAt: Date.now(), evidence })

  return evidence
}

async function planWitnessTools(agentId: string, marketCase: MarketCase, instruction: string): Promise<{ intents: ToolIntent[]; primaryCount: number }> {
  if (process.env.HELIA_AI_TOOL_PLANNER !== 'false') {
    const aiPlan = await planWitnessToolsWithAi(agentId, marketCase, instruction)
    if (aiPlan?.intents.length) return aiPlan
  }

  return planWitnessToolsDeterministically(agentId, marketCase, instruction)
}

async function planWitnessToolsWithAi(agentId: string, marketCase: MarketCase, instruction: string): Promise<{ intents: ToolIntent[]; primaryCount: number } | undefined> {
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

function executableCapabilities() {
  return [
    { capability: 'prediction_market_data', description: 'Polymarket/Kalshi/Manifold odds, liquidity, market existence, and crypto target context.' },
    { capability: 'market_data', description: 'Crypto/equity/commodity quote and price-distance data.' },
    { capability: 'web_news_search', description: 'Fresh web/news/source discovery and headline flow.' },
    { capability: 'web_page_scrape', description: 'Exact supplied or discovered URL extraction, dates, page claims, and source trails.' },
    { capability: 'visual_page_analysis', description: 'Screenshot/image/page visual reading, visible text, charts, odds, labels, logos, and timestamps.' },
    { capability: 'social_activity_data', description: 'Public social profile/post/follower/count evidence and social fallback reads.' },
    { capability: 'onchain_data', description: 'Public RPC address-level wallet/contract/token-flow context.' },
    { capability: 'weather_data', description: 'Weather conditions and forecast by extracted location.' },
    { capability: 'sports_data', description: 'Sports events, teams, schedules, rosters, odds, and result context.' },
    { capability: 'calendar_data', description: 'Holidays, business days, deadlines, and operational calendar context.' },
  ] satisfies Array<{ capability: ToolEvidence['capability']; description: string }>
}

function planWitnessToolsDeterministically(agentId: string, marketCase: MarketCase, instruction: string): { intents: ToolIntent[]; primaryCount: number } {
  const text = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''} ${instruction}`.toLowerCase()
  const primaryIntents = planPrimaryWitnessTools(agentId, marketCase, text)
  const supportingIntents = planSupportingContextTools(agentId, marketCase, text, primaryIntents)
  const intents = dedupeIntents([...primaryIntents, ...supportingIntents])

  return { intents, primaryCount: primaryIntents.length }
}

function planPrimaryWitnessTools(agentId: string, marketCase: MarketCase, text: string): ToolIntent[] {
  switch (agentId) {
    case 'web-scraper-witness':
      return [
        {
          capability: 'web_page_scrape',
          reason: 'Aletheia needs to scrape supplied URLs and extract exact page claims, dates, and relevance to the resolution rule.',
        },
      ]
    case 'visual-evidence-witness':
      return [
        {
          capability: 'visual_page_analysis',
          reason: 'Eikon needs to inspect supplied images or screenshots for visible text, charts, timestamps, logos, and visual-only evidence.',
        },
      ]
    case 'pythia-prediction-witness': {
      const intents: ToolIntent[] = [
        {
          capability: 'prediction_market_data',
          reason: 'Pythia needs market odds, crypto prices, liquidity, and target-distance context for prediction-market testimony.',
        },
      ]
      if (/\b(stock|equity|shares|\$[A-Z]{1,5}\b|[A-Z]{2,5})\b/.test(marketCase.question)) {
        intents.push({
          capability: 'market_data',
          reason: 'The question mentions equities or ticker-like symbols, so tradfi quote data may support the market read.',
        })
      }
      return intents
    }
    case 'hermes-news-witness':
      return [
        {
          capability: 'web_news_search',
          reason: 'Hermes needs current source flow and reference context, then must filter irrelevant or stale hits before testimony.',
        },
      ]
    case 'social-count-witness':
      return [
        {
          capability: 'social_activity_data',
          reason: 'Thales needs an audited account handle, counting window, and social activity provider/archive evidence for exact post-count testimony.',
        },
      ]
    case 'argos-onchain-witness':
      return /\b(0x[a-f0-9]{40}|wallet|onchain|exchange flow|address|stablecoin|transfer)\b/i.test(text)
        ? [
            {
              capability: 'onchain_data',
              reason: 'The question or examination asks about wallet, address, exchange-flow, transfer, or stablecoin evidence.',
            },
          ]
        : []
    case 'notus-weather-data-witness': {
      const intents: ToolIntent[] = []
      if (/\b(weather|rain|storm|flood|wind|temperature|port|flight|shipment|logistics|delay|disrupt)\b/i.test(text)) {
        intents.push({
          capability: 'weather_data',
          reason: 'The question needs measured conditions or forecast data tied to a location and horizon.',
        })
      }
      if (/\b(sport|sports|game|match|team|player|squad|roster|national team|fifa|world cup|win|cover|score)\b/i.test(text)) {
        intents.push({
          capability: 'sports_data',
          reason: 'The question looks sports-specific, so event and odds data may be relevant.',
        })
      }
      if (/\b(holiday|calendar|business day|port|flight|shipment|logistics|market open|market close)\b/i.test(text)) {
        intents.push({
          capability: 'calendar_data',
          reason: 'The question may depend on public holidays, market/business days, or operational-calendar context.',
        })
      }
      if (/\b(stock|equity|shares|\$[A-Z]{1,5}\b|[A-Z]{2,5})\b/.test(marketCase.question)) {
        intents.push({
          capability: 'market_data',
          reason: 'The question includes stock/equity context that may need quote data.',
        })
      }
      return intents
    }
    case 'skepsis-source-quality-witness':
      return [
        {
          capability: 'web_news_search',
          reason: 'Skepsis needs source flow to grade authority, freshness, directness, and conflicts.',
        },
        {
          capability: 'web_page_scrape',
          reason: 'Skepsis needs exact page extraction to verify what cited or discovered sources actually prove.',
        },
      ]
    case 'chronos-timeline-witness':
      return [
        {
          capability: 'web_news_search',
          reason: 'Chronos needs source timestamps and event timing from search/news results.',
        },
        {
          capability: 'web_page_scrape',
          reason: 'Chronos needs exact page dates, publication timing, and dated source passages.',
        },
        {
          capability: 'calendar_data',
          reason: 'Chronos uses calendar data when deadlines, horizons, market days, or public holidays matter.',
        },
      ]
    case 'sophia-research-witness':
      return [
        {
          capability: 'web_news_search',
          reason: 'Sophia needs broad source discovery and fresh context before synthesizing research.',
        },
        {
          capability: 'web_page_scrape',
          reason: 'Sophia needs exact page content so broad research stays tied to sources.',
        },
      ]
    case 'numeros-quant-witness': {
      const intents: ToolIntent[] = [
        {
          capability: 'prediction_market_data',
          reason: 'Numeros needs market-implied probabilities, liquidity, and nearby prediction-market structure.',
        },
      ]
      if (/\b(price|reach|above|below|close|ath|all time high|stock|equity|shares|\$[A-Z]{1,5}\b|btc|bitcoin|eth|ethereum|sol|solana|volatility|funding|expiry)\b/i.test(text)) {
        intents.push({
          capability: 'market_data',
          reason: 'Numeros needs quote/price context for distance, volatility, and numerical constraints.',
        })
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
  const asksForExactSources = /https?:\/\//i.test(text) || /\b(scrape|website|url|page|official|credible|source|reported|article|forecast|roster|squad|fifa|weather site)\b/i.test(text)
  const asksVisualEvidence = /\b(image|photo|picture|screenshot|visual|chart|graph|map|diagram|tweet image|market card|read image|screen grab|screengrab)\b/i.test(text)
  const suppliedSocialProfile = /https?:\/\/(?:www\.)?(?:tiktok\.com\/@|instagram\.com\/|x\.com\/|twitter\.com\/|youtube\.com\/@)/i.test(text)
  const asksSocialCount = /\b(tweet|tweets|post|posts|followers|mentions?)\b/i.test(text)
    && /\b(#|number|count|how many|between|at least|more than|less than|from|during|week|daily)\b/i.test(text)

  if (agentId === 'social-count-witness') {
    const socialSupporting: ToolIntent[] = []
    if (!has('visual_page_analysis') && (asksVisualEvidence || asksSocialCount || suppliedSocialProfile)) {
      socialSupporting.push({
        capability: 'visual_page_analysis',
        reason: 'Thales supporting context: inspect rendered screenshots/images when social counters may only be visible on the profile page.',
      })
    }
    if (!has('web_page_scrape') && asksForExactSources && /\b(scrape|source|official|page text|profile html|website text)\b/i.test(text)) {
      socialSupporting.push({
        capability: 'web_page_scrape',
        reason: 'Thales supporting context: scrape exact supplied/source pages when examination asks for source text beyond social profile counters.',
      })
    }
    return socialSupporting
  }

  if (agentId !== 'social-count-witness' && !has('social_activity_data') && asksSocialCount) {
    intents.push({
      capability: 'social_activity_data',
      reason: 'Supporting context: social count markets need audited account/window/count evidence, not just narrative source flow.',
    })
  }

  if (agentId !== 'hermes-news-witness' && !has('web_news_search') && (isEventOrOperational || isCrypto || isMarketOrPrice)) {
    intents.push({
      capability: 'web_news_search',
      reason: 'Supporting context: current search/news flow can confirm whether the primary testimony is missing obvious fresh catalysts or source-quality issues.',
    })
  }

  if (
    agentId !== 'pythia-prediction-witness' &&
    !has('prediction_market_data') &&
    (isCrypto || marketCase.type === 'prediction-market' || /\b(polymarket|kalshi|manifold|prediction market|odds|price target|reach|above|below|close)\b/i.test(text))
  ) {
    intents.push({
      capability: 'prediction_market_data',
      reason: 'Supporting context: prediction-market and price-distance evidence can help compare factual testimony against market-implied expectations.',
    })
  }

  if (!has('market_data') && isStock) {
    intents.push({
      capability: 'market_data',
      reason: 'Supporting context: stock/equity quote data can anchor claims about current market movement.',
    })
  }

  if (agentId !== 'argos-onchain-witness' && !has('onchain_data') && isAddressOrFlow) {
    intents.push({
      capability: 'onchain_data',
      reason: 'Supporting context: address or transfer language requires address-level public RPC checks before anyone argues flow.',
    })
  }

  if (!has('calendar_data') && isTimeSensitive && /\b(port|flight|shipment|logistics|business day|holiday|market open|market close|settlement)\b/i.test(text)) {
    intents.push({
      capability: 'calendar_data',
      reason: 'Supporting context: timing, holidays, and operational calendars can limit or explain the event horizon.',
    })
  }

  if (agentId !== 'web-scraper-witness' && !has('web_page_scrape') && (asksForExactSources || isEventOrOperational)) {
    intents.push({
      capability: 'web_page_scrape',
      reason: 'Supporting context: exact page extraction can verify what cited or search-discovered sources actually say.',
    })
  }

  if (agentId !== 'visual-evidence-witness' && !has('visual_page_analysis') && asksVisualEvidence) {
    intents.push({
      capability: 'visual_page_analysis',
      reason: 'Supporting context: visual evidence may contain text, chart values, labels, or screenshot-only claims that normal scraping misses.',
    })
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

function runToolIntent(capability: ToolEvidence['capability'], marketCase: MarketCase, instruction = '') {
  switch (capability) {
    case 'prediction_market_data':
      return getPredictionMarketEvidence(marketCase)
    case 'market_data':
      return getMarketDataEvidence(marketCase)
    case 'web_news_search':
      return getNewsEvidence(marketCase, instruction)
    case 'onchain_data':
      return getOnchainEvidence(marketCase)
    case 'weather_data':
      return getWeatherEvidence(marketCase, instruction)
    case 'sports_data':
      return getSportsEvidence(marketCase)
    case 'calendar_data':
      return getCalendarEvidence(marketCase)
    case 'web_page_scrape':
      return getWebPageScrapeEvidence(marketCase, instruction)
    case 'visual_page_analysis':
      return getVisualPageEvidence(marketCase)
    case 'social_activity_data':
      return getSocialActivityEvidence(marketCase)
    default:
      return Promise.resolve({
        capability,
        provider: 'tool-planner',
        query: marketCase.question,
        fetchedAt: new Date().toISOString(),
        status: 'skipped' as const,
        observations: [`No executable tool is registered for ${capability}.`],
        sources: [],
      })
  }
}

function compactCacheKey(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, 'url')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 3)
    .slice(0, 18)
    .join('-')
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}
