import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../supabaseClient'

// Every church gets the same small marker — no photos on the map
// itself anymore, and no clustering. The church's name is shown next
// to it at all times via a permanent Tooltip (see ChurchMarker below).
const MARKER_ICON = L.divIcon({
  className: 'church-marker-icon',
  html: '<div class="church-marker__dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

// Labels sit directly above the marker by default. Manual pixel
// nudges here shift only the LABEL, never the marker itself — the dot
// always stays at the church's real coordinates. Only add entries for
// churches whose labels actually collide with a neighbor.
// [x, y] in pixels, added on top of the base offset below; negative x
// is left, negative y is further up.
const BASE_LABEL_OFFSET = [0, -5]

const LABEL_OFFSETS = {
  'St. Theresa': [-30, 45],
  'St. Catherine of Siena': [-55, 0],
  'Basilica of St. John': [70, 22],
}

function labelOffset(church) {
  const nudge = LABEL_OFFSETS[church.name]
  if (!nudge) return BASE_LABEL_OFFSET
  return [BASE_LABEL_OFFSET[0] + nudge[0], BASE_LABEL_OFFSET[1] + nudge[1]]
}

// Leaflet's built-in scrollWheelZoom re-triggers its own animated zoom
// transition on nearly every wheel tick, interrupting the previous one
// before it finishes (map._stop() runs at the start of every step).
// That constant self-interruption is what caused choppiness no amount
// of tuning (debounce time, zoomSnap, transitions) could fix — tuning
// parameters on a handler that fights itself doesn't help. This
// replaces it with a direct, un-animated zoom update per wheel event:
// no competing animation to interrupt, so each step lands cleanly
// instead of visibly hopping.
const ZOOM_SENSITIVITY = 0.015
const MAX_WHEEL_DELTA = 40

function ScrollToZoom() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()

    function handleWheel(e) {
      e.preventDefault()

      const rect = container.getBoundingClientRect()
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top)
      const clampedDelta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, e.deltaY))
      const newZoom = map.getZoom() - clampedDelta * ZOOM_SENSITIVITY
      map.setZoomAround(point, newZoom, { animate: false })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [map])

  return null
}

// Fits the map to wherever the churches actually are, once they load.
function FitToChurches({ churches }) {
  const map = useMap()

  useEffect(() => {
    if (!churches.length) return
    const bounds = L.latLngBounds(churches.map((c) => [c.latitude, c.longitude]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 })
    }
  }, [map, churches])

  return null
}

// Leaflet measures its container's size once, at mount. If the
// surrounding CSS grid hasn't finished laying out yet — or web fonts
// are still loading and about to shift things — that initial
// measurement can be wrong, and Leaflet has no way to know to recheck
// on its own (it only reacts to the browser's own resize event, which
// is why opening dev tools "fixes" it: that resizes the viewport).
// This forces a remeasure right after mount and again once fonts
// settle, instead of relying on a coincidental resize.
function InvalidateSizeOnReady() {
  const map = useMap()

  useEffect(() => {
    const frame = requestAnimationFrame(() => map.invalidateSize())

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => map.invalidateSize())
    }

    return () => cancelAnimationFrame(frame)
  }, [map])

  return null
}

// Zoom level to fly to when a church is selected.
const SELECTED_ZOOM = 16

// Drives the "zoom in on select, zoom back out on close" behavior.
// Captures the view (center + zoom) that was active right before a
// church was selected, and restores exactly that view when the
// selection is cleared — rather than snapping back to a fixed default.
function SelectionZoom({ selectedChurch }) {
  const map = useMap()
  const previousView = useRef(null)

  useEffect(() => {
    if (selectedChurch) {
      // Only capture "previous view" once per selection — not on
      // every re-render while a church stays selected.
      if (!previousView.current) {
        previousView.current = { center: map.getCenter(), zoom: map.getZoom() }
      }
      map.flyTo([selectedChurch.latitude, selectedChurch.longitude], SELECTED_ZOOM)
    } else if (previousView.current) {
      map.flyTo(previousView.current.center, previousView.current.zoom)
      previousView.current = null
    }
  }, [selectedChurch, map])

  return null
}

