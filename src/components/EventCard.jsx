export default function EventCard({ event }) {
  const date = new Date(event.event_date)
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <article className="event-card">
      <div className="event-card__date">
        <span className="event-card__date-day">{date.getDate()}</span>
        <span className="event-card__date-month">
          {date.toLocaleDateString(undefined, { month: 'short' })}
        </span>
      </div>
      <div className="event-card__body">
        <h3 className="event-card__title">{event.title}</h3>
        <p className="event-card__meta">
          {dateLabel} · {timeLabel}
          {event.location ? ` · ${event.location}` : ''}
        </p>
        {event.description && (
          <p className="event-card__description">{event.description}</p>
        )}
      </div>
    </article>
  )
}