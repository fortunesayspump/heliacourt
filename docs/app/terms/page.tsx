import type { Metadata } from 'next'
import { DocsFooter, DocsTopbar } from '../components/DocsChrome'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms for using Helia Court documentation, app surfaces, agent hearings, and Arc testnet receipts.',
}

const sections = [
  ['Use of Helia Court', 'Helia Court provides market-intelligence software that turns prediction-market links into agent-generated evidence, arguments, verdicts, and receipt records. Helia Court is not a broker, exchange, bookmaker, investment adviser, legal adviser, or market operator.', 'Verdicts, probabilities, transcripts, source notes, and receipts are informational outputs and are not financial, legal, tax, or investment advice.'],
  ['Eligibility and Wallets', 'You may use Helia Court only if you can lawfully do so. You are responsible for your wallet, signatures, private keys, transaction review, taxes, and compliance with laws that apply to you.', 'Wallet actions may involve Arc testnet USDC, case escrow records, Gateway balances, x402 payments, or other onchain interactions. Transactions may be irreversible once submitted.'],
  ['Cases and Visibility', 'Public cases may be listed, indexed, viewed, and served through public or paid API routes. Unlisted cases are available to people with the direct link. Private cases are intended to require participant wallet verification before full details are returned.', 'Do not submit confidential, illegal, infringing, deceptive, or unsafe content. We may remove, restrict, or refuse cases that create legal, security, operational, or abuse risk.'],
  ['Payments and Third Parties', 'Supported market links, wallet providers, Telegram, Circle Gateway, x402 facilitators, block explorers, RPC providers, and other integrations are third-party services. Their own terms and privacy policies apply.', 'Fees, budgets, and paid reads may change. Testnet assets may have no real-world value and may be reset, lost, or become unavailable.'],
  ['Availability and Disclaimers', 'Helia Court is provided as is and as available. We do not promise uninterrupted access, perfect data, profitable outcomes, complete source coverage, or error-free agent reasoning.', 'To the maximum extent permitted by law, Helia Court will not be liable for indirect, incidental, special, consequential, exemplary, or lost-profit damages arising from your use of the service.'],
  ['Changes', 'We may update these terms as the product, protocol, and integrations evolve. Continued use after changes means you accept the updated terms.'],
] as const

export default function TermsPage() {
  return (
    <main className="docs-app">
      <DocsTopbar />

      <article className="legal-doc">
        <p className="eyebrow">Legal</p>
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated May 25, 2026</p>
        <p className="lead">These terms govern your use of Helia Court websites, app surfaces, agent-generated market hearings, receipts, and related APIs.</p>
        {sections.map(([title, ...paragraphs]) => (
          <section className="doc-section" key={title}>
            <h2>{title}</h2>
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <section className="doc-section">
          <h2>Contact</h2>
          <p>
            Questions about these terms can be sent to <a className="text-link" href="mailto:legal@heliacourt.xyz">legal@heliacourt.xyz</a>.
          </p>
        </section>
        <div className="legal-link-row">
          <a href="/privacy">Privacy Policy</a>
          <a href="/">Docs home</a>
        </div>
      </article>
      <DocsFooter />
    </main>
  )
}
