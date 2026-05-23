'use client'

import { Bell, BellSlash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { WalletButton } from './WalletButton'

export function CaseFollowButton({ caseId }: { caseId: string }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [following, setFollowing] = useState<boolean | undefined>()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!address) {
      setFollowing(undefined)
      return
    }

    let cancelled = false

    fetch(`/api/users/${address}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => undefined)
        if (!response.ok || !payload || cancelled) return
        const follows = Array.isArray(payload.follows) ? payload.follows : []
        setFollowing(follows.some((item: { id?: string }) => item.id === caseId))
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [address, caseId])

  const toggleFollow = async () => {
    if (!address || pending) return

    setPending(true)
    setStatus('Preparing wallet signature...')
    try {
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

      const currentFollowing = typeof following === 'boolean' ? following : Boolean(challenge.following)
      const nextFollowing = !currentFollowing

      let signature: `0x${string}`
      setStatus(nextFollowing ? 'Sign to follow this case...' : 'Sign to unfollow this case...')
      signature = await signMessageAsync({ message: challenge.message })

      setFollowing(nextFollowing)
      setStatus(nextFollowing ? 'Following case...' : 'Removing from watchlist...')
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
        setFollowing(currentFollowing)
        setStatus(payload.error ?? 'Follow update failed')
        return
      }

      setFollowing(payload.following)
      setStatus(payload.following ? 'Following case' : 'Removed from watchlist')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Follow update failed')
    } finally {
      setPending(false)
    }
  }

  if (!isConnected) {
    return <WalletButton className="secondary-button compact-back" label="Connect to follow" />
  }

  return (
    <div className="case-follow-control">
      <button className="secondary-button compact-back" disabled={pending} type="button" onClick={toggleFollow}>
        {(following ?? false) ? <BellSlash size={16} /> : <Bell size={16} />}
        {(following ?? false) ? 'Unfollow' : 'Follow'}
      </button>
      {status ? <span>{status}</span> : null}
    </div>
  )
}
