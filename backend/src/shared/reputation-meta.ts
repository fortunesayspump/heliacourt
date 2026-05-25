import { arcErc8004 } from '../chains/erc8004.js'
import { env } from '../config/env.js'

const agentId = Number(process.env.HELIA_ERC8004_AGENT_ID ?? '20245')
const agentURI = process.env.HELIA_ERC8004_AGENT_URI ?? 'https://heliacourt.xyz/.well-known/erc8004-agent.json'

const giveFeedbackAbi =
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external'

export type ReputationMetaOptions = {
  service: string
  endpoint?: string
  caseId?: string
  evidenceId?: string
}

export function getReputationMeta(options: ReputationMetaOptions) {
  const endpoint = normalizeEndpoint(options.endpoint ?? serviceEndpoint(options.service, options.caseId))

  return {
    standard: 'ERC-8004',
    mode: 'user-submitted',
    note: 'Helia Court returns this metadata after service use so the client wallet can submit honest feedback directly.',
    agentId,
    agentURI,
    chainId: arcErc8004.chainId,
    caip2: arcErc8004.caip2,
    identityRegistry: arcErc8004.identityRegistry,
    reputationRegistry: arcErc8004.reputationRegistry,
    validationRegistry: arcErc8004.validationRegistry,
    endpoint,
    service: options.service,
    evidenceId: options.evidenceId ?? options.caseId ?? null,
    giveFeedbackABI: giveFeedbackAbi,
    suggestedValue: {
      scale: '0-100',
      valueDecimals: 0,
      successRange: '80-100',
    },
    suggestedTags: {
      tag1Options: ['completed', 'useful', 'accurate', 'fast', 'paid_read', 'hearing_queued', 'needs_review', 'failed'],
      tag2: options.service,
    },
    exampleArgs: {
      agentId,
      value: 100,
      valueDecimals: 0,
      tag1: 'completed',
      tag2: options.service,
      endpoint,
      feedbackURI: '',
      feedbackHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    },
  }
}

function serviceEndpoint(service: string, caseId?: string) {
  if (service.startsWith('x402-') && caseId) {
    const resource = service.replace(/^x402-/, '')
    return `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/api/x402/${resource}/${encodeURIComponent(caseId)}`
  }

  if (service === 'a2a-hearing' || service === 'mcp-hearing' || service === 'hearing-job') {
    return `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}/api/agents/hearing/jobs`
  }

  return env.HELIA_PUBLIC_APP_URL
}

function normalizeEndpoint(endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint
  return `${env.HELIA_PUBLIC_APP_URL.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}
