import { ArrowRight } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { AppHeader } from '../../components/AppHeader'
import { AppFooter } from '../../components/AppFooter'
import { PageTitle } from '../../components/PageTitle'
import { WalletNotice } from '../../components/WalletNotice'
import { CaseFilingFlow } from '../../components/CaseFilingFlow'
import { getBackendAgents } from '../../../lib/backend-data'
import '../../page.css'

export default async function NewCasePage() {
  const liveAgents = await getBackendAgents()
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
  const estimatedWitnessSpend = likelyBench.reduce((total, agent) => total + agent.priceUsd, 0)

  return (
    <main className="app-shell">
      <AppHeader active="new-case" />

      <section className="workspace">
        <PageTitle
          eyebrow="Petition desk"
          title="File a prediction case"
          description="Define the market question, choose the hearing depth, set visibility, and let the court seat the right witnesses before budget is reserved."
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
          detail="Standard prediction hearings usually reserve 5-10 USDC so witnesses can be questioned more than once before the verdict."
          action="Connect and fund"
        />

        <CaseFilingFlow
          witnessOptions={witnessOptions}
          likelyBench={likelyBench}
          estimatedWitnessSpend={estimatedWitnessSpend}
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
