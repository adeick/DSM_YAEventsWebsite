import { useEffect, useRef, useState } from 'react'

// A free-text input for the organizer's name, with a dropdown-arrow
// button on the right edge that opens a list of pre-existing
// organizations. Typing always stays free-form (this is still a
// plain text field, not locked to the list) — the dropdown is a
// shortcut for the common case, and picking one is what marks the
// event as tied to that organization (see onSelectOrganization).
// EventForm is what actually turns that into a themed logo on the
// public site (see EventDetailCard) — this component only handles
// picking the org, not anything about how it's displayed later.
//
// Reuses .address-input's styling (same label+input+dropdown shape as
// LocationSearchInput/AddressAutocompleteInput) rather than
// duplicating it — only the toggle arrow itself is new.
export default function OrganizerInput({ value, onChange, organizations, onSelectOrganization }) {
  const [open, setOpen] = useState(false)
  const blurTimeoutRef = useRef(null)

  useEffect(() => {
    return () => clearTimeout(blurTimeoutRef.current)
  }, [])

  const query = value.trim().toLowerCase()
  const filtered = query
    ? organizations.filter((org) => org.name.toLowerCase().includes(query))
    : organizations

  function handleChange(e) {
    onChange(e.target.value)
    // Typed text no longer necessarily matches whichever org (if any)
    // was previously picked from the dropdown.
    onSelectOrganization(null)
  }

  function handleSelect(org) {
    onChange(org.name)
    onSelectOrganization(org)
    setOpen(false)
  }

  function handleBlur() {
    // Same delay-then-hide pattern as LocationSearchInput/
    // AddressAutocompleteInput — lets a list item's onMouseDown fire
    // (and run handleSelect) before this closes the dropdown out from
    // under it.
    blurTimeoutRef.current = setTimeout(() => setOpen(false), 100)
  }

  return (
    <label className="address-input">
      Organizer
      <div className="address-input__field">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => organizations.length > 0 && setOpen(true)}
          onBlur={handleBlur}
          required
          autoComplete="off"
        />
        {organizations.length > 0 && (
          <button
            type="button"
            className="organizer-input__toggle"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((o) => !o)}
            aria-label="Choose an existing organization"
            aria-expanded={open}
          >
            <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
              <path fill="currentColor" d="M5 7.5 10 13l5-5.5H5Z" />
            </svg>
          </button>
        )}
        {open && filtered.length > 0 && (
          <ul className="address-input__predictions">
            {filtered.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(org)
                  }}
                >
                  {org.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  )
}