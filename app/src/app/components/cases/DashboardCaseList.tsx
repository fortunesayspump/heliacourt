'use client'

import { Stamp } from '@phosphor-icons/react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatConfidence, type ApiCase } from '../../../lib/backend-data'
import { getPredictionMarketLink, MarketLogo } from '../markets/MarketLogo'

type DashboardCaseListProps = {
  cases: ApiCase[]
}

export function DashboardCaseList({ cases }: DashboardCaseListProps) {
  const [showArchived, setShowArchived] = useState(false)
  const archivedCount = cases.filter(isArchivedCaseStatus).length
  const visibleCases = useMemo(
    () => showArchived ? cases : cases.filter((item) => !isArchivedCaseStatus(item)),
    [cases, showArchived],
  )

  return (
    <div className="case-table dashboard-case-list">
      {archivedCount ? (
        <div className="dashboard-case-list-controls">
          <span>{showArchived ? 'Showing every record' : 'Failed/refunded records hidden'}</span>
          <button
            className={`case-archive-toggle${showArchived ? ' active' : ''}`}
            type="button"
            aria-pressed={showArchived}
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? 'Hide failed/refunded' : `Show failed/refunded (${archivedCount})`}
          </button>
        </div>
      ) : null}

      {visibleCases.length ? (
        visibleCases.slice(0, 10).map((item) => {
          const marketLink = getPredictionMarketLink(item.links)

          return (
            <article className={`case-row${isArchivedCaseStatus(item) ? ' archived-case-row' : ''}`} key={item.id}>
              <div className="market-row-image" aria-hidden="true">
                {item.imageUrl ? <img alt="" src={item.imageUrl} /> : <MarketLogo url={marketLink} market={item.market} />}
              </div>
              <div>
                <h3>{item.title}</h3>
                <p className="case-row-market-meta">
                  <MarketLogo url={marketLink} market={item.market} showLabel />
                  <span>{item.horizon ?? 'Open'}</span>
                </p>
              </div>
              <div className="case-row-stats" aria-label="Case status">
                <span className="state-dot active">{item.status}</span>
                <strong>{item.probability ?? formatConfidence(item.confidence)}</strong>
                <strong>{item.witnesses?.length ?? 0} seats</strong>
              </div>
              <Link href={`/cases/${item.id}`} aria-label={`Open ${item.title}`}>
                <Stamp size={17} />
              </Link>
            </article>
          )
        })
      ) : (
        <div className="empty-state">
          <strong>No live cases yet</strong>
          <p>{archivedCount ? `${archivedCount} failed/refunded records are hidden.` : 'File a case to populate the docket.'}</p>
          {archivedCount ? (
            <button className="secondary-button" type="button" onClick={() => setShowArchived(true)}>
              Show hidden records
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function isArchivedCaseStatus(caseItem: ApiCase) {
  return caseItem.status === 'Failed' || caseItem.status === 'Refunded'
}