// A single marker: a small dot plus an always-visible label. Clicking
// either one selects the church.
function ChurchMarker({ church, onSelect }) {
  return (
    <Marker
      position={[church.latitude, church.longitude]}
      icon={MARKER_ICON}
      eventHandlers={{ click: () => onSelect(church) }}
    >
      <Tooltip
        permanent
        interactive
        direction="top"
        offset={labelOffset(church)}
        opacity={1}
        className="church-marker-tooltip"
        eventHandlers={{ click: () => onSelect(church) }}
      >
        {church.name}
      </Tooltip>
    </Marker>
  )
}

// Order matches DAY_LABELS' indices to whatever day_of_week convention
// the mass_times table ends up using (0 = Sunday, matching JS
// Date.getDay()) — see the architecture discussion in chat.
// Displayed Monday-first with Sunday at the bottom. DAY_INDEXES maps
// each position here to its actual day_of_week value in the database
// (0 = Sunday, matching JS's Date.getDay()) — the display order and
// the storage order are intentionally different.
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_INDEXES = [1, 2, 3, 4, 5, 6, 0]

// iPadOS reports navigator.platform as 'MacIntel' just like a real Mac
// — maxTouchPoints is what actually distinguishes the two, since a
// Mac (even one with a touchscreen-less trackpad) reports 0.
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

// Apple Maps only makes sense to hand someone already on an iOS
// device — everyone else (desktop of any OS, Android) gets Google
// Maps, which opens its native app on Android automatically and falls
// back to the website everywhere else.
function directionsUrl(address) {
  const query = encodeURIComponent(address)
  return isIOSDevice()
    ? `https://maps.apple.com/?daddr=${query}`
    : `https://www.google.com/maps/dir/?api=1&destination=${query}`
}

// mass_times.time is stored as already-formatted text (e.g. "2:30 PM"),
// so nothing needs reformatting for display — but plain string sorting
// breaks across AM/PM ("9:00 AM" would sort after "10:00 AM", and PM
// times wouldn't sort after AM at all). This only extracts a
// minutes-since-midnight value to sort by; the original text is what
// actually gets shown.
function parseTimeToMinutes(timeStr) {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i)
  if (!match) return null
  const [, hoursStr, minutesStr, period] = match
  let hours = Number(hoursStr) % 12
  if (period.toUpperCase() === 'PM') hours += 12
  return hours * 60 + Number(minutesStr)
}

