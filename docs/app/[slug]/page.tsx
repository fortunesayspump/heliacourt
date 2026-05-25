import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocsFooter, DocsTopbar } from '../components/DocsChrome'
import { DocsPageContent, DocsSidebar, docsPages, docsSlugs, type DocsSlug } from '../docs-content'

export function generateStaticParams() {
  return docsSlugs
    .filter((slug) => slug !== 'overview')
    .map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = docsPages[slug as DocsSlug]
  if (!page) return {}
  return {
    title: page.title,
    description: page.description,
  }
}

export default async function DocsSectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const typedSlug = slug as DocsSlug
  if (!docsPages[typedSlug] || typedSlug === 'overview') notFound()

  return (
    <main className="docs-app">
      <DocsTopbar />
      <div className="docs-layout">
        <DocsSidebar currentSlug={typedSlug} />
        <DocsPageContent slug={typedSlug} />
      </div>
      <DocsFooter />
    </main>
  )
}
