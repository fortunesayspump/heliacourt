import type { MarketCase, ToolEvidence } from '../../court/types'
import { fetchJson } from './http'
import { getCaseSearchQuery, getCryptoAssetIds, getStockSymbols, getUsdTarget } from './text'

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

type CoinGeckoSimplePrice = Record<string, {
  usd?: number
  usd_24h_change?: number
  usd_24h_vol?: number
  usd_market_cap?: number
  last_updated_at?: number
}>

type CoinGeckoMarketChart = {
  prices?: Array<[number, number]>
}

const cryptoDisplay: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  solana: { symbol: 'SOL', name: 'Solana' },
}

export async function getMarketDataEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const marketText = [marketCase.question, marketCase.context, marketCase.links?.join(' '), instruction].filter(Boolean).join(' ')
  const query = getCaseSearchQuery(marketText)
  const fetchedAt = new Date().toISOString()
  const symbols = getStockSymbols(marketText)
  const cryptoAssetIds = getCryptoAssetIds(marketText)

  if (!symbols.length && !cryptoAssetIds.length) {
    return {
      capability: 'market_data',
      provider: 'market-data-router',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['No stock ticker or supported crypto asset keyword was found in the case question.'],
      sources: [],
    }
  }

  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []
  const errors: string[] = []

  if (cryptoAssetIds.length) {
    const cryptoEvidence = await getCryptoMarketDataEvidence(cryptoAssetIds, marketText)
    observations.push(...cryptoEvidence.observations)
    sources.push(...cryptoEvidence.sources)
    if (cryptoEvidence.error) errors.push(cryptoEvidence.error)
  }

  if (!symbols.length) {
    return {
      capability: 'market_data',
      provider: 'coingecko',
      query,
      fetchedAt,
      status: observations.length ? 'ok' : 'empty',
      observations,
      sources,
      error: errors.join('; ') || undefined,
    }
  }

  if (!process.env.ALPHA_VANTAGE_API_KEY) {
    observations.push('ALPHA_VANTAGE_API_KEY is not configured, so tradfi quote reads were skipped.')
    sources.push(...symbols.map((symbol) => ({ title: `${symbol} quote`, url: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}` })))

    return {
      capability: 'market_data',
      provider: cryptoAssetIds.length ? 'coingecko+alpha-vantage' : 'alpha-vantage',
      query,
      fetchedAt,
      status: observations.some((observation) => /\b(?:price|usd|volatility|target)\b/i.test(observation)) ? 'ok' : 'skipped',
      observations,
      sources,
      error: errors.join('; ') || undefined,
    }
  }

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
      provider: cryptoAssetIds.length ? 'coingecko+alpha-vantage' : 'alpha-vantage',
      query,
      fetchedAt,
      status: observations.length ? 'ok' : 'empty',
      observations,
      sources,
    }
  } catch (error) {
    return {
      capability: 'market_data',
      provider: cryptoAssetIds.length ? 'coingecko+alpha-vantage' : 'alpha-vantage',
      query,
      fetchedAt,
      status: observations.length ? 'ok' : 'error',
      observations,
      sources,
      error: [errors.join('; '), error instanceof Error ? error.message : 'Market data tool failed'].filter(Boolean).join('; '),
    }
  }
}

async function getCryptoMarketDataEvidence(assetIds: string[], marketText: string): Promise<Pick<ToolEvidence, 'observations' | 'sources' | 'error'>> {
  const observations: string[] = []
  const sources: ToolEvidence['sources'] = []
  const target = getUsdTarget(marketText)

  try {
    const ids = assetIds.join(',')
    const simple = await fetchJson<CoinGeckoSimplePrice>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true`,
    )

    for (const assetId of assetIds) {
      const quote = simple[assetId]
      const asset = cryptoDisplay[assetId] ?? { symbol: assetId.toUpperCase(), name: assetId }
      if (!quote?.usd) {
        observations.push(`${asset.symbol}/USD: quote unavailable from CoinGecko.`)
        continue
      }

      const updatedAt = quote.last_updated_at ? new Date(quote.last_updated_at * 1000).toISOString() : undefined
      const change = Number.isFinite(quote.usd_24h_change) ? `, 24h change ${quote.usd_24h_change!.toFixed(2)}%` : ''
      const volume = Number.isFinite(quote.usd_24h_vol) ? `, 24h volume ${formatUsd(quote.usd_24h_vol!)}` : ''
      observations.push(`${asset.symbol}/USD spot is ${formatUsd(quote.usd)}${change}${volume}${updatedAt ? `, updated ${updatedAt}` : ''}.`)

      if (target && target > quote.usd) {
        const requiredMove = ((target / quote.usd) - 1) * 100
        observations.push(`${asset.symbol}/USD needs about ${requiredMove.toFixed(1)}% upside from ${formatUsd(quote.usd)} to reach ${formatUsd(target)}.`)
      } else if (target && target <= quote.usd) {
        observations.push(`${asset.symbol}/USD is already at or above the target ${formatUsd(target)} based on the CoinGecko spot quote.`)
      }

      sources.push({
        title: `${asset.symbol}/USD CoinGecko spot quote`,
        url: `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`,
        observedAt: updatedAt,
        value: String(quote.usd),
      })

      const realizedVolatility = await getCryptoRealizedVolatility(assetId)
      if (realizedVolatility) {
        observations.push(`${asset.symbol}/USD 30-day realized volatility is about ${realizedVolatility.annualizedPercent.toFixed(1)}% annualized from CoinGecko daily closes.`)
        sources.push({
          title: `${asset.symbol}/USD CoinGecko 30-day market chart`,
          url: `https://api.coingecko.com/api/v3/coins/${assetId}/market_chart?vs_currency=usd&days=30&interval=daily`,
          value: `${realizedVolatility.annualizedPercent.toFixed(1)}% annualized`,
        })
      }
    }

    return { observations, sources }
  } catch (error) {
    return {
      observations,
      sources,
      error: error instanceof Error ? error.message : 'Crypto market data tool failed',
    }
  }
}

async function getCryptoRealizedVolatility(assetId: string) {
  const chart = await fetchJson<CoinGeckoMarketChart>(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(assetId)}/market_chart?vs_currency=usd&days=30&interval=daily`,
  )
  const prices = (chart.prices ?? []).map(([, price]) => price).filter((price) => Number.isFinite(price) && price > 0)
  const returns = prices.slice(1).map((price, index) => Math.log(price / prices[index])).filter((value) => Number.isFinite(value))
  if (returns.length < 7) return undefined

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, returns.length - 1)
  const dailyVolatility = Math.sqrt(variance)

  return {
    annualizedPercent: dailyVolatility * Math.sqrt(365) * 100,
  }
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}
