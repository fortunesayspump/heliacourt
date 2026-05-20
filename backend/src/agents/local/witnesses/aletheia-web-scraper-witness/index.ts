import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildWitnessSpeech, cleanRecordText, compactRecordItems } from '../../courtroom-record'

export function runAletheiaWebScraperWitness(context: AgentContext): CourtArtifact {
  const scrapeEvidence = context.toolEvidence?.find((evidence) => evidence.capability === 'web_page_scrape')
  const usableEvidence = scrapeEvidence?.status === 'ok' ? scrapeEvidence : undefined
  const parsedSources = usableEvidence?.sources.map((source) => {
    const parsed = parseSourceValue(source.value)
    return {
      ...source,
      mode: parsed.mode,
      sourceQuality: parsed.sourceQuality,
      extract: parsed.extract,
      sourceTrail: parsed.sourceTrail,
      discoverySource: parsed.discoverySource,
      crawlDepth: parsed.crawlDepth,
    }
  }) ?? []
  const primarySources = parsedSources.filter((source) => source.sourceQuality === 'primary' && source.extract && source.extract !== 'scraped')
  const referenceSources = parsedSources.filter((source) => source.sourceQuality === 'reference' && source.extract && source.extract !== 'scraped')
  const extractedSources = parsedSources.filter((source) => source.extract && source.extract !== 'scraped')
  const crawledSources = parsedSources.filter((source) => source.discoverySource === 'outbound')
  const sourceSummary = [
    ...primarySources.map((source) => `Primary source ${source.title} exposed: ${source.extract}`),
    ...referenceSources.map((source) => `Reference source ${source.title} exposed: ${source.extract}`),
    ...extractedSources
      .filter((source) => source.sourceQuality !== 'primary' && source.sourceQuality !== 'reference')
      .map((source) => `${source.sourceQuality ?? 'Source'} ${source.title} exposed: ${source.extract}`),
  ].map(cleanRecordText)
  const crawlTrailSummary = parsedSources
    .map((source) => `${source.title}: ${source.sourceTrail ?? source.discoverySource ?? 'source trail unavailable'}`)
    .slice(0, 5)
  const emptyPrimarySources = parsedSources.filter((source) => source.sourceQuality === 'primary' && (!source.extract || source.extract === 'scraped'))
  const findings = compactRecordItems([...sourceSummary, ...(usableEvidence?.observations ?? [])], 5)
  const strongestExtract = findings[0] ?? usableEvidence?.observations[0]
  const missingOfficialConfirmation = emptyPrimarySources.length
    ? `Primary source page(s) ${emptyPrimarySources.map((source) => source.title).join(', ')} did not expose a case-specific passage in the scrape.`
    : 'No primary-source scrape limitation was identified.'
  const crawlerExplanation = crawledSources.length
    ? `Crawler followed ${crawledSources.length} source link(s): ${crawledSources.map((source) => source.title).slice(0, 3).join(', ')}.`
    : 'Crawler did not admit a follow-up source link beyond supplied/search-discovered pages.'

  return {
    id: `${context.marketCase.id}-aletheia-testimony`,
    caseId: context.marketCase.id,
    agentId: 'web-scraper-witness',
    type: 'witness-testimony',
    summary: strongestExtract ?? scrapeEvidence?.observations[0] ?? 'No supplied page could be scraped for exact source testimony.',
    transcriptMessage: buildWitnessSpeech({
      role: 'Aletheia',
      findings,
      supports: 'Exact page text can support a driver, blocker, timing constraint, or source-quality limit only to the extent the page directly says it.',
      limits: usableEvidence
        ? [crawlerExplanation, missingOfficialConfirmation, 'A scraped page proves what the page said at extraction time, not the future market outcome.']
        : [scrapeEvidence?.error ?? scrapeEvidence?.observations[0] ?? 'No URL was available to scrape.'],
      fallback: 'No supplied page could be scraped for exact source testimony.',
    }),
    confidence: usableEvidence ? 0.7 : 0.35,
    claims: usableEvidence ? compactRecordItems([...sourceSummary, ...crawlTrailSummary], 7) : [],
    risks: usableEvidence
      ? [
          crawlerExplanation,
          missingOfficialConfirmation,
          'A reference page is not an official resolution source.',
          'A scraped page proves only what the page says, not whether the future event will resolve yes or no.',
        ]
      : [
          scrapeEvidence?.error ?? scrapeEvidence?.observations[0] ?? 'No URL was available to scrape.',
          'Counsel must provide a URL or cited page before exact-page testimony can be admitted.',
        ],
    costUsd: 0.03,
    createdAt: new Date().toISOString(),
  }
}

function parseSourceValue(value?: string) {
  if (!value) return {}

  try {
    return JSON.parse(value) as {
      mode?: string
      sourceQuality?: string
      extract?: string
      sourceTrail?: string
      discoverySource?: string
      crawlDepth?: number
    }
  } catch {
    return {}
  }
}