// "2026-01-15" -> "January 2026". Parses year/month manually rather
// than via `new Date(dateStr)` — that parses date-only strings as UTC
// midnight, which can roll back a day (and, on the 1st of a month,
// the displayed month) once converted to a timezone west of UTC.
// Since only month/year is ever shown, the day is irrelevant and this
// sidesteps the bug entirely.
function formatMonthYear(dateStr) {
  if (!dateStr) return null
  const [year, month] = dateStr.split('-').map(Number)
  if (!year || !month) return null
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

// Placeholder card shown when a church is selected. Structure and
// behavior (open on select, close button, click-outside) are final —
// the visual design of the card itself is a later pass. `schedule` is
// keyed by day_of_week (0 = Sunday, matching DAY_LABELS and JS's
// Date.getDay()) to an array of already-formatted time strings.
function ChurchCard({ church, onClose, schedule, updatedAtLabel }) {
  // The open note's id/text plus the viewport position to render its
  // popover at, computed from the triggering element at the moment
  // it opens. Visibility is driven entirely by this state now (click
  // toggles it, hover sets/clears it via JS) rather than CSS :hover —
  // touch devices apply :hover on tap and don't reliably clear it on
  // a second tap, which was preventing the popover from closing.
  const [openNote, setOpenNote] = useState(null)

  function toggleNote(entry, wrapEl) {
    if (!entry.notes) return
    setOpenNote((current) => {
      if (current?.id === entry.id) return null
      const rect = wrapEl.getBoundingClientRect()
      // Viewport coordinates, since the popover is portaled to
      // document.body — position is independent of any scrolled
      // ancestor, including the card's own overflow-y: auto.
      return { id: entry.id, text: entry.notes, top: rect.top, left: rect.left + rect.width / 2 }
    })
  }

  // Closes the popover on a click anywhere outside a chip. Only
  // attached while one is actually open, and uses mousedown (fires
  // before the chip's own onClick) so clicking a different chip still
  // switches which note is open rather than fighting this handler.
  useEffect(() => {
    if (!openNote) return

    function handleOutsideClick(e) {
      if (!e.target.closest('.church-card__time-chip-wrap')) {
        setOpenNote(null)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [openNote])

  // The exit animation needs a moment to actually play before the
  // component unmounts — React removes it from the DOM the instant
  // `selectedChurch` clears in the parent, with no way to wait for a
  // CSS animation to finish first. So closing goes through a brief
  // local "closing" state (triggers the CSS fall-out animation below)
  // before calling the real onClose. 180ms matches the animation
  // duration in styles.css — keep the two in sync if either changes.
  const [isClosing, setIsClosing] = useState(false)

  function handleClose() {
    setIsClosing(true)
  }

  useEffect(() => {
    if (!isClosing) return
    const timer = setTimeout(onClose, 180)
    return () => clearTimeout(timer)
  }, [isClosing, onClose])

  return (
    <div
      className={'church-card-overlay' + (isClosing ? ' church-card-overlay--closing' : '')}
      onClick={handleClose}
    >
      <div
        className={'church-card-wrap' + (isClosing ? ' church-card-wrap--closing' : '')}
        onClick={(e) => e.stopPropagation()}
      >
        {church.icon_url && (
          <img className="church-card__photo" src={church.icon_url} alt={church.name} />
        )}
        <div className="church-card">
          <button className="church-card__close" onClick={handleClose} aria-label="Close">
            &times;
          </button>
          <h2>{church.name}</h2>
          {church.address && (
            <a
              className="church-card__address"
              href={directionsUrl(church.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {church.address}
            </a>
          )}
          {church.website_url && (
            <a
              className="church-card__website"
              href={church.website_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit website
            </a>
          )}

          <div className="church-card__schedule">
            {DAY_LABELS.map((day, position) => {
              const times = schedule?.[DAY_INDEXES[position]]
              return (
                <div className="church-card__day-row" key={day}>
                  <span className="church-card__day-label">{day}</span>
                  <span className="church-card__day-times">
                    {times && times.length
                      ? times.map((entry) => (
                          <span
                            className="church-card__time-chip-wrap"
                            key={entry.id}
                            onMouseEnter={(e) => {
                              if (!entry.notes) return
                              const rect = e.currentTarget.getBoundingClientRect()
                              setOpenNote({
                                id: entry.id,
                                text: entry.notes,
                                top: rect.top,
                                left: rect.left + rect.width / 2,
                              })
                            }}
                            onMouseLeave={() =>
                              setOpenNote((current) => (current?.id === entry.id ? null : current))
                            }
                            onClick={(e) => toggleNote(entry, e.currentTarget)}
                          >
                            <button
                              type="button"
                              className={
                                'church-card__time-chip' +
                                (entry.sundayObligation
                                  ? ' church-card__time-chip--accent'
                                  : '')
                              }
                            >
                              {entry.text}
                              {entry.notes ? '*' : ''}
                            </button>
                          </span>
                        ))
                      : '—'}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="church-card__footer">
            Updated {updatedAtLabel || '—'} from{' '}
            <a
              href="https://masstimes.org/map?lat=41.589&lng=-93.62&SearchQueryTerm=Des%20Moines,%20Iowa"
              target="_blank"
              rel="noopener noreferrer"
            >
              MassTimes.org
            </a>
          </div>
        </div>
      </div>
      {openNote &&
        createPortal(
          <div
            role="tooltip"
            className="church-card__time-note"
            style={{ top: openNote.top, left: openNote.left }}
          >
            {openNote.text}
          </div>,
          document.body
        )}
    </div>
  )
}

// The two CARTO basemaps this toggle switches between. Add more
// entries here (and a corresponding button state) if you want to
// offer a third option later, e.g. Voyager.
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

// Fallback center used only until churches load and fitBounds takes over.
const DES_MOINES_CENTER = [41.5868, -93.625]

export default function ChurchMap({ theme, onToggleTheme }) {
  const [churches, setChurches] = useState([])
  const [selectedChurch, setSelectedChurch] = useState(null)
  const [massTimesByChurch, setMassTimesByChurch] = useState({})
  const [updatedAtLabel, setUpdatedAtLabel] = useState(null)

  useEffect(() => {
    async function loadChurches() {
      // Rows with incomplete data are flagged ignore=true rather than
      // deleted — excluded here so they never reach the map. Also
      // matches null just in case any older rows predate the column
      // and were never explicitly set to false.
      const { data, error } = await supabase
        .from('churches')
        .select('*')
        .or('ignore.eq.false,ignore.is.null')
      if (!error && data) {
        setChurches(data)

        // Kick off a background download for every church photo now,
        // while the map is idle, instead of only starting the request
        // once a card is actually opened. This doesn't reduce how much
        // ever gets downloaded — the real fix for that is serving
        // properly-sized images in the first place (see chat) — it just
        // moves the wait earlier so it's (ideally) already done by the
        // time someone clicks a marker. The Image object is discarded;
        // its only job is to trigger the browser's own cache.
        for (const church of data) {
          if (church.icon_url) {
            new Image().src = church.icon_url
          }
        }
      }
    }
    loadChurches()
  }, [])

  useEffect(() => {
    // Small enough dataset (diocese-scale) to fetch everything once
    // and group client-side, rather than re-querying per selection.
    async function loadMassTimes() {
      const { data, error } = await supabase
        .from('mass_times')
        .select('id, church_id, day_of_week, time, notes, sunday_obligation')
      if (error || !data) return

      const grouped = {}
      for (const row of data) {
        grouped[row.church_id] ??= {}
        grouped[row.church_id][row.day_of_week] ??= []
        grouped[row.church_id][row.day_of_week].push({
          id: row.id,
          text: row.time,
          notes: row.notes,
          sundayObligation: row.sunday_obligation,
        })
      }
      // Sort chronologically within each day using the parsed minutes
      // value — the stored text itself is already display-ready, so it's
      // shown as-is rather than reformatted.
      for (const churchTimes of Object.values(grouped)) {
        for (const day of Object.keys(churchTimes)) {
          churchTimes[day].sort(
            (a, b) => (parseTimeToMinutes(a.text) ?? 0) - (parseTimeToMinutes(b.text) ?? 0)
          )
        }
      }
      setMassTimesByChurch(grouped)
    }
    loadMassTimes()
  }, [])

  useEffect(() => {
    // Site-wide, not per-church — one row your scraper script upserts
    // after each run (see the chat discussion for the table shape).
    async function loadUpdatedAt() {
      const { data, error } = await supabase
        .from('site_metadata')
        .select('value')
        .eq('key', 'mass_times_updated_at')
        .single()
      if (!error && data) {
        setUpdatedAtLabel(formatMonthYear(data.value))
      }
    }
    loadUpdatedAt()
  }, [])

  return (
    // No data-theme here — the outer .app element in PublicPage
    // already carries it, and [data-theme='dark'] selectors in
    // styles.css match on any ancestor, so this stays in sync with
    // the header/sidebar for free.
    <div className="church-map-shell">
      <button type="button" className="church-theme-toggle" onClick={onToggleTheme}>
        {theme === 'light' ? 'Dark map' : 'Light map'}
      </button>
      <MapContainer
        center={DES_MOINES_CENTER}
        zoom={11}
        scrollWheelZoom={false}
        zoomSnap={0}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={100}
        wheelDebounceTime={250}
        className="church-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={TILE_URLS[theme]}
          subdomains="abcd"
        />
        <FitToChurches churches={churches} />
        <InvalidateSizeOnReady />
        <ScrollToZoom />
        <SelectionZoom selectedChurch={selectedChurch} />
        {churches.map((church) => (
          <ChurchMarker key={church.id} church={church} onSelect={setSelectedChurch} />
        ))}
      </MapContainer>
      {selectedChurch && (
        <ChurchCard
          church={selectedChurch}
          onClose={() => setSelectedChurch(null)}
          schedule={massTimesByChurch[selectedChurch.id]}
          updatedAtLabel={updatedAtLabel}
        />
      )}
    </div>
  )
}