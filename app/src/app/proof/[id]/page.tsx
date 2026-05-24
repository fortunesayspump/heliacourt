import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowSquareOut } from '@phosphor-icons/react/ssr'
import { AppFooter } from '../../components/layout/AppFooter'
import { AppHeader } from '../../components/layout/AppHeader'
import { getBackendCaseDetail, type ApiCourtArtifact } from '../../../lib/backend-data'
import { backendUrl } from '../../../lib/backend-url'
import '../../page.css'

export const dynamic = 'force-dynamic'

export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [detail, x402Activity] = await Promise.all([
    getBackendCaseDetail(id),
    getX402Activity(id),
  ])
  if (!detail) notFound()

  const courtCase = detail.case
  const receipts = detail.onchainSettlement?.receipts ?? []
  const evidenceCount = detail.artifacts.reduce((total, artifact) => total + (artifact.toolEvidence?.length ?? 0) + (artifact.evidenceItems?.length ?? 0), 0)
  const sourceCount = countUniqueSources(detail.artifacts)
  const recordHash = detail.recordHash ?? detail.onchainSettlement?.recordHash ?? courtCase.receipt
  const hashRows = receipts.filter((receipt) => receipt.recordHash).length

  return (
    <main className="app-shell">
      <AppHeader active="ledger" />
      <section className="workspace proof-workspace">
        <section className="proof-hero panel">
          <div>
            <p className="eyebrow">Public proof</p>
            <h1>{courtCase.title}</h1>
            <p>Transcript, evidence, settlement rows, and Arc hashes gathered into one verification surface.</p>
          </div>
          <Link className="secondary-button compact-back" href={`/cases/${courtCase.id}?tab=receipts`}>
            Back to case
          </Link>
        </section>

        <section className="proof-grid">
          <article>
            <span>Record hash</span>
            <strong>{shortHash(recordHash)}</strong>
          </article>
          <article>
            <span>Receipt rows</span>
            <strong>{receipts.length}</strong>
          </article>
          <article>
            <span>Transcript turns</span>
            <strong>{detail.transcript.length}</strong>
          </article>
          <article>
            <span>Evidence trail</span>
            <strong>{sourceCount + evidenceCount}</strong>
          </article>
          <article>
            <span>x402 paid status</span>
            <strong>{x402Activity.latest ? 'Paid read' : 'Ready'}</strong>
          </article>
          <article>
            <span>Payment transaction id</span>
            <strong>{shortHash(x402Activity.latest?.transactionId)}</strong>
          </article>
          <article>
            <span>Trace hash</span>
            <strong>{shortHash(recordHash ?? receipts[0]?.recordHash)}</strong>
          </article>
          <article>
            <span>Arc tx links</span>
            <strong>{receipts.filter((receipt) => receipt.txHash).length}</strong>
          </article>
        </section>

        <section className="proof-panels">
          <article className="panel proof-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Arc receipts</p>
                <h2>Settlement trail</h2>
              </div>
              <strong>{hashRows}/{receipts.length} hashed</strong>
            </div>
            <div className="proof-receipt-list">
              {receipts.length ? receipts.map((receipt, index) => (
                <a className="proof-row" href={`https://explorer.testnet.arc.network/tx/${receipt.txHash}`} key={`${receipt.type}-${receipt.txHash}-${index}`} target="_blank" rel="noreferrer">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{formatReceiptType(receipt.type)}</strong>
                    <small>{receipt.amountUsdc ? `${receipt.amountUsdc} USDC` : receipt.recordHash ? shortHash(receipt.recordHash) : 'Record'}</small>
                  </div>
                  <code>{shortHash(receipt.txHash)}</code>
                  <ArrowSquareOut size={16} />
                </a>
              )) : (
                <p className="profile-empty-copy">No Arc receipts recorded yet.</p>
              )}
            </div>
          </article>

          <article className="panel proof-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Trace audit</p>
                <h2>What can be checked</h2>
              </div>
            </div>
            <div className="proof-check-grid">
              <div>
                <span>Case context</span>
                <strong>{courtCase.links?.length ?? 0} links</strong>
              </div>
              <div>
                <span>Agent artifacts</span>
                <strong>{detail.artifacts.length}</strong>
              </div>
              <div>
                <span>Evidence sources</span>
                <strong>{sourceCount}</strong>
              </div>
              <div>
                <span>x402 access</span>
                <strong>{x402Activity.totalPaidReads} paid reads</strong>
              </div>
              <div>
                <span>Gateway paid</span>
                <strong>{x402Activity.totalUsdc} USDC</strong>
              </div>
            </div>
            <p className="proof-note">
              Paid agent/API proof calls return the payment transaction id alongside the same case trace, transcript count, receipt list, and record hash shown here.
            </p>
          </article>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}

type X402CaseActivity = {
  totalPaidReads: number
  totalUsdc: string
  latest?: {
    transactionId?: string
  } | null
}

async function getX402Activity(caseId: string): Promise<X402CaseActivity> {
  try {
    const response = await fetch(`${backendUrl}/x402/activity?caseId=${encodeURIComponent(caseId)}`, { cache: 'no-store' })
    if (!response.ok) return { totalPaidReads: 0, totalUsdc: '0', latest: null }
    const payload = await response.json() as Partial<X402CaseActivity>
    return {
      totalPaidReads: Number(payload.totalPaidReads ?? 0),
      totalUsdc: payload.totalUsdc ?? '0',
      latest: payload.latest ?? null,
    }
  } catch {
    return { totalPaidReads: 0, totalUsdc: '0', latest: null }
  }
}

function shortHash(value?: string) {
  if (!value) return 'Pending'
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value
}

function formatReceiptType(value?: string) {
  if (!value) return 'Receipt'
  return value
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function countUniqueSources(artifacts: ApiCourtArtifact[]) {
  const sources = new Set<string>()
  for (const artifact of artifacts) {
    for (const item of artifact.evidenceItems ?? []) {
      if (item.sourceUrl || item.sourceTitle || item.claim) sources.add(item.sourceUrl ?? item.sourceTitle ?? item.claim ?? '')
    }
    for (const evidence of artifact.toolEvidence ?? []) {
      if (evidence.capability || evidence.provider || evidence.query) {
        sources.add(`${evidence.capability ?? 'tool'}:${evidence.provider ?? ''}:${evidence.query ?? ''}`)
      }
      for (const source of evidence.sources ?? []) {
        if (source.url || source.title || source.value) sources.add(source.url ?? source.title ?? source.value ?? '')
      }
    }
  }
  return sources.size
}
