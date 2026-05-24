import type { MarketCase, ToolEvidence } from '../../court/types'
import { generateRawJson } from '../model'
import { agentRegistry } from '../registry'
import { executableCapabilities, getToolTimeoutMs, runToolIntent } from './capabilities'
import { planWitnessTools } from './planning'
import type { ToolIntent } from './types'

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
