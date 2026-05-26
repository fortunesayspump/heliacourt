import type { AgentContext, CourtArtifact } from './types'

const unsupportedFactPatterns = [
  /\bhistorical (data|pattern|patterns|trend|trends)\b/i,
  /\bhistorical impacts?\b/i,
  /\bhistorical accuracy\b/i,
  /\bmeteorological patterns?\b/i,
  /\bstrong correlation\b/i,
  /\bhigh likelihood\b/i,
  /\bsignificant probability\b/i,
  /\btypically leads?\b/i,
  /\bconsistently\b/i,
  /\bwill likely\b/i,
  /\blikely disrupt\b/i,
  /\bmay impact\b/i,
  /\bmay disrupt\b/i,
  /\bmight support\b/i,
  /\bcould prove\b/i,
  /\bsupports the premise\b/i,
  /\bpotential impacts?\b/i,
  /\boperational impacts?\b/i,
  /\blogistics impacts?\b/i,
  /\bshipping delays?\b/i,
  /\bport delays?\b/i,
  /\bcongestion\b/i,
  /\bclosures?\b/i,
  /\brecent headlines?\b/i,
  /\belevated attention\b/i,
  /\bmarket-implied probability\b/i,
  /\bmarket attention\b/i,
  /\bmispricing\b/i,
  /\bbid-ask spread\b/i,
  /\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*cent spread\b/i,
  /\bfew hundred dollars\b/i,
  /\blast decade\b/i,
  /\bbase rate\b/i,
  /\breference class(?:es)?\b/i,
  /\bhistorical precedents?\b/i,
  /\bno precedents?\b/i,
  /\bscreening (?:sensitivity|effectiveness)\b/i,
  /\b\d+(?:\.\d+)?\s*%\s+(?:screening|sensitivity|effectiveness)\b/i,
  /\b\d{3,}(?:,\d{3})?\s+(?:suspected|confirmed)\s+cases\b/i,
  /\b\d{1,3}(?:,\d{3})+\s+weekly passengers\b/i,
  /\b\d+(?:\.\d+)?\s*(?:viremic|infected)\s+travelers?\b/i,
  /\bmarket (?:already )?(?:prices|discounts|implies)\b/i,
  /\bstale (?:quote|price|market)\b/i,
  /\bjoke quote\b/i,
  /\bno real conviction\b/i,
  /\bexchange inflows?\b/i,
  /\blarge wallets?\b/i,
  /\bwallet flows?\b/i,
  /\bsource freshness\b/i,
]

export function applyRecordGuard(artifact: CourtArtifact, context: AgentContext) {
  const recordText = buildRecordText(context)
  const notes = [...(artifact.notes ?? [])]
  const existingNoteCount = notes.length
  const guardedFields = [artifact.summary, artifact.transcriptMessage, ...(artifact.claims ?? [])].filter(Boolean).join('\n')

  for (const pattern of unsupportedFactPatterns) {
    const match = guardedFields.match(pattern)

    if (match && !pattern.test(recordText)) {
      notes.push(`Record guard: unsupported phrase "${match[0]}" requires witness/tool support before use.`)
    }
  }

  const addedGuardNote = notes.length > existingNoteCount

  if (addedGuardNote) {
    return {
      ...artifact,
      notes,
      risks: [
        ...(artifact.risks ?? []),
        'Record guard: one or more unsupported factual or quantitative claims must be treated as hypothetical until a witness/tool source supports them.',
      ],
    }
  }

  return artifact
}

function buildRecordText(context: AgentContext) {
  return [
    ...(context.artifacts ?? []).flatMap((artifact) => artifact.evidenceItems?.map((item) => item.claim) ?? []),
    ...(context.artifacts ?? [])
      .filter((artifact) => artifact.type === 'witness-testimony' && artifact.testimony?.evidenceIds?.length)
      .flatMap((artifact) => [
        artifact.testimony?.finding,
        ...(artifact.claims ?? []),
      ]),
    ...(context.toolEvidence ?? []).flatMap((evidence) => [
      evidence.provider,
      ...evidence.observations,
      ...evidence.sources.map((source) => `${source.title} ${source.value ?? ''}`),
    ]),
  ]
    .filter(Boolean)
    .join('\n')
}
