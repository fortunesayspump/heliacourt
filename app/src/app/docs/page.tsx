import '../page.css'
import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { PageTitle } from '../components/PageTitle'

const docs = [
  ['File a case', 'Submit a market question and attach a USDC budget for the proceeding.'],
  ['Summon witnesses', 'Prediction, news, and onchain agents return structured testimony.'],
  ['Hear counsel', 'Bull and bear counsel argue competing interpretations of the same evidence.'],
  ['Seal the verdict', 'Dikasts vote, Archon writes the record, and Arc anchors settlement receipts.'],
]

export default function DocsPage() {
  return (
    <main className="app-shell">
      <AppHeader active="docs" />

      <section className="workspace">
        <PageTitle
          eyebrow="Agora Court documentation"
          title="How proceedings work"
          description="The court model for market intelligence: testimony, argument, votes, verdicts, and Arc settlement records."
          imageSrc="/assets/Tashko-Athenian-Democracy-169-e1746471436925.png"
          imagePosition="center 68%"
        />

        <section className="metrics-grid doc-route-grid">
          {docs.map(([title, detail], index) => (
            <article className="metric" key={title}>
              <strong>{String(index + 1).padStart(2, '0')}</strong>
              <div>
                <span>{title}</span>
                <p>{detail}</p>
              </div>
            </article>
          ))}
        </section>
      </section>
      <AppFooter />
    </main>
  )
}
