'use client'

import { Bell, BellSlash } from '@phosphor-icons/react'
import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { WalletButton } from './WalletButton'

export function CaseFollowButton({ caseId }: { caseId: string }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [following, setFollowing] = useState<boolean | undefined>()
  const [status, setStatus] = useState('')

  const toggleFollow = async () => {
    if (!address) return

    const nextFollowing = !(following ?? false)
    setStatus('Preparing wallet signature...')
    const challengeResponse = await fetch(`/api/cases/${encodeURIComponent(caseId)}/follow-challenge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ wallet: address }),
    })
    const challenge = await challengeResponse.json().catch(() => ({ error: 'challenge API returned a non-json response' }))
    if (!challengeResponse.ok || !challenge.message) {
      setStatus(challenge.error ?? 'Follow challenge failed')
      return
    }

    let signature: `0x${string}`
    try {
      setFollowing(challenge.following)
      setStatus(nextFollowing ? 'Sign to follow this case...' : 'Sign to unfollow this case...')
      signature = await signMessageAsync({ message: challenge.message })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Wallet signature was rejected')
      return
    }

    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/follow`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        wallet: address,
        following: nextFollowing,
        auth: {
          message: challenge.message,
          signature,
        },
      }),
    })
    const payload = await response.json().catch(() => ({ error: 'follow API returned a non-json response' }))
    if (!response.ok) {
      setStatus(payload.error ?? 'Follow update failed')
      return
    }

    setFollowing(payload.following)
    setStatus(payload.following ? 'Following case' : 'Removed from watchlist')
  }

  if (!isConnected) {
    return <WalletButton className="secondary-button compact-back" label="Connect to follow" />
  }

  return (
    <div className="case-follow-control">
      <button className="secondary-button compact-back" type="button" onClick={toggleFollow}>
        {(following ?? false) ? <BellSlash size={16} /> : <Bell size={16} />}
        {(following ?? false) ? 'Unfollow' : 'Follow'}
      </button>
      {status ? <span>{status}</span> : null}
    </div>
  )
}
