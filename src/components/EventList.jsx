import EventCard from './EventCard'
import EventDetailCard from './EventDetailCard'

// Purely presentational now — events, the selected one, and the
// deep-link/URL-sync logic all live in PublicPage, since ChurchMap
// (a sibling of this component, not a parent/child) also needs to
// know which event is selected in order to fly to it on the map.
export default function EventList({
  events,
  loading,
  error,
  selectedEvent,
  onSelectEvent,
  onCloseEvent,
}) {
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
    <>
      <div className="event-list">
        {events.map((event) => (
          <EventCard key={event.id} event={event} onSelect={onSelectEvent} />
        ))}
      </div>
      {selectedEvent && <EventDetailCard event={selectedEvent} onClose={onCloseEvent} />}
    </>
  )
}