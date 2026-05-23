export const agentAvatarById: Record<string, string> = {
  'head-judge': '/assets/agents/archon.png',
  'bull-counsel': '/assets/agents/solon.png',
  'bear-counsel': '/assets/agents/draco.png',
  'pythia-prediction-witness': '/assets/agents/pythia.png',
  'hermes-news-witness': '/assets/agents/hermes.png',
  'web-scraper-witness': '/assets/agents/aletheia.png',
  'visual-evidence-witness': '/assets/agents/eikon.png',
  'argos-onchain-witness': '/assets/agents/argos.png',
  'notus-weather-data-witness': '/assets/agents/notus.png',
  'skepsis-source-quality-witness': '/assets/agents/skepsis.png',
  'chronos-timeline-witness': '/assets/agents/chronos.png',
  'sophia-research-witness': '/assets/agents/sophia.png',
  'numeros-quant-witness': '/assets/agents/numeros.png',
  'social-count-witness': '/assets/agents/thales.png',
  'risk-bailiff': '/assets/agents/phylax.png',
  'court-clerk': '/assets/agents/mnemon.png',
  'evidence-clerk': '/assets/agents/kleio.png',
  'settlement-clerk': '/assets/agents/nomisma.png',
  'dikast-momentum': '/assets/agents/kallias.png',
  'dikast-skeptic': '/assets/agents/thraso.png',
  'dikast-risk': '/assets/agents/sophon.png',
  'prediction-market-analyst': '/assets/agents/pythia.png',
  'macro-researcher': '/assets/agents/sophia.png',
  'onchain-analyst': '/assets/agents/argos.png',
}

export const agentAvatarByName: Record<string, string> = {
  archon: '/assets/agents/archon.png',
  solon: '/assets/agents/solon.png',
  draco: '/assets/agents/draco.png',
  pythia: '/assets/agents/pythia.png',
  hermes: '/assets/agents/hermes.png',
  aletheia: '/assets/agents/aletheia.png',
  eikon: '/assets/agents/eikon.png',
  argos: '/assets/agents/argos.png',
  notus: '/assets/agents/notus.png',
  skepsis: '/assets/agents/skepsis.png',
  chronos: '/assets/agents/chronos.png',
  sophia: '/assets/agents/sophia.png',
  numeros: '/assets/agents/numeros.png',
  thales: '/assets/agents/thales.png',
  phylax: '/assets/agents/phylax.png',
  mnemon: '/assets/agents/mnemon.png',
  kleio: '/assets/agents/kleio.png',
  nomisma: '/assets/agents/nomisma.png',
  kallias: '/assets/agents/kallias.png',
  thraso: '/assets/agents/thraso.png',
  sophon: '/assets/agents/sophon.png',
  'prediction market analyst': '/assets/agents/pythia.png',
  'macro researcher': '/assets/agents/sophia.png',
  'onchain analyst': '/assets/agents/argos.png',
  'risk bailiff': '/assets/agents/phylax.png',
}

export function getAgentAvatarUrl(agentId?: string, agentName?: string) {
  if (agentId && agentAvatarById[agentId]) return agentAvatarById[agentId]
  const normalizedName = agentName?.trim().toLowerCase()
  if (normalizedName && agentAvatarByName[normalizedName]) return agentAvatarByName[normalizedName]
  return undefined
}
