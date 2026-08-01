import { useEffect, useMemo, useRef, useState } from 'react'
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
const MIN_ZOOM_FOR_SCALE = 10
const MAX_ZOOM_FOR_SCALE = 16
const MIN_MARKER_SIZE = 48
const MAX_MARKER_SIZE = 256

function sizeForZoom(zoom) {
  const clamped = Math.min(Math.max(zoom, MIN_ZOOM_FOR_SCALE), MAX_ZOOM_FOR_SCALE)
  const t = (clamped - MIN_ZOOM_FOR_SCALE) / (MAX_ZOOM_FOR_SCALE - MIN_ZOOM_FOR_SCALE)
  return Math.round(MIN_MARKER_SIZE + t * (MAX_MARKER_SIZE - MIN_MARKER_SIZE))
}

// Labels appear once zoomed in past this point — lower this further if
// you want them even sooner, or raise it if it feels cluttered once
// more churches (and position offsets) are added.
const LABEL_MIN_ZOOM = 12

// Manual nudges (in degrees) for specific churches that sit too close
// together at low zoom. Only add entries for churches that actually
// need it — everyone else uses their real coordinates. Keyed by the
// exact `name` value from the churches table.
//
// Rule of thumb at this latitude: 0.01 = ~0.7mi north/south, ~0.5mi
// east/west. Nudge by small amounts (0.002–0.01) and check how it
// looks zoomed out.
const DISPLAY_OFFSETS = {
  // 'St. Ambrose Cathedral': { lat: 0.006, lng: -0.008 },
  // 'Basilica of St. John': { lat: -0.004, lng: 0.006 },
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

// Icons are built ONCE per church at a fixed physical size (never
// recreated as zoom changes) — the visual size you actually see is
// controlled purely by a CSS transform: scale() applied directly to
// the DOM element on every zoom tick. This is the important part:
// recreating a divIcon on every zoom step (the old approach) forces
// Leaflet to tear out and reinsert a DOM node per marker per frame,
// which is real, unavoidable jank. Scaling an existing element via
// CSS transform is GPU-composited and costs almost nothing, which is
// how map products handle this same problem.
//
// transform-origin is set to match iconAnchor's position within the
// box (50% across, 92% down) so scaling happens around the anchor
// point — the "pin tip" stays exactly where Leaflet placed it at any
// scale, instead of the whole box shrinking toward its center.
function iconFor(church) {
  if (!church.icon_url) return DEFAULT_ICON
  return L.divIcon({
    className: 'church-marker-icon',
    html: `<div class="church-marker__photo" style="width:${MAX_MARKER_SIZE}px;height:${MAX_MARKER_SIZE}px;transform-origin:50% 92%;"><img src="${church.icon_url}" alt="${escapeHtml(church.name)}" /></div>`,
    iconSize: [MAX_MARKER_SIZE, MAX_MARKER_SIZE],
    iconAnchor: [MAX_MARKER_SIZE / 2, Math.round(MAX_MARKER_SIZE * 0.92)],
  })
}

// Leaflet's built-in scrollWheelZoom re-triggers its own animated zoom
// transition on nearly every wheel tick, interrupting the previous one
// before it finishes (map._stop() runs at the start of every step).
// That constant self-interruption is what caused the choppiness no
// amount of tuning (debounce time, zoomSnap, transitions) could fix —
// tuning parameters on a handler that fights itself doesn't help.
// This replaces it with a direct, un-animated zoom update per wheel
// event: no competing animation to interrupt, so each step lands
// cleanly instead of visibly hopping.
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

// A single marker. The icon is memoized so its object identity stays
// stable across re-renders (React/Leaflet only recreates the DOM node
// if church.icon_url or church.name actually changes) — the resize
// itself never touches this icon object at all.
function ChurchMarker({ church, zoom, showLabel, registerRef }) {
  const icon = useMemo(
    () => iconFor(church),
    [church.icon_url, church.id, church.name],
  )
  const size = sizeForZoom(zoom)

  return (
    <Marker
      ref={(instance) => registerRef(church.id, instance)}
      position={positionForZoom(church, zoom)}
      icon={icon}
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
  )
}

function ZoomScaledMarkers({ churches }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  const frameRef = useRef(null)
  const markerRefs = useRef(new Map())

  function registerRef(churchId, instance) {
    if (instance) {
      markerRefs.current.set(churchId, instance)
    } else {
      markerRefs.current.delete(churchId)
    }
  }

  // Applies the current zoom's scale directly to each marker's photo
  // element — no React re-render, no icon recreation, just a style
  // mutation the browser can composite on the GPU.
  function applyScale(currentZoom) {
    const scale = sizeForZoom(currentZoom) / MAX_MARKER_SIZE
    markerRefs.current.forEach((marker) => {
      const el = marker.getElement?.()
      const photo = el?.querySelector('.church-marker__photo')
      if (photo) {
        photo.style.transform = `scale(${scale})`
      }
    })
  }

  // Coalesces however many 'zoom' events fire within a single frame
  // (can be more than one during a fast scroll) into one scale update
  // and, separately, one React state update — instead of doing either
  // once per raw event.
  function scheduleZoomUpdate() {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const z = map.getZoom()
      applyScale(z)
      setZoom(z)
    })
  }

  useMapEvents({
    zoomanim: (e) => {
      applyScale(e.zoom)
      setZoom(e.zoom)
    },
    zoom: scheduleZoomUpdate,
    zoomend: () => {
      const z = map.getZoom()
      applyScale(z)
      setZoom(z)
    },
  })

  // Newly created markers (churches load asynchronously from Supabase,
  // so refs appear after mount) start at full size until scaled —
  // apply the current zoom's scale to them immediately.
  useEffect(() => {
    applyScale(map.getZoom())
  }, [churches, map])

  const showLabel = zoom >= LABEL_MIN_ZOOM

  return (
    <>
      {churches.map((church) => (
        <ChurchMarker
          key={church.id}
          church={church}
          zoom={zoom}
          showLabel={showLabel}
          registerRef={registerRef}
        />
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
      scrollWheelZoom={false}
      zoomSnap={0}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={100}
      wheelDebounceTime={250}
      className="church-map"
    >
        <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
        />
        <FitToChurches churches={churches} />
        <InvalidateSizeOnReady />
        <ScrollToZoom />
        <ZoomScaledMarkers churches={churches} />
    </MapContainer>
  )
}