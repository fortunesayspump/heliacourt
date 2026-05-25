export type PaidEvidence = {
  payer?: string
  txHash?: string
  amountMicroUsdc: number
  network?: string
}

export type X402PaymentRequirements = {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra?: Record<string, unknown>
}
