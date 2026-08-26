import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import LocationSearchInput from './LocationSearchInput'
import OrganizerInput from './OrganizerInput'
import AddressGeocoder from './AddressGeocoder'
import DescriptionField from './DescriptionField'

// Hour options are labeled in friendly 12-hour terms ("6 PM") but the
// underlying value stays 24-hour ("18") so there's no ambiguity and
// no need for a third AM/PM selector — the period is just baked into
// each hour's own label.
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour24) => {
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return { value: String(hour24).padStart(2, '0'), label: `${hour12} ${period}` }
})

const MINUTE_OPTIONS = ['00', '15', '30', '45']

// Geoapify's address_line1 is usually just the street address for a
// POI match, but not always — some results front-load the venue name
// there (or in the `formatted` string this falls back to when
// addressLine1/2 aren't present) the same way `formatted` always
// does. Since Location and Address are shown as two separate fields
// now, having the venue name repeated at the start of the address
// line reads as redundant/wrong ("Pastoral Center, Pastoral Center,
// 601 Grand Ave…") — this strips a leading occurrence of the name
// (plus a trailing comma/space) when the address text happens to lead
// with it, and leaves the text untouched otherwise.
function stripLeadingVenueName(name, addressText) {
  if (!name || !addressText) return addressText
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*${escapedName}\\s*,?\\s*`, 'i')
  const stripped = addressText.replace(pattern, '').trim()
  // Guards against a POI whose entire "address" IS its name (nothing
  // left after stripping) — better to keep the redundant original
  // than to end up with a blank Address field.
  return stripped || addressText
}

const emptyForm = {
  title: '',
  organizer: '',
  organizerId: null,
  locationName: '',
  address: '',
  date: '',
  hour: '18',
  minute: '00',
  description: '',
  published: false,
  previewImageUrl: '',
}

export default function EventForm({ userId, editingEvent, onSaved, onCancelEdit, imagesVersion }) {
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  // Only set once the admin explicitly confirms the pin on
  // AddressGeocoder's preview map — null blocks submission (see the
  // button below) so an event can't be saved without a verified
  // location.
  const [confirmedCoords, setConfirmedCoords] = useState(null)
  // Passed into AddressGeocoder as `initialResult` so picking a
  // LocationSearchInput prediction opens the confirm map immediately
  // with that result's own coordinates, instead of making the admin
  // click "Find on map" and re-geocode text that's already resolved.
  // Cleared whenever the address is edited by hand (see updateField)
  // so a stale pin can't seed a remount of the geocoder for text it
  // no longer matches.
  const [geocoderSeed, setGeocoderSeed] = useState(null)
  // Options for the featured-image dropdown, below. Not yet filtered
  // by the admin's organization/location — every admin sees every
  // row in event_preview_images for now (see chat: no admin
  // profile/org data exists yet to filter by).
  const [previewImages, setPreviewImages] = useState([])
  // Options for OrganizerInput's dropdown, below.
  const [organizations, setOrganizations] = useState([])
  const formRef = useRef(null)

  useEffect(() => {
    supabase
      .from('event_preview_images')
      .select('id, label, url')
      .order('label', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setPreviewImages(data)
      })
    supabase
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setOrganizations(data)
      })
  }, [imagesVersion])

  // Populates the form from an existing event when "Edit" is clicked
  // in the list (see AdminEventList/AdminPage), and clears back to a
  // blank form when editing ends (Cancel, or a successful save).
  // latitude/longitude were already confirmed when this event was
  // first created, so they're restored directly here rather than
  // re-running the search/geocode flow.
  useEffect(() => {
    if (!editingEvent) {
      setForm(emptyForm)
      setConfirmedCoords(null)
      setGeocoderSeed(null)
      setError(null)
      return
    }

    const d = new Date(editingEvent.event_date)
    const pad = (n) => String(n).padStart(2, '0')
    const closestMinute = MINUTE_OPTIONS.reduce((best, m) =>
      Math.abs(Number(m) - d.getMinutes()) < Math.abs(Number(best) - d.getMinutes()) ? m : best
    )

    setForm({
      title: editingEvent.title || '',
      organizer: editingEvent.organizer || '',
      organizerId: editingEvent.organizer_id || null,
      locationName: editingEvent.location_name || '',
      address: editingEvent.address || '',
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      hour: pad(d.getHours()),
      minute: closestMinute,
      description: editingEvent.description || '',
      published: !!editingEvent.is_published,
      previewImageUrl: editingEvent.location_photo_url || '',
    })
    setConfirmedCoords({ lat: editingEvent.latitude, lng: editingEvent.longitude })
    // Seeds AddressGeocoder straight into its "confirmed" state (not
    // just "found") since this location was already confirmed when
    // the event was first created — otherwise editing would
    // misleadingly show an unconfirmed map prompt for a location
    // that's actually already saved and valid.
    setGeocoderSeed({
      lat: editingEvent.latitude,
      lon: editingEvent.longitude,
      displayName: editingEvent.address || '',
      confirmed: true,
    })
    setSuccess(false)
    setError(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editingEvent])

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setSuccess(false)
    // The confirmed pin (and any seeded geocoder preview) belonged to
    // the OLD address text — once that text changes, both are stale
    // and the location needs re-confirming from scratch.
    if (field === 'address') {
      setConfirmedCoords(null)
      setGeocoderSeed(null)
    }
  }

  // Called when a LocationSearchInput prediction is picked: fills the
  // Address field with that result's address, and seeds
  // AddressGeocoder to open already showing that pin — skipping a
  // redundant Nominatim re-lookup of text Geoapify already resolved
  // precisely. Still requires the admin to explicitly confirm it
  // (geocoderSeed doesn't set `confirmed`), same as the manual flow.
  function handleLocationPrediction(prediction) {
    const rawAddress =
      [prediction.addressLine1, prediction.addressLine2].filter(Boolean).join(', ') ||
      prediction.displayName
    const addressText = stripLeadingVenueName(prediction.name, rawAddress)
    updateField('address', addressText)
    setGeocoderSeed({ lat: prediction.lat, lon: prediction.lon, displayName: prediction.displayName })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!confirmedCoords) return
    setSubmitting(true)
    setError(null)

    const eventDate = new Date(`${form.date}T${form.hour}:${form.minute}`)

    // organizer_photo_url is intentionally NOT set here — that photo
    // is added directly in the backend since it has to be generated
    // manually, not just picked from a list. location_photo_url now
    // comes from the featured-image dropdown below instead.
    const eventFields = {
      title: form.title,
      organizer: form.organizer,
      organizer_id: form.organizerId,
      location_name: form.locationName,
      address: form.address,
      location_photo_url: form.previewImageUrl || null,
      latitude: confirmedCoords.lat,
      longitude: confirmedCoords.lng,
      event_date: eventDate.toISOString(),
      description: form.description || null,
      is_published: form.published,
    }

    const { error } = editingEvent
      ? await supabase.from('events').update(eventFields).eq('id', editingEvent.id)
      : await supabase.from('events').insert({ ...eventFields, created_by: userId })

    if (error) {
      setError(error.message)
    } else {
      setForm(emptyForm)
      setConfirmedCoords(null)
      setSuccess(true)
      setSuccessMessage(editingEvent ? 'Event updated.' : 'Event added.')
      onSaved?.()
      if (editingEvent) onCancelEdit?.()
    }
    setSubmitting(false)
  }

  return (
    <form className="event-form" ref={formRef} onSubmit={handleSubmit}>
      <h2>{editingEvent ? 'Edit event' : 'Add an event'}</h2>

      <label>
        Event name
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          required
        />
      </label>

      <div className="event-form__row">
        <OrganizerInput
          value={form.organizer}
          onChange={(text) => updateField('organizer', text)}
          organizations={organizations}
          onSelectOrganization={(org) => setForm((f) => ({ ...f, organizerId: org ? org.id : null }))}
        />
        <LocationSearchInput
          value={form.locationName}
          onChange={(text) => updateField('locationName', text)}
          onSelectPrediction={handleLocationPrediction}
        />
      </div>

      <label>
        Address
        <input
          type="text"
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          placeholder="e.g. 601 Grand Avenue, Des Moines, IA 50309"
          required
        />
      </label>

      {form.address.trim() && (
        <AddressGeocoder
          key={form.address}
          address={form.address}
          initialResult={geocoderSeed}
          onConfirm={(lat, lng) => setConfirmedCoords({ lat, lng })}
        />
      )}

      <div className="event-form__row">
        <label className="event-form__date-field">
          Date
          <input
            type="date"
            value={form.date}
            onChange={(e) => updateField('date', e.target.value)}
            required
          />
        </label>
        <label className="event-form__time-field">
          Hour
          <select value={form.hour} onChange={(e) => updateField('hour', e.target.value)} required>
            {HOUR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="event-form__time-field">
          Minute
          <select
            value={form.minute}
            onChange={(e) => updateField('minute', e.target.value)}
            required
          >
            {MINUTE_OPTIONS.map((minute) => (
              <option key={minute} value={minute}>
                {minute}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label htmlFor="event-description">Description</label>
      <DescriptionField
        id="event-description"
        value={form.description}
        onChange={(value) => updateField('description', value)}
      />

      <label>
        Featured image
        <select
          value={form.previewImageUrl}
          onChange={(e) => updateField('previewImageUrl', e.target.value)}
        >
          <option value="">None</option>
          {previewImages.map((image) => (
            <option key={image.id} value={image.url}>
              {image.label}
            </option>
          ))}
        </select>
      </label>
      {form.previewImageUrl && (
        <img
          src={form.previewImageUrl}
          alt="Selected featured image preview"
          className="event-form__preview-image"
        />
      )}

      <label className="event-form__published">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(e) => updateField('published', e.target.checked)}
        />
        Published (visible on the site immediately)
      </label>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{successMessage}</p>}
      {!confirmedCoords && form.address.trim() && (
        <p className="form-hint">Confirm the event's location on the map above to continue.</p>
      )}

      <div className="event-form__actions">
        <button type="submit" className="event-form__submit" disabled={submitting || !confirmedCoords}>
          {submitting ? 'Saving…' : editingEvent ? 'Save changes' : 'Add event'}
        </button>
        {editingEvent && (
          <button type="button" className="event-form__cancel" onClick={() => onCancelEdit?.()}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}