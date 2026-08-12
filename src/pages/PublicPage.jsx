import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import EventList from '../components/EventList'
import ChurchMap from '../components/ChurchMap'

function getEventIdFromUrl() {
  return new URLSearchParams(window.location.search).get('event')
}

export default function PublicPage() {
  // Owned here (not inside ChurchMap) so the header and sidebar can
  // react to it too, via the data-theme attribute below — CSS
  // variables redefined under [data-theme='dark'] cascade to
  // everything in this tree that references them.
  const [theme, setTheme] = useState('light')
  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  // Sidebar is always visible on desktop; on mobile it's a hidden
  // overlay toggled by the hamburger button (see the media query in
  // styles.css — this state only has a visible effect below 860px).
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Events (and which one is selected) live here rather than inside
  // EventList — ChurchMap needs to know the selected event too, so it
  // can fly to its coordinates and drop a pin, and the two components
  // are siblings, not parent/child.
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    document.title = 'Daily Mass Des Moines'
  }, [])

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
        setEventsError(error.message)
      } else {
        setEvents(data)
        // Deep-link support: if the URL already names an event (e.g.
        // someone opened a shared link), open its card as soon as the
        // data needed to show it has actually loaded.
        const sharedId = getEventIdFromUrl()
        if (sharedId) {
          const match = data.find((e) => String(e.id) === sharedId)
          if (match) setSelectedEvent(match)
        }
      }
      setEventsLoading(false)
    }

    loadEvents()
    return () => {
      isMounted = false
    }
  }, [])

  // Keeps the card in sync with the browser's own back/forward
  // buttons — pressing back after opening a card should close it
  // (and forward should reopen it), not leave the URL and the
  // visible card disagreeing with each other.
  useEffect(() => {
    function handlePopState() {
      const id = getEventIdFromUrl()
      const match = id ? events.find((e) => String(e.id) === id) : null
      setSelectedEvent(match ?? null)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [events])

  function handleSelectEvent(event) {
    setSelectedEvent(event)
    window.history.pushState({}, '', `?event=${event.id}`)
  }

  function handleCloseEvent() {
    setSelectedEvent(null)
    window.history.pushState({}, '', window.location.pathname)
  }

  return (
    <div className="app" data-theme={theme}>
      <header className="app__header">
        <div>
          <h1>
            Daily Mass <span className="app__header-accent">Des Moines</span>
          </h1>
          <p>Give us this day our daily bread</p>
        </div>
        <button
          type="button"
          className="hamburger-button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
      </header>

      <main className="app__main">
        <aside
          className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}
          aria-label="Upcoming events"
        >
          <button type="button" className="commute-button">
            Add Daily Mass to your commute
          </button>

          <h2 className="sidebar__heading">Upcoming Events</h2>

          <div className="sidebar__events">
            <EventList
              events={events}
              loading={eventsLoading}
              error={eventsError}
              selectedEvent={selectedEvent}
              onSelectEvent={handleSelectEvent}
              onCloseEvent={handleCloseEvent}
            />
          </div>

          <div className="sidebar__footer">
            <a className="staff-link" href="/admin">
              Staff Login
            </a>
          </div>
        </aside>
        <section className="app__map" aria-label="Parish locations">
          <ChurchMap theme={theme} onToggleTheme={toggleTheme} selectedEvent={selectedEvent} />
        </section>
      </main>
    </div>
  )
}