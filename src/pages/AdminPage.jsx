import { useState } from 'react'
import { useSession } from '../hooks/useSession'
import { supabase } from '../supabaseClient'
import LoginForm from '../components/LoginForm'
import EventForm from '../components/EventForm'
import AdminEventList from '../components/AdminEventList'
import ImageManager from '../components/ImageManager'

export default function AdminPage() {
  const session = useSession()
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingEvent, setEditingEvent] = useState(null)
  // Bumped by ImageManager so EventForm's own (separately-fetched)
  // organizations/preview-images dropdowns pick up a newly uploaded
  // image without needing a full page reload.
  const [imagesVersion, setImagesVersion] = useState(0)

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

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Manage events</h1>
          <p>Signed in as {session.user.email}</p>
        </div>
        <div className="admin-page__header-actions">
          <a className="back-link" href="/">
            View site
          </a>
          <button type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="admin-page__content">
        <EventForm
          userId={session.user.id}
          editingEvent={editingEvent}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onCancelEdit={() => setEditingEvent(null)}
          imagesVersion={imagesVersion}
        />
        <AdminEventList refreshKey={refreshKey} onEdit={setEditingEvent} />
        <ImageManager onImagesChanged={() => setImagesVersion((v) => v + 1)} />
      </div>
    </div>
  )
}