import { ArrowRight } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { PageTitle } from '../../components/PageTitle'
import { WalletNotice } from '../../components/WalletNotice'
import { CaseFilingFlow } from '../../components/CaseFilingFlow'
import { getBackendAgents, getBackendCaseDetail, getBackendCases } from '../../../lib/backend-data'
import '../../page.css'

export default async function NewCasePage({
  searchParams,
}: {
  searchParams?: Promise<{ parent?: string; kind?: string }>
}) {
  const query = await searchParams
  const parentCaseId = query?.parent?.trim()
  const filingKind = query?.kind === 'private-fork' ? 'private-fork' : query?.kind === 'fresh-hearing' ? 'fresh-hearing' : 'original'
  const [liveAgents, existingCases, parentCase] = await Promise.all([
    getBackendAgents(),
    getBackendCases(),
    parentCaseId ? getBackendCaseDetail(parentCaseId).then((detail) => detail?.case) : Promise.resolve(undefined),
  ])
  const witnessOptions = liveAgents
    .filter((agent) => agent.enabled && (agent.seat === 'expert-witness' || agent.seat === 'risk-bailiff'))
    .map((agent) => ({
      id: agent.id,
      category: formatAgentCategory(agent.description),
      agent: agent.name,
      detail: formatAgentDetail(agent.description),
      priceUsd: agent.priceUsd,
    }))
  const likelyBench = witnessOptions.slice(0, 5)

  return (
    <main className="app-shell">
      <AppHeader active="new-case" />

      <section className="workspace">
        <PageTitle
          eyebrow="Petition desk"
          title="File a prediction case"
          description="Paste the market question, attach the actual market link, fund escrow on Arc, and let Heliaia seat the right agents."
          imageSrc="/assets/socrates-address-louis-joseph-lebrun-1867-credit-public-domain-wikimedia-commons.jpeg"
          imagePosition="center 42%"
          actions={
            <>
              <Link className="secondary-button" href="/cases">Cancel</Link>
              <a className="primary-button" href="#case-preview">
                Preview case
                <ArrowRight size={16} />
              </a>
            </>
          }
        />

        <WalletNotice
          title="Fund the case budget before the court starts"
          detail="The wallet funds the exact USDC budget you enter. The backend records the case, runs the hearing, and writes settlement receipts after verdict."
          action="Connect and fund"
        />

        <CaseFilingFlow
          parentCase={parentCase}
          filingKind={parentCase ? filingKind : 'original'}
          witnessOptions={witnessOptions}
          likelyBench={likelyBench}
          existingCases={existingCases.map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            probability: item.probability,
            links: item.links ?? [],
            updated: item.updated,
          }))}
        />
      </section>
      <AppFooter />
    </main>
  )
}

function formatAgentCategory(description: string) {
  return description.split('.')[0] || 'Witness'
}

function formatAgentDetail(description: string) {
  const [, detail] = description.split('. ')
  return detail || description
}
