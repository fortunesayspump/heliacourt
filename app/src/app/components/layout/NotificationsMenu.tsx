'use client'

import { Bell, BellRinging, CurrencyDollar, Eye, Scales } from '@phosphor-icons/react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'

type NotificationPayload = {
  notifications?: Array<{
    id: string
    kind: 'case' | 'follow' | 'receipt'
    href: string
    title: string
    detail: string
    createdAt?: string
  }>
}

type NotificationItem = {
  id: string
  href: string
  title: string
  detail: string
  time?: string
  tone: 'case' | 'follow' | 'receipt'
}

function formatRelativeTime(value?: string) {
  if (!value) return undefined

  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return undefined

  const delta = Date.now() - time
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (delta < minute) return 'now'
  if (delta < hour) return `${Math.max(1, Math.floor(delta / minute))}m ago`
  if (delta < day) return `${Math.floor(delta / hour)}h ago`
  return `${Math.floor(delta / day)}d ago`
}

export function NotificationsMenu() {
  const { address, isConnected } = useAccount()
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<NotificationPayload | undefined>()
  const menuRef = useRef<HTMLDivElement>(null)
  const refreshNotifications = useCallback(() => {
    if (!isConnected || !address) {
      setPayload(undefined)
      return undefined
    }

    const controller = new AbortController()
    fetch(`/api/users/${address}/notifications`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : undefined)
      .then((payload) => {
        if (!controller.signal.aborted) setPayload(payload as NotificationPayload | undefined)
      })
      .catch(() => {
        if (!controller.signal.aborted) setPayload(undefined)
      })

    return controller
  }, [address, isConnected])

  useEffect(() => {
    const controller = refreshNotifications()
    return () => {
      controller?.abort()
    }
  }, [refreshNotifications])

  useEffect(() => {
    if (!isConnected || !address) return

    const handleRefresh = () => {
      refreshNotifications()
    }
    const interval = window.setInterval(handleRefresh, 30_000)

    window.addEventListener('helia:silent-refresh', handleRefresh)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('helia:silent-refresh', handleRefresh)
    }
  }, [address, isConnected, refreshNotifications])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!isConnected) {
      return [
        {
          id: 'connect',
          href: '/profile',
          title: 'Connect wallet',
          detail: 'Follow cases, file hearings, and receive account updates.',
          tone: 'follow',
        },
      ]
    }

    return (payload?.notifications ?? []).slice(0, 8).map((item) => ({
      id: item.id,
      href: item.href,
      title: item.title,
      detail: item.detail,
      time: formatRelativeTime(item.createdAt),
      tone: item.kind,
    }))
  }, [payload, isConnected])

  const unreadCount = notifications.length

  return (
    <div className="notification-menu" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-label="Notifications"
        className={`notification-trigger${unreadCount ? ' has-notifications' : ''}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {unreadCount ? <BellRinging size={21} /> : <Bell size={21} />}
        {unreadCount ? (
          <span className="notification-signal" aria-label={`${unreadCount} active notifications`}>
            {Math.min(unreadCount, 9)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-panel">
          <div className="notification-panel-head">
            <span>Notifications</span>
            <strong>{unreadCount ? `${unreadCount} active` : 'Clear'}</strong>
          </div>

          <div className="notification-list">
            {notifications.length ? notifications.map((item) => (
              <Link href={item.href} key={item.id} onClick={() => setOpen(false)}>
                <span className={`notification-icon notification-icon-${item.tone}`}>
                  {item.tone === 'receipt' ? <CurrencyDollar size={15} /> : item.tone === 'follow' ? <Eye size={15} /> : <Scales size={15} />}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                {item.time ? <time>{item.time}</time> : null}
              </Link>
            )) : (
              <div className="notification-empty">
                <strong>No updates yet</strong>
                <small>Follow a case or file one to start receiving updates here.</small>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
