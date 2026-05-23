import { NextResponse } from 'next/server'
import { getBackendCases, getPreviewUserAccount, type ApiUserAccount } from '../../../../lib/backend-data'

const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params

  try {
    const response = await fetch(`${backendUrl}/users/${encodeURIComponent(wallet)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({ error: 'No profile data returned.' }))
    const preview = getPreviewUserAccount(wallet)

    if (!response.ok) {
      return preview ? NextResponse.json(await hydrateAccountImages(preview)) : NextResponse.json(payload, { status: response.status })
    }

    if (preview && isEmptyAccount(payload)) return NextResponse.json(await hydrateAccountImages(preview))

    return NextResponse.json(await hydrateAccountImages(payload as ApiUserAccount), { status: response.status })
  } catch (error) {
    const preview = getPreviewUserAccount(wallet)
    if (preview) return NextResponse.json(await hydrateAccountImages(preview))

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Profile data is unavailable.',
    }, { status: 502 })
  }
}

async function hydrateAccountImages(account: ApiUserAccount) {
  const cases = await getBackendCases()
  const casesById = new Map(cases.map((item) => [item.id, item]))

  return {
    ...account,
    cases: account.cases.map((item) => hydrateAccountCase(item, casesById)),
    participation: account.participation.map((item) => hydrateAccountCase(item, casesById)),
    follows: account.follows.map((item) => hydrateAccountCase(item, casesById)),
  }
}

function hydrateAccountCase<T extends { id: string; imageUrl?: string }>(item: T, casesById: Map<string, { imageUrl?: string }>) {
  if (item.imageUrl) return item
  const imageUrl = casesById.get(item.id)?.imageUrl
  return imageUrl ? { ...item, imageUrl } : item
}

function isEmptyAccount(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('profile' in payload)) return false
  const account = payload as {
    cases?: unknown[]
    participation?: unknown[]
    follows?: unknown[]
    payouts?: unknown[]
  }

  return [account.cases, account.participation, account.follows, account.payouts]
    .every((value) => Array.isArray(value) && value.length === 0)
}

export async function PUT(request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params
  const body = await request.json().catch(() => ({}))

  try {
    const response = await fetch(`${backendUrl}/users/${encodeURIComponent(wallet)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({ error: 'No profile data returned.' }))

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Profile data is unavailable.',
    }, { status: 502 })
  }
}
