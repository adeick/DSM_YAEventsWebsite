// Geocoding (Geoapify) + driving directions/travel-time lookups
// (OSRM's free public instance — no API key), used to find churches
// near someone's home-to-work commute.
//
// This is separate from AddressGeocoder.jsx, which is the admin's
// map-based lookup-then-drag-to-confirm flow for a single address and
// still uses Nominatim — this file only covers the commute feature's
// two address fields.

const GEOAPIFY_API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY

if (!GEOAPIFY_API_KEY) {
  console.warn(
    'Missing VITE_GEOAPIFY_API_KEY. Copy .env.example to .env and add a key from https://myprojects.geoapify.com — commute address search will fail without it.'
  )
}

// Number of matched churches shown, regardless of how far they end up
// adding to the trip — always just "the best N," no fixed cutoff.
export const MAX_RESULTS = 6

// Geoapify has no "45-minute drive" concept, so this approximates it
// as a fixed-radius box around Des Moines at a typical highway speed
// (45 min @ ~55mph ≈ 40mi) — close enough to keep geocoding/predictions
// from matching a same-named street in another state, without needing
// a real isochrone/routing API just for input validation.
const DES_MOINES_CENTER = { lat: 41.5868, lon: -93.625 }
const SEARCH_RADIUS_MILES = 40
const MILES_PER_DEGREE_LAT = 69
const MILES_PER_DEGREE_LON = 69 * Math.cos((DES_MOINES_CENTER.lat * Math.PI) / 180)

// Geoapify's `filter=rect:lon1,lat1,lon2,lat2` restricts results to a
// bounding box (opposite corners, min then max) — same restriction
// Nominatim's viewbox+bounded did, just a different query shape.
function searchFilterRect() {
  const dLat = SEARCH_RADIUS_MILES / MILES_PER_DEGREE_LAT
  const dLon = SEARCH_RADIUS_MILES / MILES_PER_DEGREE_LON
  const minLon = DES_MOINES_CENTER.lon - dLon
  const maxLon = DES_MOINES_CENTER.lon + dLon
  const minLat = DES_MOINES_CENTER.lat - dLat
  const maxLat = DES_MOINES_CENTER.lat + dLat
  return `rect:${minLon},${minLat},${maxLon},${maxLat}`
}

function mapGeoapifyResults(data) {
  return (data.results || []).map((r) => ({
    lat: r.lat,
    lon: r.lon,
    displayName: r.formatted,
    // Only populated for POI/venue matches (Geoapify's `amenity`
    // result type) — a plain street address has no separate "name".
    // Used by LocationSearchInput to fill the venue-name field
    // distinctly from the address, instead of dumping the whole
    // formatted string into both.
    name: r.name || null,
    addressLine1: r.address_line1 || null,
    addressLine2: r.address_line2 || null,
    confidence: r.rank?.confidence ?? 0,
    resultType: r.result_type,
  }))
}

// Result types worth ever showing — filters out anything that's just a
// city, state, or country-level match with no street/address info,
// which isn't useful as a "home" or "work" pin. `postcode` is kept
// since zip-only entries are a normal thing to type.
const USEFUL_RESULT_TYPES = new Set(['building', 'street', 'amenity', 'postcode'])

// Below this, Geoapify itself is telling us the match is a stretch —
// showing it just adds noise to the dropdown rather than a usable
// option. This doesn't fix OSM's underlying data gaps (an
// interpolated house number that doesn't actually exist can still
// come back with reasonable confidence, since the geocoder has no way
// to know that) — it only removes the matches Geoapify itself flags
// as unreliable.
const MIN_CONFIDENCE = 0.4

function filterAndRankResults(results) {
  return results
    .filter((r) => r.confidence >= MIN_CONFIDENCE)
    .filter((r) => !r.resultType || USEFUL_RESULT_TYPES.has(r.resultType))
    .sort((a, b) => b.confidence - a.confidence)
}

// A failed request (bad/blocked API key, quota exceeded, malformed
// query) returns no `results` field, same shape as a request that
// genuinely found nothing — so without this, every failure mode looks
// identical to "no matches" from the UI's perspective. This logs the
// actual response so a real problem shows up in the console instead
// of just looking like empty results. `signal` lets a caller cancel
// this mid-flight (see AddressAutocompleteInput) — a deliberate abort
// throws an AbortError, which callers should treat as "ignore this,"
// not a real failure, so it's allowed to propagate rather than being
// caught here.
async function fetchGeoapify(url, signal) {
  const res = await fetch(url, { signal })
  const data = await res.json()
  if (!res.ok) {
    console.error('Geoapify request failed:', res.status, data)
    return null
  }
  return data
}

// Up to `limit` candidate matches for `query`, for populating an
// autocomplete dropdown as the person types. Uses Geoapify's
// Autocomplete endpoint, built for exactly this (partial, in-progress
// text) rather than the full-address Geocoding endpoint below. Callers
// should debounce — this fires one request per call with no
// debouncing of its own. Over-fetches (2x limit) from the API since
// filterAndRankResults will drop some candidates, then trims back down
// to `limit` after filtering. Pass `signal` (an AbortController's
// signal) to let a caller cancel this if a newer keystroke supersedes it.
export async function searchAddresses(query, limit = 5, signal) {
  if (!query.trim() || !GEOAPIFY_API_KEY) return []
  const params = new URLSearchParams({
    text: query,
    format: 'json',
    limit: String(limit * 2),
    filter: searchFilterRect(),
    apiKey: GEOAPIFY_API_KEY,
  })
  const data = await fetchGeoapify(
    `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`,
    signal
  )
  if (!data) return []
  return filterAndRankResults(mapGeoapifyResults(data)).slice(0, limit)
}

// Single best match for a complete `address`, or null if nothing in
// the Des Moines area matched. Uses Geoapify's Geocoding endpoint
// (meant for resolving a full address, as opposed to Autocomplete's
// partial-text matching) — used as a fallback when a typed address
// was never explicitly confirmed via a prediction (e.g. blurring the
// field, or submitting without picking a suggestion). Falls back to
// the raw top match if nothing clears the confidence bar, rather than
// returning null — a low-confidence guess is still more useful here
// than silently failing, since there's no dropdown for the person to
// pick a better option from at this point.
export async function geocodeAddress(address) {
  if (!address.trim() || !GEOAPIFY_API_KEY) return null
  const params = new URLSearchParams({
    text: address,
    format: 'json',
    limit: '5',
    filter: searchFilterRect(),
    apiKey: GEOAPIFY_API_KEY,
  })
  const data = await fetchGeoapify(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`)
  if (!data) return null
  const results = mapGeoapifyResults(data)
  const [best] = filterAndRankResults(results)
  return best ?? results[0] ?? null
}

// OSRM's free public routing instance (no API key, driving profile
// only). `waypoints` is an array of 2+ {lat, lon} points — OSRM traces
// through all of them in order in a single request, so this covers
// both a plain two-point route (home->work) and a routed-through-a-
// stop route (home->church->work) the same way. Returns
// { coordinates, durationSeconds } for the full route, or null if none
// could be found. `coordinates` is an array of [lat, lon] points
// (flipped from GeoJSON's [lon, lat] to match Leaflet/the rest of this
// app) for drawing the route on the map.
export async function fetchDrivingRoute(waypoints) {
  const path = waypoints.map((p) => `${p.lon},${p.lat}`).join(';')
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`
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