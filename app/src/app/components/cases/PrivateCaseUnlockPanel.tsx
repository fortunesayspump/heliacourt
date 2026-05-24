'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import type { ApiCaseDetail } from '../../../lib/backend-data'
import { WalletButton } from '../wallet/WalletButton'

export function PrivateCaseUnlockPanel({ caseId }: { caseId: string }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [status, setStatus] = useState('')
  const [detail, setDetail] = useState<ApiCaseDetail | undefined>()

  const unlock = async () => {
    if (!address) return

    setStatus('Preparing private-case signature...')
    const challengeResponse = await fetch(`/api/cases/${encodeURIComponent(caseId)}/challenge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ wallet: address }),
    })
    const challenge = await challengeResponse.json().catch(() => ({ error: 'challenge API returned a non-json response' }))
    if (!challengeResponse.ok || !challenge.message) {
      setStatus(challenge.error ?? 'Private-case challenge failed')
      return
    }

    let signature: `0x${string}`
    try {
      setStatus('Sign in your wallet to unlock this private case...')
      signature = await signMessageAsync({ message: challenge.message })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Wallet signature was rejected')
      return
    }

    setStatus('Unlocking private case...')
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/private`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        wallet: address,
        auth: {
          message: challenge.message,
          signature,
        },
      }),
    })
    const payload = await response.json().catch(() => ({ error: 'private case API returned a non-json response' }))
    if (!response.ok || !payload.case) {
      setStatus(payload.error ?? 'Private case unlock failed')
      return
    }

    setDetail(payload)
    setStatus('Private case unlocked')
  }

  if (detail) {
    return (
      <section className="panel private-unlock-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Private record</p>
            <h2>{detail.case.title}</h2>
          </div>
        </div>
        <div className="settlement-table">
          <div>
            <span>Status</span>
            <strong>{detail.case.status}</strong>
          </div>
          <div>
            <span>Visibility</span>
            <strong>{detail.case.visibility}</strong>
          </div>
          <div>
            <span>Transcript</span>
            <strong>{detail.transcript.length} turns</strong>
          </div>
          <div>
            <span>Artifacts</span>
            <strong>{detail.artifacts.length} records</strong>
          </div>
        </div>
        <article className="case-box">
          <p className="eyebrow">Verdict</p>
          <h3>{detail.case.verdict ?? 'No verdict yet'}</h3>
          {detail.case.resolution ? <p>{detail.case.resolution}</p> : null}
        </article>
        <div className="profile-case-list private-turn-list">
          {detail.transcript.slice(-8).map((turn) => (
            <div key={turn.id}>
              <strong>{turn.agentName}</strong>
              <span>{turn.stage}</span>
              <p>{turn.message}</p>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="panel empty-state private-unlock-panel">
      <strong>Private case</strong>
      <p>This record is hidden from public case routes. Connect the filer wallet and sign a one-use message to unlock it.</p>
      {isConnected ? (
        <button className="primary-button" type="button" onClick={unlock}>
          Unlock private case
        </button>
      ) : (
        <WalletButton className="primary-button" label="Connect wallet" />
      )}
      {status ? <p>{status}</p> : null}
      <Link className="secondary-button compact-back" href="/cases">Back to docket</Link>
    </section>
  )
}
