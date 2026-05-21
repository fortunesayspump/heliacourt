'use client'

import { Briefcase, CurrencyDollar, UserCircle, Wallet } from '@phosphor-icons/react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import type { ApiUserAccount } from '../../lib/backend-data'
import { WalletButton } from './WalletButton'

type ProfileForm = {
  username: string
  displayName: string
  avatarUrl: string
  bio: string
}

const emptyForm: ProfileForm = {
  username: '',
  displayName: '',
  avatarUrl: '',
  bio: '',
}

export function ProfileAccountPanel() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [account, setAccount] = useState<ApiUserAccount | undefined>()
  const [form, setForm] = useState<ProfileForm>(emptyForm)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setAccount(undefined)
      setForm(emptyForm)
      return
    }

    let cancelled = false
    setLoading(true)
    fetch(`/api/users/${address}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: ApiUserAccount | { error?: string }) => {
        if (cancelled) return
        if ('error' in payload) throw new Error(payload.error)
        if (!('profile' in payload)) throw new Error('Profile response is missing account data')
        setAccount(payload)
        setForm({
          username: payload.profile.username ?? '',
          displayName: payload.profile.displayName ?? '',
          avatarUrl: payload.profile.avatarUrl ?? '',
          bio: payload.profile.bio ?? '',
        })
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Profile unavailable')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [address])

  const payoutTotal = useMemo(
    () => account?.payouts.reduce((total, payout) => total + Number(payout.amountUsdc ?? 0), 0) ?? 0,
    [account?.payouts],
  )

  const saveProfile = async () => {
    if (!address) return

    setStatus('Preparing wallet signature...')
    const challengeResponse = await fetch(`/api/users/${address}/challenge`, {
      method: 'POST',
    })
    const challenge = await challengeResponse.json().catch(() => ({ error: 'challenge API returned a non-json response' }))
    if (!challengeResponse.ok || !challenge.message) {
      setStatus(challenge.error ?? 'Profile signature challenge failed')
      return
    }

    let signature: `0x${string}`
    try {
      setStatus('Sign the profile update in your wallet...')
      signature = await signMessageAsync({ message: challenge.message })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Wallet signature was rejected')
      return
    }

    setStatus('Saving profile...')
    const response = await fetch(`/api/users/${address}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...form,
        auth: {
          message: challenge.message,
          signature,
        },
      }),
    })
    const payload = await response.json().catch(() => ({ error: 'profile API returned a non-json response' }))
    if (!response.ok) {
      setStatus(payload.error ?? 'Profile save failed')
      return
    }

    setAccount((current) => current ? { ...current, profile: payload.profile } : current)
    setStatus('Profile saved')
  }

  if (!isConnected || !address) {
    return (
      <section className="panel settings-list">
        <article className="rail-card">
          <UserCircle size={18} />
          <div>
            <h3>Court identity</h3>
            <p>Connect a wallet to create a profile, view filed cases, and track agent payout rows tied to your wallet.</p>
            <WalletButton className="secondary-button compact-back" label="Connect wallet" />
          </div>
        </article>
      </section>
    )
  }

  return (
    <>
      <section className="metrics-grid">
        <div className="metric">
          <Wallet size={19} />
          <div>
            <span>Wallet</span>
            <strong>{shortAddress(address)}</strong>
          </div>
        </div>
        <div className="metric">
          <Briefcase size={19} />
          <div>
            <span>My cases</span>
            <strong>{account?.cases.length ?? 0} filed</strong>
          </div>
        </div>
        <div className="metric">
          <CurrencyDollar size={19} />
          <div>
            <span>My payouts</span>
            <strong>{payoutTotal ? `${formatAmount(payoutTotal)} USDC` : `${account?.payouts.length ?? 0} rows`}</strong>
          </div>
        </div>
        <div className="metric">
          <UserCircle size={19} />
          <div>
            <span>Profile</span>
            <strong>{loading ? 'Loading' : account?.profile.username ? `@${account.profile.username}` : 'Unnamed'}</strong>
          </div>
        </div>
      </section>

      <section className="panel settings-list">
        <article className="rail-card profile-editor-card">
          <UserCircle size={18} />
          <div>
            <h3>Court identity</h3>
            <div className="profile-form-grid">
              <label>
                <span>Username</span>
                <input value={form.username} onChange={(event) => setForm((value) => ({ ...value, username: event.target.value }))} />
              </label>
              <label>
                <span>Display name</span>
                <input value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} />
              </label>
              <label>
                <span>Avatar URL</span>
                <input value={form.avatarUrl} onChange={(event) => setForm((value) => ({ ...value, avatarUrl: event.target.value }))} />
              </label>
              <label>
                <span>Bio</span>
                <textarea value={form.bio} onChange={(event) => setForm((value) => ({ ...value, bio: event.target.value }))} />
              </label>
            </div>
            <button className="secondary-button compact-back" type="button" onClick={saveProfile}>Save profile</button>
            {status ? <p>{status}</p> : null}
          </div>
        </article>

        <article className="rail-card">
          <Briefcase size={18} />
          <div>
            <h3>My filed cases</h3>
            {account?.cases.length ? (
              <div className="profile-case-list">
                {account.cases.slice(0, 5).map((item) => (
                  <Link href={`/cases/${item.id}`} key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.role} · {item.visibility}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p>No filed cases are tied to this wallet yet.</p>
            )}
          </div>
        </article>
      </section>
    </>
  )
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatAmount(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}
