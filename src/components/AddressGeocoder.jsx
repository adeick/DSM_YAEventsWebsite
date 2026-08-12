import { useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'

const MARKER_ICON = L.divIcon({
  className: 'geocoder-marker-icon',
  html: '<div class="geocoder-marker__dot"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

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
export default function AddressGeocoder({ address, onConfirm }) {
  const [status, setStatus] = useState('idle') // idle | loading | found | error
  const [displayName, setDisplayName] = useState('')
  const [position, setPosition] = useState(null) // [lat, lon]
  const [confirmed, setConfirmed] = useState(false)

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

      {status === 'found' && position && (
        <div className="geocoder__preview">
          <div className="geocoder__map">
            <MapContainer center={position} zoom={16} className="geocoder__map-inner">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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
          <button
            type="button"
            className={
              'geocoder__confirm-button' + (confirmed ? ' geocoder__confirm-button--confirmed' : '')
            }
            onClick={handleConfirm}
          >
            {confirmed ? '✓ Location confirmed' : 'Confirm this location'}
          </button>
        </div>
      )}
    </div>
  )
}