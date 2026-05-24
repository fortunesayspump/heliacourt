import type { MarketCase, ToolEvidence } from '../../../court/types'
import { fetchJson } from '../http'
import { getCaseSearchQuery, getPossibleLocation } from '../text'

type GeocodeResponse = {
  results?: Array<{
    name?: string
    country?: string
    latitude: number
    longitude: number
  }>
}

type ForecastResponse = {
  current?: {
    time?: string
    temperature_2m?: number
    precipitation?: number
    wind_speed_10m?: number
  }
  current_units?: {
    temperature_2m?: string
    precipitation?: string
    wind_speed_10m?: string
  }
  hourly?: {
    time?: string[]
    precipitation?: number[]
    precipitation_probability?: number[]
  }
  hourly_units?: {
    precipitation?: string
    precipitation_probability?: string
  }
}

export async function getWeatherEvidence(marketCase: MarketCase, instruction = ''): Promise<ToolEvidence> {
  const query = getCaseSearchQuery(marketCase.question)
  const fetchedAt = new Date().toISOString()
  const locationText = [marketCase.question, marketCase.context, instruction].filter(Boolean).join(' ')
  const location = getPossibleLocation(locationText)

  if (!location) {
    return {
      capability: 'weather_data',
      provider: 'open-meteo',
      query,
      fetchedAt,
      status: 'skipped',
      observations: ['No clear location was found in the case question, context, or witness instruction, so weather/data reads were skipped.'],
      sources: [],
    }
  }

  try {
    const geocode = await fetchJson<GeocodeResponse>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
    )
    const place = geocode.results?.[0]

    if (!place) {
      return {
        capability: 'weather_data',
        provider: 'open-meteo',
        query,
        fetchedAt,
        status: 'empty',
        observations: [`No Open-Meteo geocoding match found for ${location}.`],
        sources: [],
      }
    }

    const forecast = await fetchJson<ForecastResponse>(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,precipitation,wind_speed_10m&hourly=precipitation,precipitation_probability&forecast_days=3`,
    )
    const current = forecast.current
    const units = forecast.current_units
    const next72h = summarizeNext72hPrecipitation(forecast)

    return {
      capability: 'weather_data',
      provider: 'open-meteo',
      query,
      fetchedAt,
      status: current ? 'ok' : 'empty',
      observations: current
        ? [
            `${place.name ?? location}, ${place.country ?? ''}: ${current.temperature_2m}${units?.temperature_2m ?? ''}, precipitation ${current.precipitation}${units?.precipitation ?? ''}, wind ${current.wind_speed_10m}${units?.wind_speed_10m ?? ''}.`,
            next72h,
          ]
            .filter((observation): observation is string => Boolean(observation))
        : [`No current weather returned for ${location}.`],
      sources: [
        {
          title: `Open-Meteo current weather for ${place.name ?? location}`,
          url: 'https://open-meteo.com/',
          observedAt: current?.time,
          value: current?.temperature_2m?.toString(),
        },
        {
          title: `Open-Meteo 72 hour precipitation forecast for ${place.name ?? location}`,
          url: `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}`,
          observedAt: forecast.hourly?.time?.[0],
          value: next72h,
        },
      ],
    }
  } catch (error) {
    return {
      capability: 'weather_data',
      provider: 'open-meteo',
      query,
      fetchedAt,
      status: 'error',
      observations: [],
      sources: [],
      error: error instanceof Error ? error.message : 'Weather tool failed',
    }
  }
}

function summarizeNext72hPrecipitation(forecast: ForecastResponse) {
  const times = forecast.hourly?.time ?? []
  const precipitation = forecast.hourly?.precipitation ?? []
  const probabilities = forecast.hourly?.precipitation_probability ?? []

  if (!times.length || !precipitation.length) return undefined

  const windowSize = Math.min(72, times.length, precipitation.length)
  const nextPrecipitation = precipitation.slice(0, windowSize)
  const nextProbabilities = probabilities.slice(0, Math.min(windowSize, probabilities.length))
  const totalPrecipitation = nextPrecipitation.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0)
  const maxPrecipitation = Math.max(...nextPrecipitation)
  const maxProbability = nextProbabilities.length ? Math.max(...nextProbabilities) : undefined
  const wetHours = nextPrecipitation.filter((value) => value > 0).length
  const precipitationUnit = forecast.hourly_units?.precipitation ?? 'mm'
  const probabilityText = typeof maxProbability === 'number' ? `, max precipitation probability ${maxProbability}${forecast.hourly_units?.precipitation_probability ?? '%'}` : ''

  return `Open-Meteo next ${windowSize}h precipitation forecast: total ${totalPrecipitation.toFixed(1)}${precipitationUnit}, max hourly ${maxPrecipitation.toFixed(1)}${precipitationUnit}, wet hours ${wetHours}${probabilityText}.`
}
