import { CurrencyCircleDollar, GitBranch, Bank, Wallet } from '@phosphor-icons/react/ssr'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'
import { getBackendLedgerRows } from '../../lib/backend-data'
import '../page.css'

export default async function LedgerPage() {
  const ledgerRows = await getBackendLedgerRows()
  const anchored = ledgerRows.filter((row) => row.status === 'Anchored')
  const recorded = ledgerRows.filter((row) => row.status === 'Recorded')
  const pending = ledgerRows.filter((row) => row.status !== 'Anchored' && row.status !== 'Recorded')
  const payouts = ledgerRows.filter((row) => row.receiptType === 'agent-payout')
  const escrowed = ledgerRows
    .filter((row) => row.receiptType === 'case-funding')
    .reduce((total, row) => total + parseAmount(row.amount), 0)
  const paid = payouts.reduce((total, row) => total + parseAmount(row.amount), 0)

  return (
    <main className="app-shell">
      <AppHeader active="ledger" />

      <section className="workspace">
        <PageTitle
          eyebrow="Onchain desk"
          title="Ledger"
          description="USDC budgets, agent payouts, protocol fees, CCTP movement, and Arc decision receipts."
          imageSrc="/assets/71.webp"
        />

        <section className="metrics-grid">
          <div className="metric">
            <Wallet size={19} />
            <div>
              <span>Escrowed budget</span>
              <strong>{escrowed ? `${escrowed.toFixed(2)} USDC` : `${pending.length} pending`}</strong>
            </div>
          </div>
          <div className="metric">
            <CurrencyCircleDollar size={19} />
            <div>
              <span>Agent payouts</span>
              <strong>{paid ? `${paid.toFixed(2)} USDC` : `${payouts.length} rows`}</strong>
            </div>
          </div>
          <div className="metric">
            <Bank size={19} />
            <div>
              <span>Protocol fees</span>
              <strong>Pending</strong>
            </div>
          </div>
          <div className="metric">
            <GitBranch size={19} />
            <div>
              <span>Decision records</span>
              <strong>{anchored.length} anchored · {recorded.length} recorded</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Receipts</p>
              <h2>Settlement activity</h2>
            </div>
          </div>
          <div className="ledger-table">
            {ledgerRows.length ? ledgerRows.map(({ caseId, title, item, amount, status, hash, txHash, receiptType }) => (
              <article className="case-row" key={`${caseId}-${item}-${hash ?? txHash ?? receiptType}`}>
                <code>{hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : caseId}</code>
                <div>
                  <h3>{title}</h3>
                  <p>{item}</p>
                </div>
                <strong>{amount}</strong>
                <span className="state-dot ready">{status}</span>
              </article>
            )) : (
              <article className="case-row">
                <code>--</code>
                <div>
                  <h3>No settlement records yet</h3>
                  <p>Run a backend hearing to create the first verdict receipt.</p>
                </div>
                <strong>Pending</strong>
                <span className="state-dot">Empty</span>
              </article>
            )}
          </div>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}

function parseAmount(value: string) {
  const match = value.match(/^\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}
