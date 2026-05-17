export type CourtCase = {
  id: string
  title: string
  status: string
  detail: string
  budget: string
  updated: string
  note: string
  verdict: string
  confidence: string
  receipt: string
  probability: string
  horizon: string
  visibility: string
  market: string
  resolution?: string
  duplicatePolicy?: 'joinable' | 'fresh-hearing' | 'related'
}

export const courtCases: CourtCase[] = [
  {
    id: 'oil-volatility-red-sea',
    title: 'Oil volatility after Red Sea shipping alerts',
    status: 'Hearing',
    detail: '7 agents seated',
    budget: '8.50 USDC',
    updated: '2h ago',
    note: 'Jury vote pending',
    verdict: 'Watchlist',
    confidence: '62%',
    receipt: '0x7a19...c4e2',
    probability: '62%',
    horizon: '72h',
    visibility: 'Public verdict',
    market: 'Energy / Macro',
    resolution: 'Compare front-month oil volatility after 72 hours.',
    duplicatePolicy: 'fresh-hearing',
  },
  {
    id: 'eth-sol-etf-flows',
    title: 'ETH outperforming SOL into ETF flows',
    status: 'Evidence',
    detail: '4 witnesses summoned',
    budget: '6.75 USDC',
    updated: '18m ago',
    note: 'Counsel drafting',
    verdict: 'Counsel still drafting',
    confidence: '54%',
    receipt: 'Pending',
    probability: '54%',
    horizon: '7d',
    visibility: 'Private until verdict',
    market: 'Crypto',
    resolution: 'ETH spot return minus SOL spot return at the 7 day mark.',
    duplicatePolicy: 'joinable',
  },
  {
    id: 'cpi-prediction-markets',
    title: 'CPI surprise probability on prediction markets',
    status: 'Verdict',
    detail: 'No clear edge, 58%',
    budget: '5.25 USDC',
    updated: '1d ago',
    note: 'Receipt sealed',
    verdict: 'No clear edge',
    confidence: '58%',
    receipt: '0x31f0...a91d',
    probability: '58%',
    horizon: 'Event',
    visibility: 'Public archive',
    market: 'Macro',
    resolution: 'CPI print versus prediction-market consensus at release.',
    duplicatePolicy: 'related',
  },
  {
    id: 'btc-funding-squeeze',
    title: 'BTC funding squeeze into options expiry',
    status: 'Voting',
    detail: '3 dikasts reviewing',
    budget: '9.20 USDC',
    updated: '3h ago',
    note: 'Awaiting quorum',
    verdict: 'Awaiting jury vote',
    confidence: '49%',
    receipt: 'Pending',
    probability: '49%',
    horizon: '48h',
    visibility: 'Public verdict',
    market: 'Crypto derivatives',
    resolution: 'BTC perp funding and spot movement into options expiry.',
    duplicatePolicy: 'fresh-hearing',
  },
  {
    id: 'taiwan-election-semiconductor-risk',
    title: 'Taiwan election risk pricing in chip markets',
    status: 'Evidence',
    detail: '5 witnesses summoned',
    budget: '7.80 USDC',
    updated: '42m ago',
    note: 'News witness refreshing sources',
    verdict: 'Evidence collection',
    confidence: '46%',
    receipt: 'Pending',
    probability: '46%',
    horizon: '14d',
    visibility: 'Public verdict',
    market: 'Geopolitics / Equities',
    resolution: 'Track prediction-market odds versus semiconductor basket movement.',
    duplicatePolicy: 'related',
  },
  {
    id: 'atlantic-storm-insurance-odds',
    title: 'Atlantic storm odds before insurance repricing',
    status: 'Hearing',
    detail: 'Weather witness seated',
    budget: '6.40 USDC',
    updated: '55m ago',
    note: 'Counsel questioning Notus',
    verdict: 'Watchlist',
    confidence: '61%',
    receipt: 'Pending',
    probability: '61%',
    horizon: '5d',
    visibility: 'Public verdict',
    market: 'Weather / Prediction markets',
    resolution: 'Compare storm-path odds with insurance-linked market movement.',
    duplicatePolicy: 'fresh-hearing',
  },
]

export const similarCaseCandidates = [
  {
    id: 'eth-sol-etf-flows',
    title: 'ETH outperforming SOL into ETF flows',
    match: '92% match',
    status: 'Active hearing',
    reason: 'Same asset pair, same 7 day horizon, similar outperform condition.',
    recommendation: 'Join existing case',
    action: 'Join case',
  },
  {
    id: 'btc-funding-squeeze',
    title: 'BTC funding squeeze into options expiry',
    match: 'Related',
    status: 'Different market',
    reason: 'Crypto momentum case, but different asset and 48 hour resolution.',
    recommendation: 'Open as separate case',
    action: 'Use as reference',
  },
]

export function getCourtCase(id: string) {
  return courtCases.find((item) => item.id === id) ?? courtCases[0]
}
