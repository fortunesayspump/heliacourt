import { generateRawJson, isCourtModelConfigured } from '../agents/model'
import type { CourtArtifact, EvidenceScore, EvidenceTag, ToolEvidence } from './types'

type ScoreInput = Pick<CourtArtifact, 'agentId' | 'claims' | 'risks' | 'summary' | 'transcriptMessage' | 'type' | 'toolEvidence'>

export function scoreArtifactEvidence(artifact: ScoreInput): EvidenceScore[] {
  const scores: EvidenceScore[] = []

  for (const claim of artifact.claims ?? []) {
    scores.push(scoreText(claim, getBasis(artifact), artifact))
  }

  for (const risk of artifact.risks ?? []) {
    scores.push(scoreText(risk, 'risk', artifact))
  }

  for (const evidence of artifact.toolEvidence ?? []) {
    scores.push(...scoreToolEvidence(evidence))
  }

  return dedupeScores(scores)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
}

export async function scoreArtifactEvidenceWithAi(artifact: ScoreInput): Promise<EvidenceScore[]> {
  const fallback = scoreArtifactEvidence(artifact)

  if (process.env.HELIA_DISABLE_AI_EVIDENCE_LABELS === 'true') return fallback
  if (process.env.HELIA_DISABLE_MODEL === 'true' || !isCourtModelConfigured()) return fallback

  const items = buildScoreItems(artifact)
  if (!items.length) return fallback

  const result = await generateRawJson<{ scores?: Partial<EvidenceScore>[] }>({
    model: process.env.HELIA_EVIDENCE_LABEL_MODEL ?? process.env.HELIA_DEFAULT_MODEL ?? process.env.OPENROUTER_MODEL,
    temperature: 0,
    system: evidenceLabelSystemPrompt,
    user: JSON.stringify({
      artifact: {
        agentId: artifact.agentId,
        type: artifact.type,
      },
      items,
    }, null, 2),
  })

  if (!result.ok || !Array.isArray(result.content.scores)) return fallback

  const aiScores = normalizeAiScores(result.content.scores)

  return aiScores.length ? mergeScoreFallback(aiScores, fallback) : fallback
}

export function summarizeEvidenceScores(scores: EvidenceScore[] | undefined) {
  if (!scores?.length) return 'No structured evidence scores yet.'

  return scores
    .slice(0, 6)
    .map((score) => `${score.tag}/${score.polarity}/${score.weight.toFixed(2)}: ${score.text}`)
    .join(' ')
}

function scoreToolEvidence(evidence: ToolEvidence) {
  const basis: EvidenceScore['basis'] = 'tool'
  const observations = evidence.observations.filter((observation) => !isPlannerMetadata(observation)).slice(0, 5)
  const baseWeight = evidence.status === 'ok' ? relevanceWeight(evidence.relevance) : 0.25

  return observations.map((observation) => ({
    ...scoreText(observation, basis, { agentId: evidence.provider, type: 'witness-testimony' }),
    weight: Math.min(scoreText(observation, basis, { agentId: evidence.provider, type: 'witness-testimony' }).weight, baseWeight),
  }))
}

function buildScoreItems(artifact: ScoreInput) {
  const items: Array<{ text: string; basis: EvidenceScore['basis'] }> = []

  for (const claim of artifact.claims ?? []) items.push({ text: claim, basis: getBasis(artifact) })
  for (const risk of artifact.risks ?? []) items.push({ text: risk, basis: 'risk' })
  for (const evidence of artifact.toolEvidence ?? []) {
    for (const observation of evidence.observations.slice(0, 5)) {
      if (isPlannerMetadata(observation)) continue
      items.push({ text: observation, basis: 'tool' })
    }
  }

  return items
    .map((item) => ({
      ...item,
      text: item.text.replace(/\s+/g, ' ').trim().slice(0, 500),
    }))
    .filter((item) => item.text)
    .slice(0, 12)
}

function isPlannerMetadata(text: string) {
  return /\b(search plan|deterministic fallback search plan|planner relevance)\b/i.test(text)
}

