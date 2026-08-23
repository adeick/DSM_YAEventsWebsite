import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminEventList({ refreshKey, onEdit }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDrafts, setShowDrafts] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })

    if (!error) setEvents(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents, refreshKey])

  async function handleDelete(id) {
    if (!confirm('Delete this event?')) return
    await supabase.from('events').delete().eq('id', id)
    loadEvents()
  }

  async function handleTogglePublish(event) {
    await supabase.from('events').update({ is_published: !event.is_published }).eq('id', event.id)
    loadEvents()
  }

  const drafts = events.filter((event) => !event.is_published)

  // Closes the popup automatically once the last draft is published —
  // otherwise it'd be left open and empty.
  useEffect(() => {
    if (showDrafts && drafts.length === 0) setShowDrafts(false)
  }, [showDrafts, drafts.length])

  if (loading) return <p className="event-list__status">Loading…</p>

  if (events.length === 0) {
    return <p className="event-list__status">No events yet.</p>
  }

  return (
    <>
      <ul className="admin-event-list">
        {events.map((event) => (
          <li key={event.id}>
            <div>
              <strong>{event.title}</strong>
              {!event.is_published && <span className="admin-event-list__draft">Draft</span>}
              {event.organizer && (
                <span className="admin-event-list__organizer"> — {event.organizer}</span>
              )}
              <span className="admin-event-list__date">
                {new Date(event.event_date).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <div className="admin-event-list__actions">
              <button
                type="button"
                className={
                  'admin-event-list__publish-toggle' +
                  (event.is_published
                    ? ' admin-event-list__publish-toggle--unpublish'
                    : ' admin-event-list__publish-toggle--publish')
                }
                onClick={() => handleTogglePublish(event)}
              >
                {event.is_published ? 'Unpublish' : 'Publish'}
              </button>
              <button type="button" className="admin-event-list__edit" onClick={() => onEdit?.(event)}>
                Edit
              </button>
              <button type="button" onClick={() => handleDelete(event.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {drafts.length > 0 && (
        <button
          type="button"
          className="admin-event-list__drafts-toggle"
          onClick={() => setShowDrafts(true)}
        >
          {drafts.length} draft{drafts.length !== 1 ? 's' : ''} — review
        </button>
      )}

      {showDrafts && (
        <div className="drafts-popup-overlay" onClick={() => setShowDrafts(false)}>
          <div className="drafts-popup" onClick={(e) => e.stopPropagation()}>
            <div className="drafts-popup__header">
              <h3>Drafts</h3>
              <button
                type="button"
                className="drafts-popup__close"
                onClick={() => setShowDrafts(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <ul className="drafts-popup__list">
              {drafts.map((event) => (
                <li key={event.id}>
                  <span>{event.title}</span>
                  <button
                    type="button"
                    className="drafts-popup__publish"
                    onClick={() => handleTogglePublish(event)}
                  >
                    Publish
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}