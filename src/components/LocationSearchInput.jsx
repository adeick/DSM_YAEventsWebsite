import { useEffect, useRef, useState } from 'react'
import { searchAddresses } from '../utils/commuteRoute'

const PREDICTION_DEBOUNCE_MS = 200
const MIN_QUERY_LENGTH = 2

// A predictive search box for the venue name (e.g. "Pastoral
// Center"), separate from AddressAutocompleteInput: that component
// treats its own displayed text AS the resolved address, whereas this
// field's text is just a venue name — selecting a result here hands
// the full prediction (name, address, lat/lon) up to the parent via
// onSelectPrediction so it can fill the separate Address field and
// seed the map-confirm dialogue, rather than resolving anything on
// its own. No blur-geocode fallback either, for the same reason: a
// typed venue name that doesn't match any prediction isn't itself a
// usable address.
export default function LocationSearchInput({ value, onChange, onSelectPrediction }) {
  const [predictions, setPredictions] = useState([])
  const [showPredictions, setShowPredictions] = useState(false)
  const debounceRef = useRef(null)
  const blurTimeoutRef = useRef(null)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current)
      clearTimeout(blurTimeoutRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  function scheduleLookup(query) {
    clearTimeout(debounceRef.current)
    abortControllerRef.current?.abort()
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setPredictions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller
      try {
        const results = await searchAddresses(query, 5, controller.signal)
        setPredictions(results)
        setShowPredictions(results.length > 0)
      } catch (err) {
        if (err.name !== 'AbortError') throw err
      }
    }, PREDICTION_DEBOUNCE_MS)
  }

  function handleChange(e) {
    const text = e.target.value
    onChange(text)
    scheduleLookup(text)
  }

  function handleSelect(prediction) {
    // Prefer the POI's own name (what a venue search is actually
    // for); a plain address match has no separate name, so keep
    // whatever text is already typed rather than overwriting it with
    // the full address string.
    onChange(prediction.name || value)
    onSelectPrediction(prediction)
    setPredictions([])
    setShowPredictions(false)
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => setShowPredictions(false), 100)
  }

  return (
    <label className="address-input">
      Location
      <div className="address-input__field">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => predictions.length > 0 && setShowPredictions(true)}
          onBlur={handleBlur}
          placeholder="e.g. Pastoral Center"
          required
          autoComplete="off"
        />
        {showPredictions && (
          <ul className="address-input__predictions">
            {predictions.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(p)
                  }}
                >
                  {p.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  )
}