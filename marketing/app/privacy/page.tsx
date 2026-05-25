import type { Metadata } from 'next'
import Link from 'next/link'
import { HeaderNav } from '../components/Nav'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Helia Court handles wallet, case, payment, Telegram, API, and usage data.',
}

const sections = [
  {
    title: 'Information We Collect',
    body: [
      'We collect information you provide or generate when using Helia Court, including market URLs, case titles, descriptions, visibility choices, wallet addresses, signatures, funding events, receipts, transcript activity, profile details, and support messages.',
      'When you use Telegram alerts, x402 paid reads, Gateway-funded requests, or API routes, we may process identifiers, request metadata, payment status, case IDs, transaction hashes, timestamps, and delivery status.',
    ],
  },
  {
    title: 'Public Case Records',
    body: [
      'Public cases are designed to be visible. Their market links, evidence, verdicts, receipts, transcript excerpts, wallet-visible payment rows, and source metadata may appear in the app, docs, APIs, proof pages, search indexes, block explorers, or shared links.',
      'Unlisted cases are not meant for general listing but can be accessed by anyone with the link. Private cases are intended to limit full details to verified participant wallets, though onchain payment data may still be public.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'We use information to run case filing, agent hearings, wallet verification, payment records, x402 paid resources, Telegram alerts, security checks, analytics, debugging, abuse prevention, and product improvement.',
      'We may aggregate or de-identify data to understand usage, improve agent quality, publish metrics, and operate the protocol without trying to identify a specific person.',
    ],
  },
  {
    title: 'Sharing and Third Parties',
    body: [
      'We share information with service providers and integrations needed to operate Helia Court, such as hosting, databases, wallet connectors, RPC providers, payment facilitators, market data sources, Telegram, analytics, and security tooling.',
      'Third-party prediction markets, wallets, block explorers, x402 facilitators, Telegram, and Circle-related services handle data under their own policies.',
    ],
  },
  {
    title: 'Retention and Security',
    body: [
      'We keep information for as long as needed to provide the service, maintain audit trails, comply with legal obligations, resolve disputes, improve reliability, and prevent abuse.',
      'We use reasonable technical and organizational measures to protect data, but no internet, blockchain, wallet, or messaging system can be guaranteed completely secure.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can choose not to connect a wallet, avoid filing cases, use unlisted or private visibility where available, disconnect Telegram alerts, or stop using paid API resources.',
      'Depending on where you live, you may have rights to request access, correction, deletion, portability, or objection to certain processing. Some records may be retained where required for security, legal, or audit reasons.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <header className="docs-topbar">
        <HeaderNav />
      </header>

      <article className="legal-shell">
        <p className="section-label">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated May 25, 2026</p>
        <p className="legal-lead">
          This policy explains how Helia Court handles information across the website, app, agent hearings, receipts, Telegram alerts, and APIs.
        </p>

        {sections.map((section) => (
          <section className="legal-section" key={section.title}>
            <h2>{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}

        <section className="legal-section">
          <h2>Contact</h2>
          <p>
            Privacy questions and requests can be sent to <a href="mailto:privacy@heliacourt.xyz">privacy@heliacourt.xyz</a>.
          </p>
        </section>

        <div className="legal-links">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/">Back home</Link>
        </div>
      </article>
    </main>
  )
}
