import type { MarketCase, ToolEvidence } from '../../court/types'
import { getCalendarEvidence } from './providers/calendar'
import { getMarketDataEvidence } from './providers/market-data'
import { getNewsEvidence } from './providers/news'
import { getOnchainEvidence } from './providers/onchain'
import { getPredictionMarketEvidence } from './providers/prediction-market'
import { getSocialActivityEvidence } from './providers/social-activity'
import { getSportsEvidence } from './providers/sports'
import { getVisualPageEvidence } from './providers/visual-analysis'
import { getWeatherEvidence } from './providers/weather'
import { getWebPageScrapeEvidence } from './providers/web-scraper'

export type ToolCapabilityDescriptor = {
  capability: ToolEvidence['capability']
  description: string
}

export function executableCapabilities() {
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
  ] satisfies ToolCapabilityDescriptor[]
}

export function getToolTimeoutMs(capability: ToolEvidence['capability']) {
  const configured = Number(process.env.HELIA_TOOL_TIMEOUT_MS)
  if (Number.isFinite(configured) && configured > 0) return configured

  if (capability === 'visual_page_analysis') return Number(process.env.HELIA_VISUAL_TOOL_TIMEOUT_MS ?? 35_000)
  if (capability === 'web_page_scrape') return Number(process.env.HELIA_SCRAPE_TOOL_TIMEOUT_MS ?? 25_000)
  if (capability === 'web_news_search') return Number(process.env.HELIA_SEARCH_TOOL_TIMEOUT_MS ?? 20_000)
  if (capability === 'social_activity_data') return Number(process.env.HELIA_SOCIAL_TOOL_TIMEOUT_MS ?? 25_000)

  return 15_000
}

export function runToolIntent(capability: ToolEvidence['capability'], marketCase: MarketCase, instruction = '') {
  switch (capability) {
    case 'prediction_market_data':
      return getPredictionMarketEvidence(marketCase)
    case 'market_data':
      return getMarketDataEvidence(marketCase, instruction)
    case 'web_news_search':
      return getNewsEvidence(marketCase, instruction)
    case 'onchain_data':
      return getOnchainEvidence(marketCase, instruction)
    case 'weather_data':
      return getWeatherEvidence(marketCase, instruction)
    case 'sports_data':
      return getSportsEvidence(marketCase, instruction)
    case 'calendar_data':
      return getCalendarEvidence(marketCase, instruction)
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
