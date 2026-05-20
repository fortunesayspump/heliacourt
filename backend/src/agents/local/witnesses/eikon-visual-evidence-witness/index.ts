import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildWitnessSpeech, compactRecordItems } from '../../courtroom-record'

export function runEikonVisualEvidenceWitness(context: AgentContext): CourtArtifact {
  const visualEvidence = context.toolEvidence?.find((evidence) => evidence.capability === 'visual_page_analysis')
  const usableEvidence = visualEvidence?.status === 'ok' ? visualEvidence : undefined
  const parsedSources = usableEvidence?.sources.map((source) => ({
    ...source,
    ...parseSourceValue(source.value),
  })) ?? []
  const visualClaims = parsedSources
    .map((source) => `${source.title}: ${source.analysis ?? 'visual target inspected'}`)
    .filter(Boolean)
  const strongestObservation = usableEvidence?.observations[0]
  const findings = compactRecordItems([...visualClaims, strongestObservation], 4)
  const limits = usableEvidence
    ? [
        'Visual testimony is limited to visible pixels, text, labels, and page state at capture time.',
        'A screenshot can show a visible claim or chart but does not prove hidden data, future outcomes, or offscreen context.',
      ]
    : [
        visualEvidence?.error ?? visualEvidence?.observations[0] ?? 'No image URL or screenshot-capable browser endpoint was available.',
        'Counsel should provide an image URL or enable page screenshots when visual evidence matters.',
      ]

  return {
    id: `${context.marketCase.id}-eikon-testimony`,
    caseId: context.marketCase.id,
    agentId: 'visual-evidence-witness',
    type: 'witness-testimony',
    summary: findings[0] ?? visualEvidence?.observations[0] ?? 'No visual evidence could be inspected.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Eikon',
      findings,
      supports: 'This can corroborate visible counters, page labels, screenshots, or chart text when scraping misses what users can see.',
      limits,
      fallback: 'No visual evidence could be inspected.',
    }),
    confidence: usableEvidence ? 0.68 : 0.28,
    claims: findings,
    risks: limits,
    costUsd: 0.04,
    createdAt: new Date().toISOString(),
  }
}

function parseSourceValue(value?: string) {
  if (!value) return {}

  try {
    return JSON.parse(value) as {
      kind?: string
      model?: string
      analysis?: string
    }
  } catch {
    return {}
  }
}
