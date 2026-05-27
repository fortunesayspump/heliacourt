import type { AgentRegistryEntry } from './types'

export const agentRegistry: AgentRegistryEntry[] = [
  {
    id: 'court-clerk',
    name: 'Mnemon',
    seat: 'court-clerk',
    description: 'Court Clerk. Opens cases, timestamps the hearing, maintains the court record, and prepares hashes for Arc.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.02,
    permissions: ['read_case', 'read_public_evidence', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'court-record-v1',
    promptKey: 'mnemon-court-clerk',
    runMode: 'model',
    temperature: 0.2,
    toolCapabilities: [],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'evidence-clerk',
    name: 'Kleio',
    seat: 'evidence-clerk',
    description: 'Evidence Clerk. Files exhibits, organizes source trails, and prepares evidence packets for counsel.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.03,
    permissions: ['read_case', 'read_public_evidence', 'submit_evidence', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'evidence-packet-v1',
    promptKey: 'kleio-evidence-clerk',
    runMode: 'model',
    temperature: 0.2,
    toolCapabilities: [],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'pythia-prediction-witness',
    name: 'Pythia',
    seat: 'expert-witness',
    description: 'Prediction Witness. Testifies on prediction-market odds, implied probability, and mispricing.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.04,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'pythia-prediction-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['market_structure_session', 'prediction_market_data', 'market_data'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'hermes-news-witness',
    name: 'Hermes',
    seat: 'expert-witness',
    description: 'News Witness. Testifies on headline flow, source quality, and information freshness.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.03,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'hermes-news-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['web_news_search', 'research_session'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'web-scraper-witness',
    name: 'Aletheia',
    seat: 'expert-witness',
    description: 'Web Scraper Witness. Scrapes cited pages and testifies on exact source text, dates, authorship, and resolution relevance.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.03,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'aletheia-web-scraper-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['web_page_scrape'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'visual-evidence-witness',
    name: 'Eikon',
    seat: 'expert-witness',
    description: 'Visual Evidence Witness. Reads supplied images and page screenshots for visible text, charts, labels, timestamps, logos, and visual-only source claims.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.04,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'eikon-visual-evidence-witness',
    runMode: 'tool-backed-model',
    temperature: 0.05,
    toolCapabilities: ['visual_page_analysis'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'argos-onchain-witness',
    name: 'Argos',
    seat: 'expert-witness',
    description: 'Onchain Witness. Testifies on wallet flow, exchange movement, and onchain behavior.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.04,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'argos-onchain-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['onchain_data'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'notus-weather-data-witness',
    name: 'Notus',
    seat: 'expert-witness',
    description: 'Data Witness. Testifies on sports, weather, calendars, market quotes, macro context, and external datasets.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.03,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'notus-weather-data-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['weather_data', 'sports_data', 'calendar_resolution_session', 'calendar_data', 'market_data'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'skepsis-source-quality-witness',
    name: 'Skepsis',
    seat: 'expert-witness',
    description: 'Source Quality Witness. Grades source authority, freshness, directness, conflicts, and whether evidence actually satisfies the case context.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.03,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'skepsis-source-quality-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['web_news_search', 'web_page_scrape', 'research_session'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'chronos-timeline-witness',
    name: 'Chronos',
    seat: 'expert-witness',
    description: 'Timeline Witness. Builds event chronology, source timing, deadlines, horizons, and timing gaps.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.03,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'chronos-timeline-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['calendar_resolution_session', 'web_news_search', 'web_page_scrape', 'calendar_data', 'research_session'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'sophia-research-witness',
    name: 'Sophia',
    seat: 'expert-witness',
    description: 'Research Witness. Synthesizes broad web, scraped source, market, and dataset context while labeling what is direct proof versus background.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.04,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'sophia-research-witness',
    runMode: 'tool-backed-model',
    temperature: 0.15,
    toolCapabilities: ['research_session', 'web_news_search', 'web_page_scrape', 'prediction_market_data', 'market_data'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'numeros-quant-witness',
    name: 'Numeros',
    seat: 'expert-witness',
    description: 'Quant Witness. Testifies on price distance, volatility, liquidity, funding, market structure, and numerical constraints.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.04,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'numeros-quant-witness',
    runMode: 'tool-backed-model',
    temperature: 0.1,
    toolCapabilities: ['market_structure_session', 'market_data', 'prediction_market_data'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'social-count-witness',
    name: 'Thales',
    seat: 'expert-witness',
    description: 'Social Count Witness. Audits post, tweet, mention, follower, and account-activity count markets against handles, windows, and source rules.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.04,
    permissions: ['read_case', 'read_public_evidence', 'submit_testimony', 'request_payment'],
    inputSchema: 'court-case-v1',
    outputSchema: 'witness-testimony-v1',
    promptKey: 'thales-social-count-witness',
    runMode: 'tool-backed-model',
    temperature: 0.08,
    toolCapabilities: ['social_activity_data', 'web_news_search', 'web_page_scrape', 'visual_page_analysis'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'bull-counsel',
    name: 'Solon',
    seat: 'bull-counsel',
    description: 'Bull Counsel. Argues the upside or yes case and proposes the strongest positive interpretation.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.05,
    permissions: ['read_case', 'read_public_evidence', 'submit_argument', 'request_payment'],
    inputSchema: 'evidence-packet-v1',
    outputSchema: 'counsel-argument-v1',
    promptKey: 'solon-bull-counsel',
    runMode: 'model',
    temperature: 0.35,
    toolCapabilities: [],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'bear-counsel',
    name: 'Draco',
    seat: 'bear-counsel',
    description: 'Bear Counsel. Argues the downside or no case and challenges weak assumptions.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.05,
    permissions: ['read_case', 'read_public_evidence', 'submit_argument', 'request_payment'],
    inputSchema: 'evidence-packet-v1',
    outputSchema: 'counsel-argument-v1',
    promptKey: 'draco-bear-counsel',
    runMode: 'model',
    temperature: 0.35,
    toolCapabilities: [],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'risk-bailiff',
    name: 'Phylax',
    seat: 'risk-bailiff',
    description: 'Risk Bailiff. Checks confidence, evidence quality, liquidity context, and uncertainty before verdict.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.02,
    permissions: ['read_case', 'read_public_evidence', 'submit_risk_review', 'request_payment'],
    inputSchema: 'counsel-argument-v1',
    outputSchema: 'risk-review-v1',
    promptKey: 'phylax-risk-bailiff',
    runMode: 'model',
    temperature: 0.15,
    toolCapabilities: ['risk_analysis'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'dikast-momentum',
    name: 'Kallias',
    seat: 'juror',
    description: 'Dikast Juror. Evaluates whether momentum and fresh signals support a clearer verdict.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.01,
    permissions: ['read_case', 'read_public_evidence', 'submit_jury_vote', 'request_payment'],
    inputSchema: 'hearing-brief-v1',
    outputSchema: 'jury-vote-v1',
    promptKey: 'kallias-momentum-juror',
    runMode: 'model',
    temperature: 0.25,
    toolCapabilities: [],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'dikast-skeptic',
    name: 'Thraso',
    seat: 'juror',
    description: 'Dikast Juror. Challenges overconfidence and votes from a skeptical market lens.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.01,
    permissions: ['read_case', 'read_public_evidence', 'submit_jury_vote', 'request_payment'],
    inputSchema: 'hearing-brief-v1',
    outputSchema: 'jury-vote-v1',
    promptKey: 'thraso-skeptic-juror',
    runMode: 'model',
    temperature: 0.25,
    toolCapabilities: [],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'dikast-risk',
    name: 'Sophon',
    seat: 'juror',
    description: 'Dikast Juror. Votes from an uncertainty, source-quality, and evidence-risk perspective.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.01,
    permissions: ['read_case', 'read_public_evidence', 'submit_jury_vote', 'request_payment'],
    inputSchema: 'hearing-brief-v1',
    outputSchema: 'jury-vote-v1',
    promptKey: 'sophon-risk-juror',
    runMode: 'model',
    temperature: 0.2,
    toolCapabilities: ['risk_analysis'],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'head-judge',
    name: 'Archon',
    seat: 'head-judge',
    description: 'Head Judge. Weighs evidence, counsel arguments, dissent, and risk constraints to issue the verdict.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0,
    permissions: ['read_case', 'read_public_evidence', 'submit_verdict_recommendation'],
    inputSchema: 'hearing-brief-v1',
    outputSchema: 'verdict-v1',
    promptKey: 'archon-presiding-magistrate',
    runMode: 'model',
    temperature: 0.15,
    toolCapabilities: [],
    enabled: true,
    version: '0.1.0',
  },
  {
    id: 'settlement-clerk',
    name: 'Nomisma',
    seat: 'settlement-clerk',
    description: 'Settlement Clerk. Calculates agent payouts, protocol fees, and Arc court receipt events.',
    owner: 'protocol',
    mode: 'local',
    priceUsd: 0.02,
    permissions: ['read_case', 'request_payment'],
    inputSchema: 'verdict-v1',
    outputSchema: 'settlement-plan-v1',
    promptKey: 'nomisma-settlement-clerk',
    runMode: 'model',
    temperature: 0.05,
    toolCapabilities: ['settlement_accounting'],
    enabled: true,
    version: '0.1.0',
  },
]

export function getEnabledAgents() {
  return agentRegistry.filter((agent) => agent.enabled)
}

export type AgentOnchainProfile = {
  onchainAgentId?: string
  ownerKind: 'protocol' | 'external'
  ownerWallet?: `0x${string}`
  payoutWallet?: `0x${string}`
  metadataURI?: string
  feeQuoteUsd: number
  registrationStatus: 'registered' | 'protocol-wallet-ready' | 'protocol-wallet-pending' | 'external-wallet-ready' | 'external-wallet-pending'
}

export function getAgentWithOnchainProfile(agent: AgentRegistryEntry): AgentRegistryEntry & { onchain: AgentOnchainProfile } {
  const configured = getConfiguredOnchainProfile(agent.id)
  const ownerKind = agent.owner === 'protocol' ? 'protocol' : 'external'
  const ownerWallet = ownerKind === 'protocol'
    ? configured.ownerWallet ?? getProtocolAgentOwnerWallet()
    : configured.ownerWallet ?? asAddress(agent.owner)
  const payoutWallet = configured.payoutWallet ?? (ownerKind === 'protocol' ? getProtocolAgentPayoutWallet() : ownerWallet)
  const onchainAgentId = configured.onchainAgentId ?? agent.onchainAgentId
  const metadataURI = configured.metadataURI ?? agent.metadataURI
  const hasWallets = Boolean(ownerWallet && payoutWallet)

  return {
    ...agent,
    onchainAgentId,
    metadataURI,
    onchain: {
      onchainAgentId,
      ownerKind,
      ownerWallet,
      payoutWallet,
      metadataURI,
      feeQuoteUsd: agent.priceUsd,
      registrationStatus: onchainAgentId
        ? 'registered'
        : ownerKind === 'protocol'
          ? hasWallets ? 'protocol-wallet-ready' : 'protocol-wallet-pending'
          : hasWallets ? 'external-wallet-ready' : 'external-wallet-pending',
    },
  }
}

export function getAgentRegistryWithOnchainProfiles() {
  return agentRegistry.map(getAgentWithOnchainProfile)
}

function getConfiguredOnchainProfile(agentId: string) {
  const walletMap = parseAgentWalletMap()
  const mapProfile = walletMap[agentId] ?? {}
  const prefix = `HELIA_AGENT_${agentId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`

  return {
    onchainAgentId: process.env[`${prefix}_ONCHAIN_ID`] ?? mapProfile.onchainAgentId,
    ownerWallet: asAddress(process.env[`${prefix}_OWNER_WALLET`] ?? mapProfile.ownerWallet),
    payoutWallet: asAddress(process.env[`${prefix}_PAYOUT_WALLET`] ?? mapProfile.payoutWallet),
    metadataURI: process.env[`${prefix}_METADATA_URI`] ?? mapProfile.metadataURI,
  }
}

function getProtocolAgentOwnerWallet() {
  return asAddress(process.env.HELIA_PROTOCOL_AGENT_OWNER_WALLET)
}

function getProtocolAgentPayoutWallet() {
  return asAddress(process.env.HELIA_PROTOCOL_AGENT_PAYOUT_WALLET) ?? getProtocolAgentOwnerWallet()
}

function parseAgentWalletMap(): Record<string, Partial<AgentOnchainProfile>> {
  const raw = process.env.HELIA_AGENT_WALLETS_JSON
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, Partial<AgentOnchainProfile>>
  } catch {
    return {}
  }
}

function asAddress(value: string | undefined): `0x${string}` | undefined {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value as `0x${string}` : undefined
}