const evidenceLabelSystemPrompt = `
You label Helia Court evidence for a prediction-market hearing.
Return strict JSON: {"scores":[{"text":"same concise text","tag":"direct-proof|yes-catalyst|no-blocker|timing|source-quality|background|missing","polarity":"yes|no|neutral","weight":0.0,"basis":"claim|risk|tool|argument|ruling"}]}.

Definitions:
- direct-proof: directly satisfies or directly negates the resolution wording with an observed/resolving event. The market rule or resolution criteria text itself is NOT direct proof. For a future unresolved event, "no confirmed case yet" is NOT final direct proof of No unless the deadline passed or the source resolves the market.
- yes-catalyst: a fact that plausibly moves probability toward Yes but does not prove it.
- no-blocker: a fact that plausibly moves probability toward No or caps Yes, such as low risk, no current cases, mitigation, lack of pathway.
- timing: window, deadline, publication date, event date, latency, horizon.
- source-quality: authority, freshness, directness, official/credible source status.
- background: context that does not move the forecast much.
- missing: unavailable evidence, unsupported inference, or an unclosed bridge.

Important:
- Do not label "absence of confirmed cases" as Yes.
- Do not label market rules, resolution criteria, or "will resolve to Yes if..." text as direct-proof; that is background/rule context.
- Do not label "lacks implementation path" as Yes.
- Do not confuse a current negative signal with proof the future event cannot happen.
- Weight is forecast evidentiary strength, not event probability.
`

function normalizeAiScores(scores: Partial<EvidenceScore>[]) {
  return scores
    .map((score) => {
      const tag = normalizeTag(score.tag)
      const polarity = normalizePolarity(score.polarity, tag)
      const basis = normalizeBasis(score.basis)
      const text = typeof score.text === 'string' ? score.text.replace(/\s+/g, ' ').trim().slice(0, 240) : ''
      const weight = typeof score.weight === 'number' ? Math.min(Math.max(score.weight, 0.1), 0.95) : 0.4

      if (!tag || !polarity || !basis || !text) return undefined

      return {
        text,
        tag,
        polarity,
        basis,
        weight: Number(weight.toFixed(2)),
      }
    })
    .filter((score): score is EvidenceScore => Boolean(score))
    .slice(0, 10)
}

function mergeScoreFallback(aiScores: EvidenceScore[], fallback: EvidenceScore[]) {
  const merged = dedupeScores([...aiScores, ...fallback.filter((score) => score.basis === 'tool')])

  return merged.sort((a, b) => b.weight - a.weight).slice(0, 10)
}

function normalizeTag(tag: unknown): EvidenceTag | undefined {
  if (tag === 'direct-proof' || tag === 'yes-catalyst' || tag === 'no-blocker' || tag === 'timing' || tag === 'source-quality' || tag === 'background' || tag === 'missing') return tag

  return undefined
}

function normalizePolarity(polarity: unknown, tag?: EvidenceTag): EvidenceScore['polarity'] | undefined {
  if (tag === 'yes-catalyst') return 'yes'
  if (tag === 'no-blocker') return 'no'
  if (tag === 'missing' || tag === 'source-quality' || tag === 'background') {
    return polarity === 'yes' || polarity === 'no' ? polarity : 'neutral'
  }
  if (polarity === 'yes' || polarity === 'no' || polarity === 'neutral') return polarity

  return undefined
}

function normalizeBasis(basis: unknown): EvidenceScore['basis'] | undefined {
  if (basis === 'claim' || basis === 'risk' || basis === 'tool' || basis === 'argument' || basis === 'ruling') return basis

  return undefined
}

function scoreText(text: string, basis: EvidenceScore['basis'], artifact: Pick<ScoreInput, 'agentId' | 'type'>): EvidenceScore {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lower = normalized.toLowerCase()
  const tag = classifyTag(lower)
  const polarity = classifyPolarity(lower, tag)
  const weight = classifyWeight(lower, tag, artifact, basis)

  return {
    text: normalized.slice(0, 240),
    tag,
    polarity,
    weight,
    basis,
  }
}

