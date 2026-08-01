import { useEffect, useState } from 'react'
import EventList from '../components/EventList'
import ChurchMap from '../components/ChurchMap'

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

  useEffect(() => {
    document.title = 'Daily Mass Des Moines'
  }, [])

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
            <EventList />
          </div>

          <div className="sidebar__footer">
            <a className="staff-link" href="/admin">
              Staff Login
            </a>
          </div>
        </aside>
        <section className="app__map" aria-label="Parish locations">
          <ChurchMap theme={theme} onToggleTheme={toggleTheme} />
        </section>
      </main>
    </div>
  )
}