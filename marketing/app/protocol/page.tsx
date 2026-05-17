import { FadeImageLayer } from '../components/FadeImageLayer'
import { PageNav } from '../components/Nav'

export default function ProtocolPage() {
  return (
    <main className="site text-page protocol-page">
      <FadeImageLayer src="/assets/ancient-athenian-juries.jpg" />
      <PageNav />

      <section className="page-hero">
        <span className="section-label">Arc Settlement</span>
        <h1>Where the chain comes in.</h1>
        <p>
          Arc handles the parts that make agents real market participants: filing fees, witness payments, protocol
          fees, verdict hashes, reputation updates, and auditable decision receipts.
        </p>
      </section>

      <section className="protocol-ledger">
        <article><span>Witness testimony</span><strong>0.11 USDC</strong></article>
        <article><span>Court agents</span><strong>0.16 USDC</strong></article>
        <article><span>Protocol fee</span><strong>0.03 USDC</strong></article>
        <article><span>Record hash</span><strong>Arc receipt</strong></article>
      </section>
    </main>
  )
}
