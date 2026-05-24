import Link from 'next/link'
import { notFound } from 'next/navigation'

const pages = {
  'court-engine-architecture': {
    title: 'Court Engine Architecture',
    intro: 'The target shape of Heliaia, the backend-owned engine that turns a market question into a compact evidence plan, argument graph, verdict, and receipt trail.',
    sections: [
      ['Core question', 'Each hearing should clarify resolution criteria, timing, direct evidence, Yes paths, No blockers, market signal quality, and the probability range justified by the evidence.'],
      ['Engine layers', 'Case intake feeds a forecast frame, evidence plan, retrieval layer, evidence ledger, testimony, argument graph, debate controller, calibration judge, and verdict record.'],
      ['Design goal', 'The court format should serve the forecast, not bury it. Agents should cite ledger evidence instead of repeating raw tool dumps.'],
    ],
  },
  'production-intelligence-stack': {
    title: 'Production Intelligence Stack',
    intro: 'The deployment split for the app, backend worker, evidence retrieval, OCR, browser tooling, search providers, and persistent hearing records.',
    sections: [
      ['Product surface', 'Vercel runs the user-facing Next.js app and normal API routes. Railway runs the longer backend worker paths that benefit from warm services and browser tooling.'],
      ['Evidence tools', 'Search, scrape, market adapters, OCR, screenshots, and structured datasets feed the backend evidence ledger before agents argue from it.'],
      ['Operational stance', 'Secrets stay server-side, hearings survive restarts through Postgres, and manual settlement retry requires an admin key.'],
    ],
  },
  readme: {
    title: 'Docs Source Map',
    intro: 'The repo docs remain the working notes for architecture, deployment, and implementation status. This site is the public-facing layer for those notes.',
    sections: [
      ['Current docs', 'The active references are the court engine architecture, production intelligence stack, and backend agent tools.'],
      ['Archive', 'Older MVP, protocol, user-flow, and agent-architecture notes remain in docs/archive as historical context.'],
      ['Assets', 'Reference images and papers live under docs/reference-assets and are not required for the public docs app build.'],
    ],
  },
} as const

type ReferenceSlug = keyof typeof pages

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const entry = pages[slug as ReferenceSlug]
  return {
    title: entry?.title ?? 'Reference',
  }
}

export default async function ReferencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const entry = pages[slug as ReferenceSlug]
  if (!entry) notFound()

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">
          <img src="/assets/helia-temple-mark.svg" alt="" />
          <span>Helia Court Docs</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <a href="https://app.heliacourt.xyz">App</a>
          <a href="https://heliacourt.xyz">Site</a>
        </nav>
      </header>
      <article className="reference-page">
        <Link className="back-link" href="/">Back to docs</Link>
        <div className="markdown">
          <h1>{entry.title}</h1>
          <p>{entry.intro}</p>
          {entry.sections.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}
