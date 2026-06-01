import { redirect } from 'next/navigation'
import { APP_URL } from '../../components/Nav'

export default async function MarketingCasesRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  const { path = [] } = await params
  const suffix = path.length ? `/${path.map(encodeURIComponent).join('/')}` : ''

  redirect(`${APP_URL.replace(/\/$/, '')}/cases${suffix}`)
}
