import { NextResponse } from 'next/server'
import { getPreviewUserNotifications, type ApiUserAccount } from '../../../../../lib/backend-data'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params

  try {
    const response = await fetch(`${backendUrl}/users/${encodeURIComponent(wallet)}/notifications`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ error: 'No notification data returned.' }))
    const preview = getPreviewUserNotifications(wallet)

    if (!response.ok) {
      const fallback = await getNotificationsFromAccount(wallet)
      if (fallback) return NextResponse.json(fallback)
      return preview ? NextResponse.json(preview) : NextResponse.json(payload, { status: response.status })
    }

    if (preview && (!Array.isArray(payload.notifications) || payload.notifications.length === 0)) return NextResponse.json(preview)

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    const preview = getPreviewUserNotifications(wallet)
    if (preview) return NextResponse.json(preview)

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Notification data is unavailable.',
    }, { status: 502 })
  }
}

async function getNotificationsFromAccount(wallet: string) {
  const response = await fetch(`${backendUrl}/users/${encodeURIComponent(wallet)}`, { cache: 'no-store' }).catch(() => undefined)
  if (!response?.ok) return undefined

  const account = await response.json().catch(() => undefined) as ApiUserAccount | undefined
  if (!account?.profile) return undefined

  const notifications = [
    ...(account.payouts ?? []).map((row) => ({
      id: `payout:${row.txHash}`,
      kind: 'receipt' as const,
      href: `/cases/${row.caseId}?tab=receipts`,
      title: 'Receipt recorded',
      detail: row.amountUsdc ? `${row.amountUsdc} USDC agent payout` : 'Agent payout recorded',
      createdAt: row.createdAt,
    })),
    ...(account.participation ?? []).map((item) => ({
      id: `case:${item.id}:${item.role}`,
      kind: item.role === 'filer' ? 'case' as const : 'follow' as const,
      href: `/cases/${item.id}`,
      title: item.title,
      detail: item.role === 'filer' ? 'Filed case updated' : `${item.role} participation updated`,
      createdAt: item.updated,
    })),
    ...(account.follows ?? []).map((item) => ({
      id: `follow:${item.id}`,
      kind: 'follow' as const,
      href: `/cases/${item.id}`,
      title: item.title,
      detail: 'Followed case updated',
      createdAt: item.updated,
    })),
  ]
    .sort((left, right) => Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? ''))
    .slice(0, 12)

  return { wallet, notifications }
}
