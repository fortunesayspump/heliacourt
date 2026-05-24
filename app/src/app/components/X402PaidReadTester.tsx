'use client'

import { ArrowClockwise, Lightning, ShieldCheck } from '@phosphor-icons/react'
import { BatchEvmScheme } from '@circle-fin/x402-batching/client'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { useEffect, useMemo, useState } from 'react'
import { type Address } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'

type X402Resource = 'price' | 'transcript' | 'receipts' | 'proof'

const resourceOptions: { value: X402Resource; label: string; detail: string }[] = [
  { value: 'proof', label: 'Proof', detail: 'Record hash, receipts, transcript count' },
  { value: 'transcript', label: 'Transcript', detail: 'Latest hearing turns' },
  { value: 'receipts', label: 'Receipts', detail: 'Arc settlement records' },
  { value: 'price', label: 'Price', detail: 'Market status and verdict' },
]

export function X402PaidReadTester({ suggestedCaseId }: { suggestedCaseId?: string | null }) {
  const { address, isConnected } = useAccount()
  const walletClient = useWalletClient()
  const [resource, setResource] = useState<X402Resource>('proof')
  const [caseId, setCaseId] = useState(suggestedCaseId ?? '')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Ready to request a paid proof route.')
  const [responseBody, setResponseBody] = useState('')
  const [settlement, setSettlement] = useState('')
  const [policyEnabled, setPolicyEnabled] = useState(false)
  const [policyMaxUsdc, setPolicyMaxUsdc] = useState('0.05')
  const [policyMaxReads, setPolicyMaxReads] = useState('5')
  const [policySpentMicroUsdc, setPolicySpentMicroUsdc] = useState(0)
  const [policyReadsUsed, setPolicyReadsUsed] = useState(0)

  const trimmedCaseId = useMemo(() => caseId.trim(), [caseId])
  const policyRemainingReads = Math.max(0, Number(policyMaxReads || 0) - policyReadsUsed)
  const policyMaxMicroUsdc = Math.max(0, Math.floor(Number(policyMaxUsdc || 0) * 1_000_000))
  const policyRemainingUsdc = Math.max(0, policyMaxMicroUsdc - policySpentMicroUsdc) / 1_000_000

  useEffect(() => {
    if (!address) return
    const stored = window.localStorage.getItem(policyStorageKey(address))
    if (!stored) return
    try {
      const policy = JSON.parse(stored) as Partial<{
        enabled: boolean
        maxUsdc: string
        maxReads: string
        spentMicroUsdc: number
        readsUsed: number
      }>
      setPolicyEnabled(Boolean(policy.enabled))
      setPolicyMaxUsdc(policy.maxUsdc ?? '0.05')
      setPolicyMaxReads(policy.maxReads ?? '5')
      setPolicySpentMicroUsdc(Number(policy.spentMicroUsdc ?? 0))
      setPolicyReadsUsed(Number(policy.readsUsed ?? 0))
    } catch {
      window.localStorage.removeItem(policyStorageKey(address))
    }
  }, [address])

  useEffect(() => {
    if (!address) return
    window.localStorage.setItem(policyStorageKey(address), JSON.stringify({
      enabled: policyEnabled,
      maxUsdc: policyMaxUsdc,
      maxReads: policyMaxReads,
      spentMicroUsdc: policySpentMicroUsdc,
      readsUsed: policyReadsUsed,
    }))
  }, [address, policyEnabled, policyMaxUsdc, policyMaxReads, policySpentMicroUsdc, policyReadsUsed])

  async function runPaidRead() {
    if (!isConnected || !address || !walletClient.data) {
      setStatus('Connect wallet first.')
      return
    }
    if (!trimmedCaseId) {
      setStatus('Paste a case id first.')
      return
    }

    setBusy(true)
    setSettlement('')
    setResponseBody('')

    try {
      const endpoint = `/api/x402/${resource}/${encodeURIComponent(trimmedCaseId)}`
      setStatus('Requesting payment requirements...')
      const challengeResponse = await fetch(endpoint, { cache: 'no-store' })
      const challengeBody = await readJson(challengeResponse)

      if (challengeResponse.status !== 402) {
        setStatus(`Expected 402 payment request, got ${challengeResponse.status}.`)
        setResponseBody(formatJson(challengeBody))
        return
      }

      const signer = {
        address: address as Address,
        signTypedData: (params: {
          domain: Record<string, unknown>
          types: Record<string, Array<{ name: string; type: string }>>
          primaryType: string
          message: Record<string, unknown>
        }) => walletClient.data.signTypedData({
          account: address as Address,
          domain: params.domain as never,
          types: params.types,
          primaryType: params.primaryType,
          message: params.message,
        } as never),
      }
      const coreClient = new x402Client().register('eip155:*', new BatchEvmScheme(signer) as never)
      const httpClient = new x402HTTPClient(coreClient)
      const paymentRequired = httpClient.getPaymentRequiredResponse(
        (name) => challengeResponse.headers.get(name),
        challengeBody,
      )
      const accepted = getAcceptedRequirement(paymentRequired)
      const amountMicroUsdc = Number(accepted?.amount ?? 0)
      const policyError = validatePolicy({
        enabled: policyEnabled,
        amountMicroUsdc,
        maxMicroUsdc: policyMaxMicroUsdc,
        maxReads: Number(policyMaxReads || 0),
        spentMicroUsdc: policySpentMicroUsdc,
        readsUsed: policyReadsUsed,
      })
      if (policyError) {
        setStatus(policyError)
        setResponseBody(formatJson(paymentRequired))
        return
      }

      setStatus('Signing Gateway x402 authorization...')
      const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
      const paymentHeaders: Record<string, string> = httpClient.encodePaymentSignatureHeader(paymentPayload)
      const challengeToken = challengeResponse.headers.get('x-payment-challenge')
      if (challengeToken) paymentHeaders['x-payment-challenge'] = challengeToken

      setStatus('Submitting paid read...')
      const paidResponse = await fetch(endpoint, {
        cache: 'no-store',
        headers: paymentHeaders,
      })
      const paidBody = await readJson(paidResponse)
      setResponseBody(formatJson(paidBody))

      if (!paidResponse.ok) {
        setStatus(`Paid read failed with ${paidResponse.status}.`)
        return
      }

      const settled = httpClient.getPaymentSettleResponse((name) => paidResponse.headers.get(name))
      setSettlement(formatJson(settled))
      if (policyEnabled) {
        setPolicySpentMicroUsdc((value) => value + amountMicroUsdc)
        setPolicyReadsUsed((value) => value + 1)
      }
      setStatus('Paid read settled and returned.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'x402 paid read failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel x402-live-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Arc OSS flow</p>
          <h2>Browser x402 API read</h2>
        </div>
        <Lightning size={20} />
      </div>

      <div className="x402-live-layout">
        <div className="x402-live-controls">
          <label>
            <span>Case id</span>
            <input value={caseId} onChange={(event) => setCaseId(event.target.value)} placeholder="0xcf0b..." />
          </label>
          <div className="x402-resource-picker" role="list">
            {resourceOptions.map((option) => (
              <button
                className={resource === option.value ? 'active' : ''}
                key={option.value}
                type="button"
                onClick={() => setResource(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>
          <div className="x402-policy-box">
            <label className="x402-policy-toggle">
              <input type="checkbox" checked={policyEnabled} onChange={(event) => setPolicyEnabled(event.target.checked)} />
              <span>Use local spend policy</span>
            </label>
            <div className="x402-policy-fields">
              <label>
                <span>Max USDC</span>
                <input inputMode="decimal" value={policyMaxUsdc} onChange={(event) => setPolicyMaxUsdc(event.target.value)} />
              </label>
              <label>
                <span>Max reads</span>
                <input inputMode="numeric" value={policyMaxReads} onChange={(event) => setPolicyMaxReads(event.target.value)} />
              </label>
            </div>
            <div className="x402-policy-meter">
              <span>{policyReadsUsed} used</span>
              <span>{policyRemainingReads} left</span>
              <span>{formatUsdc(policyRemainingUsdc)} USDC left</span>
            </div>
            <button className="secondary-button compact-back" type="button" onClick={() => {
              setPolicySpentMicroUsdc(0)
              setPolicyReadsUsed(0)
            }}>
              Reset policy
            </button>
          </div>
          <button className="primary-button wallet-primary" type="button" onClick={runPaidRead} disabled={busy || !isConnected}>
            {busy ? <ArrowClockwise size={16} /> : <ShieldCheck size={16} />}
            {busy ? 'Working' : 'Pay and read'}
          </button>
          <p className="gateway-status">{status}</p>
          <p className="gateway-explainer">Use this when a browser agent or external app needs structured JSON. Public case pages stay free to read.</p>
        </div>

        <div className="x402-live-result">
          <div>
            <span>Settlement</span>
            <pre>{settlement || 'Payment response appears here after settlement.'}</pre>
          </div>
          <div>
            <span>Payload</span>
            <pre>{responseBody || 'Paid API response appears here.'}</pre>
          </div>
        </div>
      </div>
    </section>
  )
}

async function readJson(response: Response) {
  return response.json().catch(async () => ({ raw: await response.text().catch(() => '') }))
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function getAcceptedRequirement(paymentRequired: unknown) {
  const record = paymentRequired as { accepts?: Array<{ amount?: string }> }
  return Array.isArray(record.accepts) ? record.accepts[0] : undefined
}

function validatePolicy(input: {
  enabled: boolean
  amountMicroUsdc: number
  maxMicroUsdc: number
  maxReads: number
  spentMicroUsdc: number
  readsUsed: number
}) {
  if (!input.enabled) return ''
  if (!Number.isFinite(input.amountMicroUsdc) || input.amountMicroUsdc <= 0) return 'Payment amount is unavailable.'
  if (!Number.isFinite(input.maxReads) || input.maxReads <= 0) return 'Set a positive read limit.'
  if (!Number.isFinite(input.maxMicroUsdc) || input.maxMicroUsdc <= 0) return 'Set a positive USDC limit.'
  if (input.readsUsed + 1 > input.maxReads) return 'Local spend policy read limit reached.'
  if (input.spentMicroUsdc + input.amountMicroUsdc > input.maxMicroUsdc) return 'Local spend policy USDC limit reached.'
  return ''
}

function policyStorageKey(address: string) {
  return `helia-x402-policy:${address.toLowerCase()}`
}

function formatUsdc(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
