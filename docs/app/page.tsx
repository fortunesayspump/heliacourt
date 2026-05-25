import { DocsFooter, DocsTopbar } from './components/DocsChrome'
import { DocsPageContent, DocsSidebar } from './docs-content'

export default function DocsHome() {
  return (
    <main className="docs-app">
      <DocsTopbar />
      <div className="docs-layout">
        <DocsSidebar currentSlug="overview" />
        <DocsPageContent slug="overview" />
      </div>
      <DocsFooter />
    </main>
  )
}
