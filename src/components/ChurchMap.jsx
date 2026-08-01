import { useEffect, useRef, useState } from 'react'
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

// Placeholder card shown when a church is selected. Structure and
// behavior (open on select, close button, click-outside) are final —
// the visual design of the card itself is a later pass.
function ChurchCard({ church, onClose }) {
  return (
    <div className="church-card-overlay" onClick={onClose}>
      <div className="church-card-wrap" onClick={(e) => e.stopPropagation()}>
        {church.icon_url && (
          <img className="church-card__photo" src={church.icon_url} alt={church.name} />
        )}
        <div className="church-card">
          <button className="church-card__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <h2>{church.name}</h2>
          {church.address && <p>{church.address}</p>}
        </div>
      </div>
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

  useEffect(() => {
    async function loadChurches() {
      const { data, error } = await supabase.from('churches').select('*')
      if (!error && data) {
        setChurches(data)
      }
    }
    loadChurches()
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
        <ChurchCard church={selectedChurch} onClose={() => setSelectedChurch(null)} />
      )}
    </div>
  )
}