import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../supabaseClient'
import { directionsUrl } from '../utils/directions'
import { useClosingAnimation } from '../hooks/useClosingAnimation'
import { DAY_LABELS, DAY_INDEXES, groupMassTimesByChurch } from '../utils/massSchedule'

// Every church gets the same small marker — no photos on the map
// itself anymore, and no clustering. The church's name is shown next
// to it at all times via a permanent Tooltip (see ChurchMarker below).
const MARKER_ICON = L.divIcon({
  className: 'church-marker-icon',
  html: '<div class="church-marker__dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

// Larger, ringed variant for churches matched by a commute search —
// same accent color as the default dot, so it reads as "this one too"
// rather than a different kind of place.
const HIGHLIGHT_MARKER_ICON = L.divIcon({
  className: 'church-marker-icon',
  html: '<div class="church-marker__dot church-marker__dot--highlighted"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

// Preview pins for the commute form's home/work addresses — fixed
// colors (not theme-driven) so they stay visually distinct from the
// church dots (which use --accent) and from each other regardless of
// light/dark mode.
const HOME_MARKER_ICON = L.divIcon({
  className: 'church-marker-icon',
  html: '<div class="commute-pin commute-pin--home">H</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const WORK_MARKER_ICON = L.divIcon({
  className: 'church-marker-icon',
  html: '<div class="commute-pin commute-pin--work">W</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

// Distinct pin shape (rather than a plain dot) for the selected
// event's location — the shape difference alone signals "this is a
// different kind of marker" from the church dots, on top of it only
// ever appearing one at a time for whichever event is currently open.
// Colored via CSS with var(--accent)/var(--card), so it follows the
// light/dark theme the same way everything else on the map does.
const EVENT_MARKER_ICON = L.divIcon({
  className: 'event-marker-icon',
  html: `
    <svg class="event-marker__pin" width="26" height="34" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" />
      <circle class="event-marker__pin-dot" cx="12" cy="12" r="4.5" />
    </svg>
  `,
  iconSize: [26, 34],
  // Anchored at the pin's bottom tip, not its center — that's the
  // point that should actually sit on the coordinate.
  iconAnchor: [13, 34],
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

// Re-fits the map to the commute route whenever a new one comes in —
// takes over from FitToChurches so the whole route (not just whichever
// churches happen to be near it) stays in view.
function FitToRoute({ route }) {
  const map = useMap()

  useEffect(() => {
    if (!route || !route.length) return
    const bounds = L.latLngBounds(route)
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 })
    }
  }, [map, route])

  return null
}

// While the commute form is still being filled in (no route/results
// yet), keeps whichever preview pins exist in view — otherwise a home
// address on the far side of the metro could resolve to a pin that's
// entirely off-screen with no indication anything happened. `active`
// is false once results/route are showing, since FitToRoute takes
// over framing at that point.
function FitToCommutePins({ homeLocation, workLocation, active }) {
  const map = useMap()

  useEffect(() => {
    if (!active) return
    const points = []
    if (homeLocation) points.push([homeLocation.lat, homeLocation.lon])
    if (workLocation) points.push([workLocation.lat, workLocation.lon])
    if (!points.length) return

    if (points.length === 1) {
      map.flyTo(points[0], 14)
    } else {
      const bounds = L.latLngBounds(points)
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [64, 64], maxZoom: 14 })
      }
    }
  }, [map, homeLocation, workLocation, active])

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

// On mobile, opening the hamburger menu shrinks the map container
// itself (see .church-map-shell--compact) rather than just covering
// the bottom half with the sidebar sheet — that's what lets fitBounds
// calls (FitToRoute, FitToCommutePins) center correctly within the
// actually-visible area instead of a taller area half-hidden behind
// the menu. But Leaflet has no way to detect that CSS-driven resize on
// its own — it only remeasures on the browser's own resize event —
// so this forces a remeasure once the resize transition finishes.
// Both a rAF (catches near-instant/no-transition cases) and a timeout
// matching the CSS transition duration (260ms, just past the 250ms
// transition — see .church-map-shell) are used together since a
// single strategy can't reliably cover both.
function InvalidateSizeOnCompactChange({ compact }) {
  const map = useMap()

  useEffect(() => {
    const frame = requestAnimationFrame(() => map.invalidateSize())
    const timeout = setTimeout(() => map.invalidateSize(), 260)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
    }
  }, [map, compact])

  return null
}

// Zoom level to fly to when a church or event is selected.
const SELECTED_ZOOM = 16

// Drives the "zoom in on select, zoom back out on close" behavior.
// Captures the view (center + zoom) that was active right before
// something was selected, and restores exactly that view when the
// selection is cleared — rather than snapping back to a fixed default.
// `target` is generic (any {latitude, longitude} object) rather than
// church-specific, since the map now also flies to a selected event.
function SelectionZoom({ target }) {
  const map = useMap()
  const previousView = useRef(null)

  useEffect(() => {
    if (target) {
      // Only capture "previous view" once per selection — not on
      // every re-render while something stays selected.
      if (!previousView.current) {
        previousView.current = { center: map.getCenter(), zoom: map.getZoom() }
      }
      map.flyTo([target.latitude, target.longitude], SELECTED_ZOOM)
    } else if (previousView.current) {
      map.flyTo(previousView.current.center, previousView.current.zoom)
      previousView.current = null
    }
  }, [target, map])

  return null
}

// A single marker: a small dot plus an always-visible label. Clicking
// either one selects the church.
function ChurchMarker({ church, onSelect, highlighted }) {
  return (
    <Marker
      position={[church.latitude, church.longitude]}
      icon={highlighted ? HIGHLIGHT_MARKER_ICON : MARKER_ICON}
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

  // 180ms matches the animation duration in styles.css — keep the two
  // in sync if either changes.
  const { isClosing, startClosing: handleClose } = useClosingAnimation(onClose, 180)

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
//
// CARTO now requires a (free) API key for these raster tile
// endpoints — requests without one still work, but get a repeated
// "API KEY REQUIRED" watermark stamped across the map (see chat).
// Get a key at https://carto.com/basemaps/apikey and put it in your
// .env file as VITE_CARTO_API_KEY (same pattern as
// VITE_GEOAPIFY_API_KEY below) — no code change needed beyond that.
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY
const CARTO_KEY_PARAM = CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : ''
const TILE_URLS = {
  light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${CARTO_KEY_PARAM}`,
  dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${CARTO_KEY_PARAM}`,
}

// Fallback center used only until churches load and fitBounds takes over.
const DES_MOINES_CENTER = [41.5868, -93.625]

export default function ChurchMap({
  theme,
  onToggleTheme,
  selectedEvent,
  route,
  highlightedChurchIds,
  homeLocation,
  workLocation,
  mapCompact,
}) {
  const [churches, setChurches] = useState([])
  const [selectedChurch, setSelectedChurch] = useState(null)
  const [massTimesByChurch, setMassTimesByChurch] = useState({})
  const [updatedAtLabel, setUpdatedAtLabel] = useState(null)

  // Whichever the map should currently be flying to/showing a pin
  // for. Church selection happens by clicking a marker directly on
  // this map; event selection happens from the sidebar list — a
  // selected church takes priority in the unlikely case both are
  // somehow set at once. Events without geocoded coordinates (e.g.
  // older rows from before the address confirmation step existed)
  // are treated as having no map target rather than flying to
  // undefined/null coordinates.
  const eventHasCoords =
    selectedEvent && typeof selectedEvent.latitude === 'number' && typeof selectedEvent.longitude === 'number'
  const mapSelectionTarget = selectedChurch || (eventHasCoords ? selectedEvent : null)

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

      setMassTimesByChurch(groupMassTimesByChurch(data))
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
    <div className={`church-map-shell${mapCompact ? ' church-map-shell--compact' : ''}`}>
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
        <FitToRoute route={route} />
        <FitToCommutePins
          homeLocation={homeLocation}
          workLocation={workLocation}
          active={!route}
        />
        <InvalidateSizeOnReady />
        <InvalidateSizeOnCompactChange compact={mapCompact} />
        <ScrollToZoom />
        <SelectionZoom target={mapSelectionTarget} />
        {route && (
          <Polyline positions={route} className="commute-route" pathOptions={{ weight: 4 }} />
        )}
        {churches.map((church) => (
          <ChurchMarker
            key={church.id}
            church={church}
            onSelect={setSelectedChurch}
            highlighted={highlightedChurchIds?.includes(church.id)}
          />
        ))}
        {homeLocation && (
          <Marker position={[homeLocation.lat, homeLocation.lon]} icon={HOME_MARKER_ICON} />
        )}
        {workLocation && (
          <Marker position={[workLocation.lat, workLocation.lon]} icon={WORK_MARKER_ICON} />
        )}
        {eventHasCoords && (
          <Marker
            position={[selectedEvent.latitude, selectedEvent.longitude]}
            icon={EVENT_MARKER_ICON}
          />
        )}
      </MapContainer>
      {selectedChurch &&
        createPortal(
          <ChurchCard
            church={selectedChurch}
            onClose={() => setSelectedChurch(null)}
            schedule={massTimesByChurch[selectedChurch.id]}
            updatedAtLabel={updatedAtLabel}
          />,
          document.body
        )}
    </div>
  )
}