import { NextResponse } from 'next/server'
import { getPreviewUserNotifications, type ApiUserAccount } from '../../../../../lib/backend-data'
import { fetchBackendJson } from '../../../../../lib/backend-proxy'

export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params

  try {
    const { response, payload } = await fetchBackendJson(`/users/${encodeURIComponent(wallet)}/notifications`, {
      cache: 'no-store',
      jsonFallback: { error: 'No notification data returned.' },
      unavailableMessage: 'Notification data is unavailable.',
    })
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
  const result = await fetchBackendJson(`/users/${encodeURIComponent(wallet)}`, {
    cache: 'no-store',
    jsonFallback: undefined,
    unavailableMessage: 'Profile data is unavailable.',
  }).catch(() => undefined)
  if (!result?.response.ok) return undefined

  const account = result.payload as ApiUserAccount | undefined
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
