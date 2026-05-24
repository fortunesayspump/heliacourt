'use client'

import { type ReactNode, useRef, useState } from 'react'

export type CaseDetailTabKey = 'transcript' | 'verdict' | 'receipts' | 'history'

type CaseDetailTabsProps = {
  initialTab: CaseDetailTabKey
  panels: Record<CaseDetailTabKey, ReactNode>
  tabs: ReadonlyArray<readonly [CaseDetailTabKey, string]>
}

export function CaseDetailTabs({ initialTab, panels, tabs }: CaseDetailTabsProps) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const shellRef = useRef<HTMLDivElement>(null)

  const switchTab = (tab: CaseDetailTabKey) => {
    setActiveTab(tab)
    window.history.replaceState(null, '', tab === 'transcript' ? window.location.pathname : `${window.location.pathname}?tab=${tab}`)
    requestAnimationFrame(() => {
      shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="case-tab-shell" ref={shellRef}>
      <nav className="case-record-tabs top-record-tabs" aria-label="Case sections">
        {tabs.map(([tab, label]) => (
          <button
            aria-current={activeTab === tab ? 'page' : undefined}
            className={activeTab === tab ? 'active' : undefined}
            key={tab}
            type="button"
            onClick={() => switchTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="case-tab-panels">
        {tabs.map(([tab]) => (
          <div hidden={activeTab !== tab} key={tab}>
            {panels[tab]}
          </div>
        ))}
      </div>
    </div>
  )
}
