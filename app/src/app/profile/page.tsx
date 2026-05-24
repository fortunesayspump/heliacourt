import { Suspense } from 'react'
import { AppHeader } from '../components/layout/AppHeader'
import { AppFooter } from '../components/layout/AppFooter'
import { ProfileAccountPanel } from '../components/profile/ProfileAccountPanel'
import '../page.css'

export default function ProfilePage() {
  return (
    <main className="app-shell">
      <AppHeader active="profile" />

      <section className="workspace">
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileAccountPanel />
        </Suspense>
      </section>
      <AppFooter />
    </main>
  )
}

function ProfileSkeleton() {
  return (
    <>
      <section className="profile-identity-panel panel">
        <span className="skeleton skeleton-icon" />
        <div>
          <span className="skeleton skeleton-line short" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line" />
        </div>
      </section>
      <section className="app-summary-grid profile-stat-grid" aria-label="Profile loading">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="profile-stat-card skeleton-metric" key={index}>
            <span className="skeleton skeleton-line short" />
            <strong className="skeleton skeleton-line" />
          </div>
        ))}
      </section>
      <section className="profile-main-grid">
        <section className="profile-record-stack">
          {Array.from({ length: 3 }).map((_, index) => (
            <article className="panel app-section-panel profile-record-section skeleton-panel" key={index}>
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line short" />
            </article>
          ))}
        </section>
      </section>
    </>
  )
}
