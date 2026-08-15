// Geocoding (Nominatim) + driving directions/travel-time lookups
// (OSRM's free public instance — no API key), used to find churches
// near someone's home-to-work commute.
//
// This is separate from AddressGeocoder.jsx, which is the admin's
// map-based lookup-then-drag-to-confirm flow for a single address;
// this is a one-shot lookup with no map/confirm step of its own.

// Number of matched churches shown, regardless of how far they end up
// adding to the trip — always just "the best N," no fixed cutoff.
export const MAX_RESULTS = 6

// Nominatim has no "45-minute drive" concept, so this approximates it
// as a fixed-radius box around Des Moines at a typical highway speed
// (45 min @ ~55mph ≈ 40mi) — close enough to keep geocoding/predictions
// from matching a same-named street in another state, without needing
// a real isochrone/routing API just for input validation.
const DES_MOINES_CENTER = { lat: 41.5868, lon: -93.625 }
const SEARCH_RADIUS_MILES = 40
const MILES_PER_DEGREE_LAT = 69
const MILES_PER_DEGREE_LON = 69 * Math.cos((DES_MOINES_CENTER.lat * Math.PI) / 180)

function searchViewbox() {
  const dLat = SEARCH_RADIUS_MILES / MILES_PER_DEGREE_LAT
  const dLon = SEARCH_RADIUS_MILES / MILES_PER_DEGREE_LON
  const left = DES_MOINES_CENTER.lon - dLon
  const right = DES_MOINES_CENTER.lon + dLon
  const top = DES_MOINES_CENTER.lat + dLat
  const bottom = DES_MOINES_CENTER.lat - dLat
  return `${left},${top},${right},${bottom}`
}

// Nominatim (OpenStreetMap's free geocoder, no API key). `bounded=1`
// with the Des Moines-area viewbox means results outside that box are
// excluded entirely, rather than just deprioritized — that's what
// keeps a same-named street in another state from ever matching.
async function searchNominatim(query, limit) {
  const params = new URLSearchParams({
    format: 'json',
    limit: String(limit),
    q: query,
    viewbox: searchViewbox(),
    bounded: '1',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`)
  const results = await res.json()
  return results.map((r) => ({
    lat: Number(r.lat),
    lon: Number(r.lon),
    displayName: r.display_name,
  }))
}

// Up to `limit` candidate matches for `query`, for populating an
// autocomplete dropdown as the person types. Callers should debounce —
// this fires one request per call with no debouncing of its own.
export async function searchAddresses(query, limit = 5) {
  if (!query.trim()) return []
  return searchNominatim(query, limit)
}

// Single best match for `address`, or null if nothing in the Des
// Moines area matched. Used as a fallback when a typed address was
// never explicitly confirmed via a prediction (e.g. blurring the
// field, or submitting without picking a suggestion).
export async function geocodeAddress(address) {
  if (!address.trim()) return null
  const [best] = await searchNominatim(address, 1)
  return best ?? null
}

// OSRM's free public routing instance (no API key, driving profile
// only). Returns { coordinates, durationSeconds } for the route
// between the two points, or null if none could be found.
// `coordinates` is an array of [lat, lon] points (flipped from
// GeoJSON's [lon, lat] to match Leaflet/the rest of this app) for
// drawing the route on the map.
export async function fetchDrivingRoute(from, to) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`
  )
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) return null
  const route = data.routes[0]
  return {
    coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    durationSeconds: route.duration,
  }
}

// OSRM's Table service: drive times from every point in `origins` to
// every point in `destinations`, in a single request — used instead of
// one /route call per church, which would mean N+ requests for N
// churches. Returns a 2D array `durations[i][j]` = seconds from
// origins[i] to destinations[j] (null where no route exists between
// that pair), or null if the request itself failed.
export async function fetchDurationsMatrix(origins, destinations) {
  const points = [...origins, ...destinations]
  const coordinates = points.map((p) => `${p.lon},${p.lat}`).join(';')
  const sourceIndexes = origins.map((_, i) => i).join(';')
  const destinationIndexes = destinations.map((_, i) => origins.length + i).join(';')

  const res = await fetch(
    `https://router.project-osrm.org/table/v1/driving/${coordinates}?sources=${sourceIndexes}&destinations=${destinationIndexes}&annotations=duration`
  )
  const data = await res.json()
  if (data.code !== 'Ok' || !data.durations) return null
  return data.durations
}