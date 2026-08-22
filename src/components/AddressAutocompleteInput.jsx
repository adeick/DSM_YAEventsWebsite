import { useEffect, useRef, useState } from 'react'
import { searchAddresses, geocodeAddress } from '../utils/commuteRoute'

// Debounce delay for prediction lookups. Geoapify's free plan allows
// far more headroom (5 requests/second) than Nominatim's old 1/sec, so
// this stays quick — fires after a brief pause rather than on every
// single keystroke, without making the person wait a full second.
const PREDICTION_DEBOUNCE_MS = 200
const MIN_QUERY_LENGTH = 2

// Controlled text input with a below-the-field prediction dropdown
// (Geoapify, bounded to the Des Moines area — see commuteRoute.js) and
// a "resolved location" that PublicPage uses to drop a preview pin on
// the map. `location` is null whenever the visible text hasn't been
// confirmed against a real address yet — either because it was just
// selected from the dropdown, or because the field was blurred and a
// one-shot geocode succeeded.
export default function AddressAutocompleteInput({
  label,
  optional,
  placeholder,
  required,
  disabled,
  value,
  onChange,
  location,
  onLocationChange,
}) {
  const [predictions, setPredictions] = useState([])
  const [showPredictions, setShowPredictions] = useState(false)
  const debounceRef = useRef(null)
  const blurTimeoutRef = useRef(null)
  // Aborts whichever prediction request is currently in flight when a
  // newer one starts — cheaper than letting a stale request finish
  // and just discarding its response, and it stops slow/abandoned
  // requests from eating into Geoapify's per-second rate limit.
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
        if (err.name !== 'AbortError') throw err // a real failure, not just superseded
      }
    }, PREDICTION_DEBOUNCE_MS)
  }

  function handleChange(e) {
    const text = e.target.value
    onChange(text)
    if (location) onLocationChange(null) // text no longer matches the confirmed pin
    scheduleLookup(text)
  }

  function handleSelectPrediction(prediction) {
    onChange(prediction.displayName)
    onLocationChange(prediction)
    setPredictions([])
    setShowPredictions(false)
  }

  async function handleBlur() {
    // Delay hiding the dropdown so a prediction click (onMouseDown,
    // below — fires before this blur) still gets to run first.
    blurTimeoutRef.current = setTimeout(() => setShowPredictions(false), 100)

    if (!value.trim() || location) return
    const resolved = await geocodeAddress(value)
    if (resolved) onLocationChange(resolved)
  }

  function handleClear() {
    clearTimeout(debounceRef.current)
    abortControllerRef.current?.abort()
    onChange('')
    onLocationChange(null)
    setPredictions([])
    setShowPredictions(false)
  }

  return (
    <label className="address-input">
      {label} {optional && <span className="commute-form__optional">— optional</span>}
      <div className="address-input__field">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => predictions.length > 0 && setShowPredictions(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
        />
        {value && !disabled && (
          <button
            type="button"
            className="address-input__clear"
            onMouseDown={(e) => e.preventDefault()} // keep focus in the input, same as prediction picks
            onClick={handleClear}
            aria-label="Clear address"
          >
            &times;
          </button>
        )}
        {showPredictions && (
          <ul className="address-input__predictions">
            {predictions.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault() // keep focus in the input so blur doesn't race this
                    handleSelectPrediction(p)
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