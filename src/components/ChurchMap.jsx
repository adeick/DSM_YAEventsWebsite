import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../supabaseClient'

// Fallback pin used only if a church doesn't have a photo set.
const DEFAULT_ICON = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// Marker footprint scales with zoom instead of clustering: small and
// out of each other's way when zoomed out, big enough to see detail
// when zoomed in. Linear interpolation between a floor and a ceiling
// size, clamped to the zoom range below.
const MIN_ZOOM_FOR_SCALE = 10.5
const MAX_ZOOM_FOR_SCALE = 16
const MIN_MARKER_SIZE = 48
const MAX_MARKER_SIZE = 450

function sizeForZoom(zoom) {
  const clamped = Math.min(Math.max(zoom, MIN_ZOOM_FOR_SCALE), MAX_ZOOM_FOR_SCALE)
  const t = (clamped - MIN_ZOOM_FOR_SCALE) / (MAX_ZOOM_FOR_SCALE - MIN_ZOOM_FOR_SCALE)
  return Math.round(MIN_MARKER_SIZE + t * (MAX_MARKER_SIZE - MIN_MARKER_SIZE))
}

// Labels only appear once zoomed in past this point — showing full
// names at low zoom (especially with position offsets pulling churches
// closer together) would just clutter the map.
const LABEL_MIN_ZOOM = 12
const LABEL_EXTRA_HEIGHT = 26

// Manual nudges (in degrees) for specific churches that sit too close
// together at low zoom. Only add entries for churches that actually
// need it — everyone else uses their real coordinates. Keyed by the
// exact `name` value from the churches table.
//
// Rule of thumb at this latitude: 0.01 = ~0.7mi north/south, ~0.5mi
// east/west. Nudge by small amounts (0.002–0.01) and check how it
// looks zoomed out.
const DISPLAY_OFFSETS = {
  'St. Ambrose Cathedral': { lat: -0.006, lng: 0.008 },
  'Basilica of St. John': { lat: 0.004, lng: -0.006 },
}

function clamp01(n) {
  return Math.min(Math.max(n, 0), 1)
}

// Blends from the offset position (at/below MIN_ZOOM_FOR_SCALE) to the
// true coordinates (at/above MAX_ZOOM_FOR_SCALE), using the same zoom
// range as the size scaling above so both animate together.
function positionForZoom(church, zoom) {
  const offset = DISPLAY_OFFSETS[church.name]
  if (!offset) return [church.latitude, church.longitude]

  const t = clamp01((zoom - MIN_ZOOM_FOR_SCALE) / (MAX_ZOOM_FOR_SCALE - MIN_ZOOM_FOR_SCALE))
  return [
    church.latitude + offset.lat * (1 - t),
    church.longitude + offset.lng * (1 - t),
  ]
}

// Church photos are transparent PNG cutouts — size is set on the photo
// wrapper (plain inline style, no specificity fight needed) while the
// img itself stays at width/height:100% via CSS.
function iconFor(church, size) {
  if (!church.icon_url) return DEFAULT_ICON
  return L.divIcon({
    className: 'church-marker-icon',
    html: `<div class="church-marker__photo" style="width:${size}px;height:${size}px;"><img src="${church.icon_url}" alt="${escapeHtml(church.name)}" /></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, Math.round(size * 0.92)],
  })
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

// Re-renders markers at a size matching the zoom level. Triggered by
// zoomanim (fires right as the zoom transition starts, with the target
// zoom already known) rather than zoomend (fires after it finishes) so
// the resize animates alongside the map's own zoom transform instead of
// happening afterward. zoomend is kept as a safety-net correction for
// any zoom changes that skip animation entirely.
function ZoomScaledMarkers({ churches }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  const frameRef = useRef(null)

  // Coalesces however many 'zoom' events fire within a single frame
  // (can be more than one during a fast scroll) into a single state
  // update, instead of re-rendering (and recreating every marker's
  // icon) once per raw event.
  function scheduleZoomUpdate() {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setZoom(map.getZoom())
    })
  }

  useMapEvents({
    zoomanim: (e) => setZoom(e.zoom),
    zoom: scheduleZoomUpdate,
    zoomend: () => setZoom(map.getZoom()),
  })

  const size = sizeForZoom(zoom)
  const showLabel = zoom >= LABEL_MIN_ZOOM

  return (
    <>
      {churches.map((church) => (
        <Marker
          key={church.id}
          position={positionForZoom(church, zoom)}
          icon={iconFor(church, size)}
        >
          <Tooltip
            key={showLabel ? 'label' : 'hover'}
            permanent={showLabel}
            direction="bottom"
            offset={[0, -Math.round(size * 0.28)]}
            opacity={1}
            className="church-marker-tooltip"
            >
            {church.name}
            </Tooltip>
        </Marker>
      ))}
    </>
  )
}

// Fallback center used only until churches load and fitBounds takes over.
const DES_MOINES_CENTER = [41.5868, -93.625]

export default function ChurchMap() {
  const [churches, setChurches] = useState([])

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
    <MapContainer
      center={DES_MOINES_CENTER}
      zoom={11}
      scrollWheelZoom={true}
      zoomSnap={0}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={100}
      className="church-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />
      <FitToChurches churches={churches} />
      <InvalidateSizeOnReady />
      <ZoomScaledMarkers churches={churches} />
    </MapContainer>
  )
}