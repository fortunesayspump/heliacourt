import { AppHeader } from '../components/AppHeader'
import { AppFooter } from '../components/AppFooter'
import { ProfileAccountPanel } from '../components/ProfileAccountPanel'
import '../page.css'

export default function ProfilePage() {
  return (
    <main className="app-shell">
      <AppHeader active="profile" />

      <section className="workspace">
        <section className="compact-page-head">
          <div>
            <p className="eyebrow">Account chamber</p>
            <h1>Profile</h1>
            <p>Wallet identity, filed cases, private access, and agent payouts will live here as account records come online.</p>
          </div>
        </section>

        <ProfileAccountPanel />
      </section>
      <AppFooter />
    </main>
  )
}
