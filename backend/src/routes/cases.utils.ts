export function normalizeWallet(value: string) {
  return value.toLowerCase()
}

export const supportedPredictionMarketHosts = ['polymarket.com', 'kalshi.com', 'manifold.markets']

export function isSupportedPredictionMarketLink(link: string) {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '').toLowerCase()
    return supportedPredictionMarketHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export function createCaseId(question: string, onchainCaseId?: string, txHash?: string) {
  if (txHash) return txHash
  if (onchainCaseId) return `arc-${onchainCaseId}`

  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

  return `${slug || 'case'}-${Date.now()}`
}