function classifyTag(text: string): EvidenceTag {
  if (/\b(will resolve to|market will resolve|resolution criteria|resolution source|qualif(?:y|ies)|this market)\b/.test(text)) {
    return 'background'
  }

  if (/\b(lacks? .*?(implementation path|concrete path|pathway|bridge)|absence of confirmed|no current confirmed|no confirmed .*?(yet|currently|as of)|not yet confirmed)\b/.test(text)) {
    return 'no-blocker'
  }

  if (/\b(missing|cannot prove|cannot support|unsupported|gap|unknown|unresolved|no usable|not available|skipped|lacks? evidence|lacks? .*?proof)\b/.test(text)) {
    return 'missing'
  }

  if (/\b(no confirmed|no suspected|confirmed case|laboratory-confirmed|officially confirmed|took the field|filed|signed|released|declassified|said the listed term)\b/.test(text)) {
    return 'direct-proof'
  }

  if (/\b(outbreak|surge|mobilized|catalyst|pathway|implementation path|incentive|pressure|scheduled|planned|monitoring|deadline)\b/.test(text)) {
    return 'yes-catalyst'
  }

  if (/\b(low risk|no evidence|no cases|not reported|not confirmed|blocker|inertia|cancelled|unlikely bridge|absence|does not show)\b/.test(text)) {
    return 'no-blocker'
  }

  if (/\b(deadline|horizon|by |before|after|during|as of|reported on|published|dated|window|timezone|11:59|202\d|203\d)\b/.test(text)) {
    return 'timing'
  }

  if (/\b(cdc|fifa|sec|official|government|reuters|associated press|source|credible|primary|directness|freshness|authority)\b/.test(text)) {
    return 'source-quality'
  }

  return 'background'
}

function classifyPolarity(text: string, tag: EvidenceTag): EvidenceScore['polarity'] {
  if (tag === 'missing') return 'neutral'
  if (tag === 'no-blocker') return 'no'

  if (/\b(no confirmed|no suspected|no cases|not reported|not confirmed|low risk|no evidence|does not show|cannot prove|absence of confirmed|lacks? .*?(implementation path|concrete path|pathway|bridge))\b/.test(text)) {
    return 'no'
  }

  if (/\b(confirmed case|yes driver|yes forecast|catalyst|pathway|implementation|will qualify|supports yes|move probability)\b/.test(text)) {
    return 'yes'
  }

  if (tag === 'yes-catalyst') return 'yes'

  return 'neutral'
}

function classifyWeight(
  text: string,
  tag: EvidenceTag,
  artifact: Pick<ScoreInput, 'agentId' | 'type'>,
  basis: EvidenceScore['basis'],
) {
  let weight = 0.35

  if (tag === 'direct-proof') weight = 0.82
  if (tag === 'yes-catalyst') weight = 0.58
  if (tag === 'no-blocker') weight = 0.64
  if (tag === 'timing') weight = 0.5
  if (tag === 'source-quality') weight = 0.48
  if (tag === 'missing') weight = 0.55

  if (/\b(cdc|fifa|sec|official|government|primary)\b/.test(text)) weight += 0.08
  if (/\b(reuters|associated press|bbc|bloomberg|new york times|washington post)\b/.test(text)) weight += 0.04
  if (/\b(search result|aggregator|wikipedia|social post)\b/.test(text)) weight -= 0.08
  if (basis === 'risk') weight = Math.max(weight, 0.5)
  if (artifact.type === 'argument') weight -= 0.08
  if (artifact.agentId === 'head-judge') weight += 0.04

  return Math.min(Math.max(Number(weight.toFixed(2)), 0.1), 0.95)
}

function getBasis(artifact: Pick<ScoreInput, 'type' | 'agentId'>): EvidenceScore['basis'] {
  if (artifact.agentId === 'head-judge') return 'ruling'
  if (artifact.type === 'argument') return 'argument'

  return 'claim'
}

function relevanceWeight(relevance: ToolEvidence['relevance']) {
  if (relevance === 'primary') return 0.86
  if (relevance === 'supporting') return 0.68
  if (relevance === 'low') return 0.42
  if (relevance === 'none') return 0.22

  return 0.58
}

function dedupeScores(scores: EvidenceScore[]) {
  const seen = new Set<string>()
  const unique: EvidenceScore[] = []

  for (const score of scores) {
    const key = `${score.tag}:${score.polarity}:${score.text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(score)
  }

  return unique
}
