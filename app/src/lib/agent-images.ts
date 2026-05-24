const agentAvatar = (name: string) => `/assets/agents/avatars-webp/${name}.webp`

export const agentAvatarById: Record<string, string> = {
  'head-judge': agentAvatar('archon'),
  'bull-counsel': agentAvatar('solon'),
  'bear-counsel': agentAvatar('draco'),
  'pythia-prediction-witness': agentAvatar('pythia'),
  'hermes-news-witness': agentAvatar('hermes'),
  'web-scraper-witness': agentAvatar('aletheia'),
  'visual-evidence-witness': agentAvatar('eikon'),
  'argos-onchain-witness': agentAvatar('argos'),
  'notus-weather-data-witness': agentAvatar('notus'),
  'skepsis-source-quality-witness': agentAvatar('skepsis'),
  'chronos-timeline-witness': agentAvatar('chronos'),
  'sophia-research-witness': agentAvatar('sophia'),
  'numeros-quant-witness': agentAvatar('numeros'),
  'social-count-witness': agentAvatar('thales'),
  'risk-bailiff': agentAvatar('phylax'),
  'court-clerk': agentAvatar('mnemon'),
  'evidence-clerk': agentAvatar('kleio'),
  'settlement-clerk': agentAvatar('nomisma'),
  'dikast-momentum': agentAvatar('kallias'),
  'dikast-skeptic': agentAvatar('thraso'),
  'dikast-risk': agentAvatar('sophon'),
  'prediction-market-analyst': agentAvatar('pythia'),
  'macro-researcher': agentAvatar('sophia'),
  'onchain-analyst': agentAvatar('argos'),
}

export const agentAvatarByName: Record<string, string> = {
  archon: agentAvatar('archon'),
  solon: agentAvatar('solon'),
  draco: agentAvatar('draco'),
  pythia: agentAvatar('pythia'),
  hermes: agentAvatar('hermes'),
  aletheia: agentAvatar('aletheia'),
  eikon: agentAvatar('eikon'),
  argos: agentAvatar('argos'),
  notus: agentAvatar('notus'),
  skepsis: agentAvatar('skepsis'),
  chronos: agentAvatar('chronos'),
  sophia: agentAvatar('sophia'),
  numeros: agentAvatar('numeros'),
  thales: agentAvatar('thales'),
  phylax: agentAvatar('phylax'),
  mnemon: agentAvatar('mnemon'),
  kleio: agentAvatar('kleio'),
  nomisma: agentAvatar('nomisma'),
  kallias: agentAvatar('kallias'),
  thraso: agentAvatar('thraso'),
  sophon: agentAvatar('sophon'),
  'prediction market analyst': agentAvatar('pythia'),
  'macro researcher': agentAvatar('sophia'),
  'onchain analyst': agentAvatar('argos'),
  'risk bailiff': agentAvatar('phylax'),
}

export function getAgentAvatarUrl(agentId?: string, agentName?: string) {
  if (agentId && agentAvatarById[agentId]) return agentAvatarById[agentId]
  const normalizedName = agentName?.trim().toLowerCase()
  if (normalizedName && agentAvatarByName[normalizedName]) return agentAvatarByName[normalizedName]
  return undefined
}
