import { Suspense } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { CaseFilingFlow } from '../../components/CaseFilingFlow'
import { getBackendCaseDetail, getBackendCases } from '../../../lib/backend-data'
import '../../page.css'

export default function NewCasePage(props: {
  searchParams?: Promise<{ parent?: string; kind?: string; market?: string }>
}) {
  return (
    <main className="app-shell">
      <AppHeader active="new-case" />
      <section className="workspace">
        <Suspense fallback={<NewCaseSkeleton />}>
          <NewCaseData {...props} />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

async function NewCaseData({
  searchParams,
}: {
  searchParams?: Promise<{ parent?: string; kind?: string; market?: string }>
}) {
  const query = await searchParams
  const parentCaseId = query?.parent?.trim()
  const filingKind = query?.kind === 'private-fork' ? 'private-fork' : query?.kind === 'fresh-hearing' ? 'fresh-hearing' : 'original'
  const [existingCases, parentCase] = await Promise.all([
    getBackendCases(),
    parentCaseId ? getBackendCaseDetail(parentCaseId).then((detail) => detail?.case) : Promise.resolve(undefined),
  ])

  return (
        <CaseFilingFlow
          parentCase={parentCase}
          filingKind={parentCase ? filingKind : 'original'}
          initialMarketUrl={query?.market}
          existingCases={existingCases.map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            probability: item.probability,
            links: item.links ?? [],
            updated: item.updated,
          }))}
        />
  )
}

function NewCaseSkeleton() {
  return (
    <>
      <section className="case-filing-shell">
        <section className="panel case-filing-main">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Petition desk</p>
              <h2>File a prediction case</h2>
            </div>
          </div>
          <div className="case-box case-form">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="skeleton-form-row" key={index}>
                <span className="skeleton skeleton-line tiny" />
                <span className={`skeleton skeleton-input${index === 1 ? ' tall' : ''}`} />
              </div>
            ))}
          </div>
        </section>
        <aside className="case-filing-side">
          {Array.from({ length: 2 }).map((_, index) => (
            <section className="panel filing-checklist-panel" key={index}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{index === 0 ? 'Readiness' : 'Similarity check'}</p>
                  <h2>{index === 0 ? 'Filing checklist' : 'Existing hearings'}</h2>
                </div>
              </div>
              <div className="filing-checklist">
                {Array.from({ length: 4 }).map((_, itemIndex) => (
                  <div key={itemIndex}>
                    <span className="skeleton skeleton-icon small" />
                    <span className="skeleton skeleton-line short" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </aside>
      </section>
      <section className="panel case-preview-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Case preview</p>
            <h2>Case packet</h2>
          </div>
        </div>
        <div className="case-box preview-summary">
          <span className="skeleton skeleton-line title" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
        </div>
      </section>
    </>
  )
}
