import { useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'

const MARKER_ICON = L.divIcon({
  className: 'geocoder-marker-icon',
  html: '<div class="geocoder-marker__dot"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

// Same CARTO key requirement as ChurchMap's TILE_URLS — see the
// comment there. Reads the same VITE_CARTO_API_KEY env var, so
// setting it once covers both maps.
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY
const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' +
  (CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : '')

// Dragging updates the pin's own position immediately (and clears
// `confirmed` in the parent) — that's what lets an admin correct a
// geocoder result that's close but not quite right, rather than being
// stuck re-searching from scratch.
function DraggableMarker({ position, onMove }) {
  return (
    <Marker
      position={position}
      icon={MARKER_ICON}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng()
          onMove(lat, lng)
        },
      }}
    />
  )
}

// Looks up `address` via Nominatim (OpenStreetMap's free geocoder —
// no API key, but keep this to explicit, admin-initiated lookups
// rather than firing on every keystroke; their usage policy expects
// low-volume, identifiable traffic, not bulk automated queries), then
// shows a small map so the result can be visually confirmed — or
// dragged into place — before it's usable. Calls onConfirm(lat, lng)
// only when the admin explicitly confirms.
//
// `initialResult` (optional {lat, lon, displayName, confirmed?}) skips
// straight to the "found" map-preview state instead of idle — used
// when a LocationSearchInput prediction already supplied precise
// coordinates, so there's no need to re-geocode the address text it
// derived (and Nominatim could well return something less precise
// than the original POI match anyway). `confirmed: true` skips even
// further, straight to the compact confirmed-bar — used when
// populating an edit form for an event whose location was already
// confirmed previously. This only works because the parent remounts
// this component (via `key`) whenever the address changes, so these
// useState initializers re-run fresh each time rather than needing an
// effect to react to a changing prop.
export default function AddressGeocoder({ address, initialResult, onConfirm }) {
  const [status, setStatus] = useState(initialResult ? 'found' : 'idle') // idle | loading | found | error
  const [displayName, setDisplayName] = useState(initialResult?.displayName || '')
  const [position, setPosition] = useState(initialResult ? [initialResult.lat, initialResult.lon] : null) // [lat, lon]
  const [confirmed, setConfirmed] = useState(!!initialResult?.confirmed)

  async function handleLookup() {
    if (!address.trim()) return
    setStatus('loading')
    setConfirmed(false)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
          address
        )}`
      )
      const results = await res.json()
      if (!results.length) {
        setStatus('error')
        return
      }
      const { lat, lon, display_name } = results[0]
      setPosition([Number(lat), Number(lon)])
      setDisplayName(display_name)
      setStatus('found')
    } catch {
      setStatus('error')
    }
  }

  function handleConfirm() {
    if (!position) return
    setConfirmed(true)
    onConfirm(position[0], position[1])
  }

  return (
    <div className="geocoder">
      <button
        type="button"
        className="geocoder__lookup-button"
        onClick={handleLookup}
        disabled={status === 'loading' || !address.trim()}
      >
        {status === 'loading' ? 'Looking up…' : 'Find on map'}
      </button>

      {status === 'error' && (
        <p className="geocoder__status geocoder__status--error">
          Couldn't find that address — double check it and try again.
        </p>
      )}

      {status === 'found' && position && !confirmed && (
        <div className="geocoder__preview">
          <div className="geocoder__map">
            <MapContainer center={position} zoom={16} className="geocoder__map-inner">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url={TILE_URL}
                subdomains="abcd"
              />
              <DraggableMarker
                position={position}
                onMove={(lat, lng) => {
                  setPosition([lat, lng])
                  setConfirmed(false)
                }}
              />
            </MapContainer>
          </div>
          <p className="geocoder__resolved">{displayName}</p>
          <p className="geocoder__hint">Drag the pin if it's not quite right.</p>
          <button type="button" className="geocoder__confirm-button" onClick={handleConfirm}>
            Confirm this location
          </button>
        </div>
      )}

      {/* Collapses the map away once confirmed instead of leaving it
          open — "Change" reopens the same preview (position/displayName
          are still in state) so re-dragging the pin doesn't require a
          fresh lookup. */}
      {confirmed && (
        <div className="geocoder__confirmed-bar">
          <span>✓ Location confirmed — {displayName}</span>
          <button type="button" onClick={() => setConfirmed(false)}>
            Change
          </button>
        </div>
      )}
    </div>
  )
}