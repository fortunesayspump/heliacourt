import { CurrencyCircleDollar, GitBranch, Bank, Wallet } from '@phosphor-icons/react/ssr'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'
import '../page.css'

const ledgerRows = [
  ['0x7A19', 'Oil volatility hearing', 'Witness payouts', '0.11 USDC', 'Anchored'],
  ['0x7A19', 'Oil volatility hearing', 'Court agents', '0.16 USDC', 'Anchored'],
  ['0x7A19', 'Oil volatility hearing', 'Protocol fee', '0.03 USDC', 'Anchored'],
  ['0x31F0', 'ETH/SOL rotation', 'Budget escrow', '0.42 USDC', 'Pending'],
]

export default function LedgerPage() {
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
              <strong>4.80 USDC</strong>
            </div>
          </div>
          <div className="metric">
            <CurrencyCircleDollar size={19} />
            <div>
              <span>Agent payouts</span>
              <strong>8.42 USDC</strong>
            </div>
          </div>
          <div className="metric">
            <Bank size={19} />
            <div>
              <span>Protocol fees</span>
              <strong>0.91 USDC</strong>
            </div>
          </div>
          <div className="metric">
            <GitBranch size={19} />
            <div>
              <span>CCTP transfers</span>
              <strong>3 routes</strong>
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
            {ledgerRows.map(([caseId, title, item, amount, status]) => (
              <article className="case-row" key={`${caseId}-${item}`}>
                <code>{caseId}</code>
                <div>
                  <h3>{title}</h3>
                  <p>{item}</p>
                </div>
                <strong>{amount}</strong>
                <span className="state-dot ready">{status}</span>
              </article>
            ))}
          </div>
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
