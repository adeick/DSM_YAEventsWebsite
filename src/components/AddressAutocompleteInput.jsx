import { useEffect, useRef, useState } from 'react'
import { searchAddresses, geocodeAddress } from '../utils/commuteRoute'

// Debounce delay for prediction lookups. Nominatim's usage policy
// expects modest, human-paced traffic rather than a request per
// keystroke, so this waits for a pause in typing instead of querying
// on every character.
const PREDICTION_DEBOUNCE_MS = 400
const MIN_QUERY_LENGTH = 3

// Controlled text input with a below-the-field prediction dropdown
// (Nominatim, bounded to the Des Moines area — see commuteRoute.js)
// and a "resolved location" that PublicPage uses to drop a preview pin
// on the map. `location` is null whenever the visible text hasn't been
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
  const requestIdRef = useRef(0)
  const blurTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current)
      clearTimeout(blurTimeoutRef.current)
    }
  }, [])

  function scheduleLookup(query) {
    clearTimeout(debounceRef.current)
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setPredictions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current
      const results = await searchAddresses(query)
      // A newer keystroke may have started a second request while this
      // one was in flight — ignore this response if it's no longer the
      // latest one requested.
      if (requestId !== requestIdRef.current) return
      setPredictions(results)
      setShowPredictions(results.length > 0)
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