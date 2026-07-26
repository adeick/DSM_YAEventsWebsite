import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import EventCard from './EventCard'

export default function EventList() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadEvents() {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })

      if (!isMounted) return

      if (error) {
        setError(error.message)
      } else {
        setEvents(data)
      }
      setLoading(false)
    }

    loadEvents()
    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return <p className="event-list__status">Loading events…</p>
  }

  if (error) {
    return <p className="event-list__status">Couldn't load events: {error}</p>
  }

  if (events.length === 0) {
    return <p className="event-list__status">No upcoming events yet. Check back soon.</p>
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  )
}