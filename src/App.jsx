import EventList from './components/EventList'
import ChurchMap from './components/ChurchMap'

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Diocese of Des Moines</h1>
        <p>Upcoming events across our parishes</p>
      </header>

      <main className="app__main">
        <section className="app__events" aria-label="Upcoming events">
          <EventList />
        </section>
        <section className="app__map" aria-label="Parish locations">
          <ChurchMap />
        </section>
      </main>
    </div>
  )
}