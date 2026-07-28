import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminEventList({ refreshKey }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <p className="event-list__status">Loading…</p>

  if (events.length === 0) {
    return <p className="event-list__status">No events yet.</p>
  }

  return (
    <ul className="admin-event-list">
      {events.map((event) => (
        <li key={event.id}>
          <div>
            <strong>{event.title}</strong>
            <span className="admin-event-list__date">
              {new Date(event.event_date).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>
          <button type="button" onClick={() => handleDelete(event.id)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}