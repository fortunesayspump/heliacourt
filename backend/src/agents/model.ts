import type { AgentRegistryEntry } from './types'
import type { ArgumentNode, TestimonyFinding } from '../court/types'
import '../config/env'

type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

type CourtJsonRequest = {
  agent: AgentRegistryEntry
  system: string
  user: string
}

type CourtRawJsonRequest = {
  model?: string
  temperature?: number
  system: string
  user: string
}

export type CourtModelJson = {
  summary?: string
  message?: string
  confidence?: number
  claims?: string[]
  risks?: string[]
  requestedAgentId?: string
  request?: string
  testimony?: {
    evidenceIds?: string[]
    finding?: string
    supports?: string
    forecastWeight?: string
    limits?: string[]
    nextQuestion?: string
  }
  argumentNodes?: Array<{
    id?: string
    side?: string
    claim?: string
    evidenceIds?: string[]
    warrant?: string
    attacks?: string[]
    confidence?: number
  }>
}

export type CourtModelResult =
  | {
      ok: true
      provider: string
      model: string
      content: NormalizedCourtModelJson
    }
  | {
      ok: false
      provider: string
      model: string
      reason: string
    }

export type CourtRawJsonResult<T> =
  | {
      ok: true
      provider: string
      model: string
      content: T
    }
  | {
      ok: false
      provider: string
      model: string
      reason: string
    }

type OpenRouterChoice = {
  message?: {
    content?: string
  }
}

type OpenRouterResponse = {
  choices?: OpenRouterChoice[]
  error?: {
    message?: string
  }
}

export type CourtModelProvider = 'deepseek' | 'openrouter'

export type CourtModelRuntime = {
  provider: CourtModelProvider
  model: string
  apiKey?: string
  missingKeyName: string
  baseUrl: string
  headers: Record<string, string>
}

const defaultOpenRouterModel = 'openai/gpt-4o-mini'
const defaultDeepSeekModel = 'deepseek-chat'
const openRouterBaseUrl = 'https://openrouter.ai/api/v1'
const deepSeekBaseUrl = 'https://api.deepseek.com'

function getConfiguredProvider(): CourtModelProvider {
  const provider = process.env.HELIA_MODEL_PROVIDER?.toLowerCase()
  if (provider === 'deepseek' || provider === 'openrouter') return provider
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek'
  return 'openrouter'
}

function isProviderCompatibleModel(model: string | undefined, provider: CourtModelProvider) {
  if (!model) return false
  if (provider === 'deepseek') return model.startsWith('deepseek-') && !model.includes('/')
  return true
}

function selectModel(provider: CourtModelProvider, requestedModel?: string, agent?: AgentRegistryEntry) {
  const candidates = provider === 'deepseek'
    ? [
        requestedModel,
        agent?.defaultModel,
        process.env.DEEPSEEK_MODEL,
        process.env.HELIA_DEFAULT_MODEL,
      ]
    : [
        requestedModel,
        agent?.defaultModel,
        process.env.HELIA_DEFAULT_MODEL,
        process.env.OPENROUTER_MODEL,
      ]

  return candidates.find((candidate) => isProviderCompatibleModel(candidate, provider))
    ?? (provider === 'deepseek' ? defaultDeepSeekModel : defaultOpenRouterModel)
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, '')
}

export function getCourtModelRuntime(requestedModel?: string, agent?: AgentRegistryEntry): CourtModelRuntime {
  const provider = getConfiguredProvider()
  const model = selectModel(provider, requestedModel, agent)

  if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.HELIA_MODEL_API_KEY
    return {
      provider,
      model,
      apiKey,
      missingKeyName: 'DEEPSEEK_API_KEY',
      baseUrl: trimTrailingSlash(process.env.DEEPSEEK_BASE_URL ?? process.env.HELIA_MODEL_BASE_URL ?? deepSeekBaseUrl),
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        'Content-Type': 'application/json',
      },
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.HELIA_MODEL_API_KEY
  return {
    provider,
    model,
    apiKey,
    missingKeyName: 'OPENROUTER_API_KEY',
    baseUrl: trimTrailingSlash(process.env.OPENROUTER_BASE_URL ?? process.env.HELIA_MODEL_BASE_URL ?? openRouterBaseUrl),
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
      'X-Title': process.env.OPENROUTER_APP_NAME ?? 'Helia Court',
    },
  }
}

export function getCourtModelName(agent?: AgentRegistryEntry) {
  return getCourtModelRuntime(undefined, agent).model
}

export function isCourtModelConfigured() {
  return Boolean(getCourtModelRuntime().apiKey)
}

export async function generateCourtJson({ agent, system, user }: CourtJsonRequest): Promise<CourtModelResult> {
  const result = await generateRawJson<CourtModelJson>({
    model: getCourtModelName(agent),
    temperature: agent.temperature,
    system,
    user,
  })

  if (!result.ok) return result

  return {
    ...result,
    content: normalizeCourtJson(result.content),
  }
}

