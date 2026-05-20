import type { MarketCase, ToolEvidence } from '../../court/types'
import { fetchJson } from './http'
import { getCaseSearchQuery, getStockSymbols } from './text'

type AlphaVantageQuote = {
  'Global Quote'?: {
    '01. symbol'?: string
    '05. price'?: string
    '06. volume'?: string
    '07. latest trading day'?: string
    '09. change'?: string
    '10. change percent'?: string
  }
  Note?: string
  Information?: string
}

export async function getMarketDataEvidence(marketCase: MarketCase): Promise<ToolEvidence> {
  const query = getCaseSearchQuery(marketCase.question)
  const fetchedAt = new Date().toISOString()
  const symbols = getStockSymbols(marketCase.question)

  if (!symbols.length) {
    return {
      capability: 'market_data',
      provider: 'alpha-vantage',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['No explicit ticker-like market symbol was found in the case question.'],
      sources: [],
    }
  }

  if (!process.env.ALPHA_VANTAGE_API_KEY) {
    return {
      capability: 'market_data',
      provider: 'alpha-vantage',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['ALPHA_VANTAGE_API_KEY is not configured, so tradfi quote reads were skipped.'],
      sources: symbols.map((symbol) => ({ title: `${symbol} quote`, url: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}` })),
    }
  }

  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []

  try {
    for (const symbol of symbols) {
      const payload = await fetchJson<AlphaVantageQuote>(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`,
      )
      const quote = payload['Global Quote']

      if (!quote?.['05. price']) {
        observations.push(`${symbol}: quote unavailable from Alpha Vantage.`)
        continue
      }

      observations.push(
        `${symbol}: ${quote['05. price']} with ${quote['10. change percent'] ?? 'unknown'} change on ${quote['07. latest trading day'] ?? 'latest trading day'}.`,
      )
      sources.push({
        title: `${symbol} Alpha Vantage quote`,
        url: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}`,
        observedAt: quote['07. latest trading day'],
        value: quote['05. price'],
      })
    }

    return {
      capability: 'market_data',
      provider: 'alpha-vantage',
      query,
      fetchedAt,
      status: observations.length ? 'ok' : 'empty',
      observations,
      sources,
    }
  } catch (error) {
    return {
      capability: 'market_data',
      provider: 'alpha-vantage',
      query,
      fetchedAt,
      status: 'error',
      observations: [],
      sources,
      error: error instanceof Error ? error.message : 'Market data tool failed',
    }
  }
}
