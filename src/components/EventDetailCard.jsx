import { useState } from 'react'
import { createPortal } from 'react-dom'
import { directionsUrl } from '../utils/directions'
import { useClosingAnimation } from '../hooks/useClosingAnimation'
import { renderFormattedText } from '../utils/renderFormattedText'

// Full-viewport modal (portaled to document.body, position: fixed)
// rather than scoped to the sidebar the way ChurchCard is scoped to
// the map — the sidebar is a narrow column (and on mobile it's a
// sliding, transformed element), neither of which is a good home for
// a two-photo detail card. 180ms matches the CSS animation duration —
// keep in sync if either changes.
export default function EventDetailCard({ event, onClose }) {
  const { isClosing, startClosing: handleClose } = useClosingAnimation(onClose, 180)
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    // EventList already pushes ?event=<id> onto the URL the moment
    // this card opens (including for a shared link that opened it in
    // the first place) — so the current URL is always the right one
    // to copy, no need to reconstruct it separately here.
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can fail (permissions, insecure context,
      // etc.) — the URL is still visible/copyable manually from the
      // address bar either way, so this just fails quietly.
    }
  }

  const date = new Date(event.event_date)
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return createPortal(
    <div
      className={'event-detail-overlay' + (isClosing ? ' event-detail-overlay--closing' : '')}
      onClick={handleClose}
    >
      <div
        className={'event-detail-wrap' + (isClosing ? ' event-detail-wrap--closing' : '')}
        onClick={(e) => e.stopPropagation()}
      >
        {event.location_photo_url && (
          <img
            className="event-detail__photo"
            src={event.location_photo_url}
            alt={event.address}
          />
        )}
        <div className="event-detail">
          <button className="event-detail__close" onClick={handleClose} aria-label="Close">
            &times;
          </button>
          <button
            className="event-detail__share"
            onClick={handleShare}
            aria-label="Copy link to this event"
          >
            {copied ? '✓ Copied' : '🔗 Share'}
          </button>

          <h2 className={event.organizer ? '' : 'event-detail__title--tight'}>{event.title}</h2>

          {event.organizer && (
            <div className="event-detail__organizer">
              {event.organizer_photo_url && (
                <img
                  className="event-detail__organizer-photo"
                  src={event.organizer_photo_url}
                  alt={event.organizer}
                />
              )}
              <span>{event.organizer}</span>
            </div>
          )}

          <a
            className="event-detail__address"
            href={directionsUrl(event.address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              className="event-detail__address-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {event.location_name || event.address}
          </a>

          <p className="event-detail__datetime">
            {dateLabel} · {timeLabel}
          </p>

          {event.description && (
            <p className="event-detail__description">{renderFormattedText(event.description)}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}