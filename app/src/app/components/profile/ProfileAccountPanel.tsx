'use client'

import { SealCheck, TelegramLogo, UserCircle, X } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import type { ApiUserAccount } from '../../../lib/backend-data'
import { formatSignatureError } from '../../../lib/wallet-errors'
import { ActionStatus, type ActionStatusTone } from '../ui/ActionStatus'
import { GatewayBalance } from '../wallet/GatewayBalance'
import { WalletBalance } from '../wallet/WalletBalance'
import { WalletButton } from '../wallet/WalletButton'

type ProfileForm = {
  username: string
  displayName: string
  bio: string
}

const emptyForm: ProfileForm = {
  username: '',
  displayName: '',
  bio: '',
}

type VisibilityFilter = 'all' | 'public' | 'private'

function parseVisibilityFilter(value: string | null): VisibilityFilter {
  return value === 'public' || value === 'private' ? value : 'all'
}

export function ProfileAccountPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [account, setAccount] = useState<ApiUserAccount | undefined>()
  const [form, setForm] = useState<ProfileForm>(emptyForm)
  const [status, setStatus] = useState('')
  const [statusTone, setStatusTone] = useState<ActionStatusTone>('info')
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [telegramLinking, setTelegramLinking] = useState(false)
  const [telegramLinked, setTelegramLinked] = useState(false)
  const [telegramPromptOpen, setTelegramPromptOpen] = useState(false)
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>(() => parseVisibilityFilter(searchParams.get('visibility')))
  const telegramLinkToken = searchParams.get('telegramLink')
  const requestedWallet = normalizeWalletParam(
    searchParams.get('wallet')
      ?? searchParams.get('address')
      ?? searchParams.get('account')
      ?? searchParams.get(''),
  )
  const targetWallet = requestedWallet ?? address
  const isOwnProfile = Boolean(address && targetWallet && address.toLowerCase() === targetWallet.toLowerCase())
  const setPanelStatus = (message: string, tone: ActionStatusTone = 'info') => {
    setStatus(message)
    setStatusTone(tone)
  }
  const redirectExpiredTelegramLink = () => {
    setTelegramPromptOpen(false)
    setPanelStatus('Telegram link expired. Redirecting to the app...', 'error')
    window.setTimeout(() => router.replace('/'), 900)
  }

  useEffect(() => {
    if (telegramLinkToken && isOwnProfile && !telegramLinked) {
      setTelegramPromptOpen(true)
    }
  }, [isOwnProfile, telegramLinkToken, telegramLinked])

  useEffect(() => {
    setVisibilityFilter(parseVisibilityFilter(searchParams.get('visibility')))
  }, [searchParams])

  const loadAccount = useCallback((showLoading = true) => {
    if (!targetWallet) {
      setAccount(undefined)
      setForm(emptyForm)
      return undefined
    }

    const controller = new AbortController()
    setPanelStatus('')
    if (showLoading) setLoading(true)
    fetch(`/api/users/${targetWallet}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.json())
      .then((payload: ApiUserAccount | { error?: string }) => {
        if (controller.signal.aborted) return
        if ('error' in payload) throw new Error(payload.error)
        if (!('profile' in payload)) throw new Error('Profile response is missing account data')
        setAccount(payload)
        setForm({
          username: payload.profile.username ?? '',
          displayName: payload.profile.displayName ?? '',
          bio: payload.profile.bio ?? '',
        })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setPanelStatus(error instanceof Error ? error.message : 'Profile unavailable', 'error')
      })
      .finally(() => {
        if (!controller.signal.aborted && showLoading) setLoading(false)
      })

    return controller
  }, [targetWallet])

  useEffect(() => {
    const controller = loadAccount(true)
    return () => {
      controller?.abort()
    }
  }, [loadAccount])

  useEffect(() => {
    if (!targetWallet) return

    const handleRefresh = () => {
      loadAccount(false)
    }

    window.addEventListener('helia:silent-refresh', handleRefresh)
    return () => window.removeEventListener('helia:silent-refresh', handleRefresh)
  }, [loadAccount, targetWallet])

  const payoutTotal = useMemo(
    () => account?.payouts.reduce((total, payout) => total + Number(payout.amountUsdc ?? 0), 0) ?? 0,
    [account?.payouts],
  )

  const profileName = account?.profile.displayName || account?.profile.username || 'No display name'
  const profileHandle = account?.profile.username ? `@${account.profile.username}` : 'No username'
  const profileBio = account?.profile.bio || 'No public profile note yet.'
  const telegramHandle = formatTelegramHandle(account?.telegram)
  const filedCases = account?.cases ?? []
  const followedCases = account?.follows ?? []
  const filteredFiledCases = filedCases.filter((item) => visibilityFilter === 'all' || item.visibility === visibilityFilter)
  const privateCaseCount = [...filedCases, ...followedCases].filter((item) => item.visibility === 'private').length
  const publicCaseCount = [...filedCases, ...followedCases].filter((item) => item.visibility === 'public').length
  const saveProfile = async () => {
    if (!address || !isOwnProfile || saving) return

    setSaving(true)
    setPanelStatus('Preparing wallet signature...', 'loading')
    const previousAccount = account
    try {
      const challengeResponse = await fetch(`/api/users/${address}/challenge`, {
        method: 'POST',
      })
      const challenge = await challengeResponse.json().catch(() => ({ error: 'challenge API returned a non-json response' }))
      if (!challengeResponse.ok || !challenge.message) {
        setPanelStatus(challenge.error ?? 'Profile signature challenge failed', 'error')
        return
      }

      setPanelStatus('Sign the profile update in your wallet...', 'loading')
      const signature = await signMessageAsync({ message: challenge.message })

      setAccount((current) => current ? {
        ...current,
        profile: {
          ...current.profile,
          username: form.username.trim() || null,
          displayName: form.displayName.trim() || null,
          bio: form.bio.trim() || null,
        },
      } : current)
      setPanelStatus('Saving profile...', 'loading')
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
        setAccount(previousAccount)
        setPanelStatus(payload.error ?? 'Profile save failed', 'error')
        return
      }

      setAccount((current) => current ? { ...current, profile: payload.profile } : current)
      setPanelStatus('Profile saved', 'success')
      setEditOpen(false)
    } catch (error) {
      setAccount(previousAccount)
      setPanelStatus(formatSignatureError(error, 'Profile save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const linkTelegram = async () => {
    if (telegramLinking) return
    if (!telegramLinkToken) {
      setPanelStatus('Telegram link token is missing. Open the latest /connect link from Telegram.', 'error')
      return
    }
    if (!address) {
      setPanelStatus('Connect the wallet you want to link with Telegram first.', 'error')
      return
    }

    setTelegramLinked(false)
    setTelegramLinking(true)
    setPanelStatus('Preparing Telegram link signature...', 'loading')
    try {
      const challengeResponse = await fetch('/api/telegram/link-challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: telegramLinkToken, wallet: address }),
      })
      const challenge = await challengeResponse.json().catch(() => ({ error: 'Telegram link challenge returned a non-json response' }))
      if (!challengeResponse.ok || !challenge.message) {
        if (isExpiredTelegramLinkError(challenge.error)) {
          redirectExpiredTelegramLink()
          return
        }
        setPanelStatus(challenge.error ?? 'Telegram link challenge failed', 'error')
        return
      }

      setPanelStatus('Sign the Telegram link in your wallet...', 'loading')
      const signature = await signMessageAsync({ message: challenge.message })
      setPanelStatus('Linking Telegram...', 'loading')

      const response = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: telegramLinkToken,
          wallet: address,
          auth: {
            message: challenge.message,
            signature,
          },
        }),
      })
      const payload = await response.json().catch(() => ({ error: 'Telegram link returned a non-json response' }))
      if (!response.ok) {
        if (isExpiredTelegramLinkError(payload.error)) {
          redirectExpiredTelegramLink()
          return
        }
        setPanelStatus(payload.error ?? 'Telegram link failed', 'error')
        return
      }

      if ('telegram' in payload && payload.telegram) {
        setAccount((current) => current ? { ...current, telegram: payload.telegram } : current)
      }
      setTelegramLinked(true)
      setPanelStatus('Telegram linked. Return to the bot and send /me.', 'success')
    } catch (error) {
      setPanelStatus(formatSignatureError(error, 'Telegram link failed'), 'error')
    } finally {
      setTelegramLinking(false)
    }
  }

  if (!targetWallet) {
    return (
      <section className="profile-empty-shell">
        <article className="panel profile-connect-panel">
          <div className="profile-avatar profile-avatar-large">
            <UserCircle size={32} weight="duotone" />
          </div>
          <div>
            <p className="eyebrow">Wallet needed</p>
            <h2>Connect to open your account desk</h2>
            <p>{telegramLinkToken ? 'Connect the wallet you want to use with Telegram, then sign the link request.' : 'Profiles are scoped to the wallet that files cases, follows hearings, unlocks private records, and receives payout receipts.'}</p>
          </div>
          <WalletButton className="secondary-button compact-back" label="Connect wallet" />
        </article>

        <section className="profile-access-grid" aria-label="Account sections">
          {[
            { title: 'Filed cases', detail: 'Your petitions and case roles stay grouped by wallet.' },
            { title: 'Followed hearings', detail: 'Watched cases and notification state live here.' },
            { title: 'Private access', detail: 'Funded or permissioned case records unlock for this account.' },
            { title: 'Payout receipts', detail: 'Agent and account payment rows stay tied to wallet history.' },
          ].map(({ title, detail }) => (
            <article className="profile-access-card" key={title}>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </section>
      </section>
    )
  }

  return (
    <section className="profile-dashboard">
      <section className="panel profile-identity-panel">
        <div className="profile-avatar">
          <img alt="" src={getWalletAvatarUrl(targetWallet)} />
        </div>
        <div className="profile-identity-copy">
          <p className="eyebrow">Signed account</p>
          <h2>{loading ? 'Loading account' : profileName}</h2>
          <p>{profileBio}</p>
          <div className="profile-address-row">
            <span>{profileHandle}</span>
            {isOwnProfile ? <WalletBalance label="Wallet" /> : null}
            {isOwnProfile ? <GatewayBalance /> : null}
            {isOwnProfile ? <WalletButton className="secondary-button compact-back" label="Wallet" /> : null}
            {telegramHandle ? (
              <span className="profile-telegram-chip">
                <TelegramLogo size={15} weight="fill" />
                {telegramHandle}
              </span>
            ) : null}
          </div>
        </div>
        <div className="profile-status-pill">
          <SealCheck size={18} weight="fill" />
          {isOwnProfile ? 'Active' : 'Public'}
        </div>
        {isOwnProfile ? (
          <button className="secondary-button compact-back profile-edit-trigger" type="button" onClick={() => setEditOpen(true)}>
            Edit profile
          </button>
        ) : null}
        {status ? (
          <div className="profile-inline-status">
            <ActionStatus status={{ text: status, tone: statusTone }} />
          </div>
        ) : null}
      </section>

      <section className="app-summary-grid profile-stat-grid" aria-label="Profile summary">
        <ProfileStat label="Filed cases" value={`${account?.cases.length ?? 0}`} />
        <ProfileStat label="Followed" value={`${account?.follows.length ?? 0}`} />
        <ProfileStat label="Participation" value={`${account?.participation.length ?? 0}`} />
        <ProfileStat label="Receipts" value={payoutTotal ? `${formatAmount(payoutTotal)} USDC` : `${account?.payouts.length ?? 0} rows`} />
      </section>

      <section className="profile-main-grid">
        <section className="profile-record-stack">
          <div className="profile-history-strip">
            <span>{publicCaseCount} public</span>
            <span>{privateCaseCount} private</span>
            <span>{account?.participation.length ?? 0} participation records</span>
          </div>

          <article className="panel app-section-panel profile-record-section">
            <div className="profile-panel-heading app-section-heading profile-section-heading">
              <div>
                <h3>Filed cases</h3>
                <p>Cases created or managed by this wallet.</p>
              </div>
              <strong>{filedCases.length} records</strong>
            </div>
            <div className="profile-visibility-row">
              {(['all', 'public', 'private'] as VisibilityFilter[]).map((filter) => (
                <button
                  className={visibilityFilter === filter ? 'active' : undefined}
                  key={filter}
                  type="button"
                  onClick={() => setVisibilityFilter(filter)}
                >
                  {formatTitleCase(filter)}
                </button>
              ))}
            </div>
            {filteredFiledCases.length ? (
              <div className="profile-record-list">
                {filteredFiledCases.slice(0, 8).map((item) => (
                  <Link className="app-record-row profile-record-row" href={`/cases/${item.id}`} key={item.id}>
                    {item.imageUrl ? <img alt="" className="profile-record-image" src={item.imageUrl} /> : null}
                    <span>
                      <strong>{item.title}</strong>
                      <small>{formatTitleCase(item.role)} · {formatTitleCase(item.visibility)}</small>
                    </span>
                    <time>{formatDate(item.updated)}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="profile-empty-copy">No {visibilityFilter === 'all' ? '' : `${visibilityFilter} `}filed cases are tied to this wallet yet.</p>
            )}
          </article>

          <article className="panel app-section-panel profile-record-section">
            <div className="profile-panel-heading app-section-heading profile-section-heading">
              <div>
                <h3>Followed cases</h3>
                <p>Hearings this account is watching.</p>
              </div>
              <strong>{followedCases.length} watched</strong>
            </div>
            {followedCases.length ? (
              <div className="profile-record-list">
                {followedCases.slice(0, 10).map((item) => (
                  <Link className="app-record-row profile-record-row" href={`/cases/${item.id}`} key={item.id}>
                    {item.imageUrl ? <img alt="" className="profile-record-image" src={item.imageUrl} /> : null}
                    <span>
                      <strong>{item.title}</strong>
                      <small>{formatTitleCase(item.visibility)} · followed {formatDate(item.followedAt)}</small>
                    </span>
                    <time>{formatDate(item.updated)}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="profile-empty-copy">No followed cases yet.</p>
            )}
          </article>

          <article className="panel app-section-panel profile-record-section">
            <div className="profile-panel-heading app-section-heading profile-section-heading">
              <div>
                <h3>Owned agents</h3>
                <p>Agent ownership and registry controls.</p>
              </div>
              <strong>Coming soon</strong>
            </div>
            <div className="profile-coming-soon profile-tab-coming-soon">
              <span>Coming soon</span>
              <strong>Agent ownership registry</strong>
              <p>Wallet-owned agents will show registration status, fee settings, earned receipts, and profile links here.</p>
            </div>
          </article>

          <article className="panel app-section-panel profile-record-section">
            <div className="profile-panel-heading app-section-heading profile-section-heading">
              <div>
                <h3>Receipt history</h3>
                <p>Wallet-linked payment records.</p>
              </div>
              <strong>{account?.payouts.length ?? 0} rows</strong>
            </div>
            {account?.payouts.length ? (
              <div className="profile-record-list profile-receipt-list">
                {account.payouts.slice(0, 6).map((item) => (
                  <Link className="app-record-row profile-record-row profile-receipt-row" href={`/cases/${item.caseId}?tab=receipts`} key={`${item.caseId}-${item.txHash}`}>
                    <span>
                      <strong>{item.amountUsdc ? `${formatAmount(Number(item.amountUsdc))} USDC` : 'Receipt recorded'}</strong>
                      <small>{shortHash(item.txHash)}</small>
                    </span>
                    <time>{formatDate(item.createdAt)}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="profile-empty-copy">No payout receipts yet.</p>
            )}
          </article>
        </section>
      </section>

      {editOpen ? (
        <div className="profile-modal-backdrop" role="presentation" onMouseDown={() => setEditOpen(false)}>
          <section
            aria-modal="true"
            className="profile-modal panel"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="profile-modal-head">
              <div className="profile-panel-heading">
                <UserCircle size={18} />
                <div>
                  <h3>Court identity</h3>
                  <p>Edit how your account appears beside filings and follows.</p>
                </div>
              </div>
              <button aria-label="Close profile editor" className="profile-modal-close" type="button" onClick={() => setEditOpen(false)}>
                <X size={18} />
              </button>
            </div>

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
                <span>Bio</span>
                <textarea value={form.bio} onChange={(event) => setForm((value) => ({ ...value, bio: event.target.value }))} />
              </label>
            </div>
            <div className="profile-action-row">
              <button className="secondary-button compact-back" disabled={saving} type="button" onClick={saveProfile}>
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              <ActionStatus status={status ? { text: status, tone: statusTone } : undefined} compact />
            </div>
          </section>
        </div>
      ) : null}
      {telegramPromptOpen && telegramLinkToken ? (
        <div className="profile-modal-backdrop" role="presentation" onMouseDown={() => {
          if (!telegramLinking) setTelegramPromptOpen(false)
        }}>
          <section
            aria-modal="true"
            className="profile-modal profile-telegram-modal panel"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="profile-modal-head">
              <div className="profile-panel-heading">
                <SealCheck size={18} />
                <div>
                  <h3>Link Telegram</h3>
                  <p>Sign once to connect this Telegram chat to your court wallet.</p>
                </div>
              </div>
              <button aria-label="Close Telegram linker" className="profile-modal-close" disabled={telegramLinking} type="button" onClick={() => setTelegramPromptOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <ActionStatus status={status ? { text: status, tone: statusTone } : { text: 'Ready to link this Telegram chat.', tone: 'info' }} />
            <div className="profile-action-row">
              <button className="primary-button compact-back" disabled={telegramLinking || telegramLinked} type="button" onClick={linkTelegram}>
                {telegramLinking ? 'Linking Telegram' : telegramLinked ? 'Telegram linked' : 'Link Telegram'}
              </button>
              <button className="secondary-button compact-back" disabled={telegramLinking} type="button" onClick={() => setTelegramPromptOpen(false)}>
                Not now
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function ProfileStat({ label, value }: {
  label: string
  value: string
}) {
  return (
    <article className="app-summary-card profile-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function normalizeWalletParam(value: string | null) {
  const normalized = value?.trim()
  return normalized && /^0x[a-fA-F0-9]{40}$/.test(normalized) ? normalized : undefined
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}

function formatTelegramHandle(telegram: ApiUserAccount['telegram']) {
  if (!telegram) return undefined
  if (telegram.username) return `@${telegram.username}`
  if (telegram.firstName) return telegram.firstName
  return `Telegram ${telegram.telegramUserId.slice(-5)}`
}

function isExpiredTelegramLinkError(value: unknown) {
  return typeof value === 'string' && /telegram link request expired or not found/i.test(value)
}

function getWalletAvatarUrl(address: string) {
  const seed = encodeURIComponent(address.toLowerCase())
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${seed}&backgroundColor=f4efe3,e8e0c7,d7cfad&radius=50&scale=82`
}

function formatAmount(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}
