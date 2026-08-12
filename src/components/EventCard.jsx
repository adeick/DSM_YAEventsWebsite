export default function EventCard({ event, onSelect }) {
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
    <article
      className="event-card"
      onClick={() => onSelect?.(event)}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onSelect) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(event)
        }
      }}
    >
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
          {event.location_name || event.address
            ? ` · ${event.location_name || event.address}`
            : ''}
        </p>
      </div>
    </article>
  )
}