export async function generateRawJson<T = unknown>({
  model,
  temperature = 0.2,
  system,
  user,
}: CourtRawJsonRequest): Promise<CourtRawJsonResult<T>> {
  const runtime = getCourtModelRuntime(model)

  if (!runtime.apiKey) {
    return {
      ok: false,
      provider: runtime.provider,
      model: runtime.model,
      reason: `${runtime.missingKeyName} is not configured`,
    }
  }

  const timeoutMs = Number(process.env.HELIA_MODEL_TIMEOUT_MS ?? 90_000)
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  try {
    const response = await fetch(`${runtime.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000),
      headers: runtime.headers,
      body: JSON.stringify({
        model: runtime.model,
        messages,
        temperature,
        response_format: { type: 'json_object' },
      }),
    })

    const payload = (await response.json()) as OpenRouterResponse

    if (!response.ok) {
      return {
        ok: false,
        provider: runtime.provider,
        model: runtime.model,
        reason: payload.error?.message ?? `Model request failed with HTTP ${response.status}`,
      }
    }

    const content = payload.choices?.[0]?.message?.content

    if (!content) {
      return {
        ok: false,
        provider: runtime.provider,
        model: runtime.model,
        reason: 'Model returned no content',
      }
    }

    return {
      ok: true,
      provider: runtime.provider,
      model: runtime.model,
      content: parseRawJson<T>(content),
    }
  } catch (error) {
    return {
      ok: false,
      provider: runtime.provider,
      model: runtime.model,
      reason: error instanceof Error ? error.message : 'Unknown model request failure',
    }
  }
}

function parseRawJson<T>(content: string): T {
  try {
    return JSON.parse(content) as T
  } catch {
    const match = content.match(/\{[\s\S]*\}/)

    if (!match) {
      throw new Error('Model response was not JSON')
    }

    return JSON.parse(match[0]) as T
  }
}

function parseCourtJson(content: string): CourtModelJson {
  try {
    return normalizeCourtJson(JSON.parse(content) as CourtModelJson)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)

    if (!match) {
      throw new Error('Model response was not JSON')
    }

    return normalizeCourtJson(JSON.parse(match[0]) as CourtModelJson)
  }
}

type NormalizedCourtModelJson = Omit<CourtModelJson, 'argumentNodes' | 'testimony'> & {
  testimony?: TestimonyFinding
  argumentNodes?: ArgumentNode[]
}

function normalizeCourtJson(value: CourtModelJson): NormalizedCourtModelJson {
  return {
    summary: typeof value.summary === 'string' ? cleanModelText(value.summary, 220) : undefined,
    message: typeof value.message === 'string' ? cleanModelText(value.message, 1_100) : undefined,
    confidence: typeof value.confidence === 'number' ? clamp(value.confidence, 0, 1) : undefined,
    claims: Array.isArray(value.claims) ? cleanModelList(value.claims, 6, 220) : undefined,
    risks: Array.isArray(value.risks) ? cleanModelList(value.risks, 6, 220) : undefined,
    requestedAgentId: typeof value.requestedAgentId === 'string' ? value.requestedAgentId : undefined,
    request: typeof value.request === 'string' ? cleanModelText(value.request, 500) : undefined,
    testimony: normalizeTestimony(value.testimony),
    argumentNodes: normalizeArgumentNodes(value.argumentNodes),
  }
}

function normalizeTestimony(value: CourtModelJson['testimony']): TestimonyFinding | undefined {
  if (!value || typeof value !== 'object') return undefined
  const supports = value.supports === 'yes' || value.supports === 'no' || value.supports === 'neutral' || value.supports === 'context' ? value.supports : 'neutral'
  const forecastWeight =
    value.forecastWeight === 'strong' || value.forecastWeight === 'moderate' || value.forecastWeight === 'weak' || value.forecastWeight === 'none'
      ? value.forecastWeight
      : 'weak'
  const finding = typeof value.finding === 'string' ? cleanModelText(value.finding, 280) : ''
  if (!finding) return undefined

  return {
    evidenceIds: cleanModelList(value.evidenceIds ?? [], 6, 120),
    finding,
    supports,
    forecastWeight,
    limits: cleanModelList(value.limits ?? [], 4, 180),
    nextQuestion: typeof value.nextQuestion === 'string' ? cleanModelText(value.nextQuestion, 220) : undefined,
  }
}

function normalizeArgumentNodes(value: CourtModelJson['argumentNodes']): ArgumentNode[] | undefined {
  if (!Array.isArray(value)) return undefined

  return value
    .map((node, index) => {
      const side: ArgumentNode['side'] | undefined = node.side === 'yes' || node.side === 'no' || node.side === 'no-edge' ? node.side : undefined
      const claim = typeof node.claim === 'string' ? cleanModelText(node.claim, 260) : ''
      const warrant = typeof node.warrant === 'string' ? cleanModelText(node.warrant, 320) : ''
      if (!side || !claim || !warrant) return undefined

      return {
        id: typeof node.id === 'string' && node.id.trim() ? cleanModelText(node.id, 80) : `arg-${index + 1}`,
        side,
        claim,
        evidenceIds: cleanModelList(node.evidenceIds ?? [], 8, 120),
        warrant,
        attacks: cleanModelList(node.attacks ?? [], 5, 180),
        confidence: typeof node.confidence === 'number' ? clamp(node.confidence, 0, 1) : 0.5,
      }
    })
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .slice(0, 4)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function cleanModelList(values: unknown[], maxItems: number, maxLength: number) {
  const cleaned = values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => cleanModelText(item, maxLength))
    .filter((item) => !isPlannerMetadata(item))
    .filter(Boolean)

  return Array.from(new Set(cleaned)).slice(0, maxItems)
}

function cleanModelText(value: string, maxLength: number) {
  const cleaned = value
    .replace(/^(duckduckgo-html|bing-html|brave|serpapi|tavily|gdelt)\s+web\/news result:\s*/i, '')
    .replace(/^Scraped\s+/i, '')
    .replace(/\s+via\s+(?:static-readability|static-cheerio|browser-render|public-endpoint)[\s\S]*$/i, '')
    .replace(/\s+Source quality:[\s\S]*$/i, '')
    .replace(/\s+Content hash:\s*[a-f0-9]+\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= maxLength) return cleaned

  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`
}

function isPlannerMetadata(value: string) {
  return /^(search plan|planner relevance|deterministic fallback search plan|supporting context|fallback context):/i.test(value.trim())
}
