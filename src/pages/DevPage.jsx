import { useSession } from '../hooks/useSession'
import LoginForm from '../components/LoginForm'
import PublicPage from './PublicPage'

// Same login gate as AdminPage (same staff accounts — there's no
// separate "admin" role, just signed-in vs not). Once signed in,
// this renders the exact same PublicPage everyone sees, just with
// previewUnpublished set so the events query also includes events
// that haven't gone live yet. No banner, no extra chrome — the site
// looks and behaves exactly as normal, per the ask.
export default function DevPage() {
  const session = useSession()

  if (session === undefined) {
    return <p className="event-list__status">Loading…</p>
  }

  if (!session) {
    return (
      <div className="admin-page admin-page--centered">
        <LoginForm />
        <a className="back-link" href="/">
          ← Back to events
        </a>
      </div>
    )
  }

  return <PublicPage previewUnpublished />
}