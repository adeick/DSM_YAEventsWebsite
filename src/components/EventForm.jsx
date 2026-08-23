import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import AddressAutocompleteInput from './AddressAutocompleteInput'
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

const emptyForm = {
  title: '',
  organizer: '',
  locationName: '',
  address: '',
  date: '',
  hour: '18',
  minute: '00',
  description: '',
  published: false,
  previewImageUrl: '',
}

export default function EventForm({ userId, editingEvent, onSaved, onCancelEdit }) {
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  // Only set once a location is confirmed, either by picking a search
  // result (primary flow, below) or by confirming the pin on the
  // fallback geocoder's preview map — null blocks submission (see the
  // button below) so an event can't be saved without a verified
  // location.
  const [confirmedCoords, setConfirmedCoords] = useState(null)
  // Search-first is the primary flow; this reveals the old manual
  // type-address-then-geocode flow as an explicit fallback for
  // addresses the search can't find.
  const [useManualAddress, setUseManualAddress] = useState(false)
  // Options for the featured-image dropdown, below. Not yet filtered
  // by the admin's organization/location — every admin sees every
  // row in event_preview_images for now (see chat: no admin
  // profile/org data exists yet to filter by).
  const [previewImages, setPreviewImages] = useState([])
  const formRef = useRef(null)

  useEffect(() => {
    supabase
      .from('event_preview_images')
      .select('id, label, url')
      .order('label', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setPreviewImages(data)
      })
  }, [])

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
      setUseManualAddress(false)
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
    setUseManualAddress(false)
    setSuccess(false)
    setError(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editingEvent])

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setSuccess(false)
    // The confirmed pin belonged to the OLD address text — once that
    // text changes, it's no longer trustworthy and needs re-confirming.
    if (field === 'address') {
      setConfirmedCoords(null)
    }
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
        <label>
          Organizer
          <input
            type="text"
            value={form.organizer}
            onChange={(e) => updateField('organizer', e.target.value)}
            required
          />
        </label>
        <label>
          Location
          <input
            type="text"
            value={form.locationName}
            onChange={(e) => updateField('locationName', e.target.value)}
            placeholder="e.g. Pastoral Center"
            required
          />
        </label>
      </div>

      {/* Primary flow: search returns the address AND coordinates
          together, so there's no separate confirm step. The old
          type-address-then-geocode flow is still here, just demoted
          to an explicit fallback for locations the search misses. */}
      {!useManualAddress ? (
        <>
          <AddressAutocompleteInput
            label="Address"
            required
            placeholder="Search for the venue name or address"
            value={form.address}
            onChange={(text) => updateField('address', text)}
            location={confirmedCoords ? { lat: confirmedCoords.lat, lon: confirmedCoords.lng } : null}
            onLocationChange={(loc) =>
              setConfirmedCoords(loc ? { lat: loc.lat, lng: loc.lon } : null)
            }
          />
          <button
            type="button"
            className="event-form__link-button"
            onClick={() => setUseManualAddress(true)}
          >
            Can't find it? Enter the address manually instead
          </button>
        </>
      ) : (
        <>
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
              onConfirm={(lat, lng) => setConfirmedCoords({ lat, lng })}
            />
          )}

          <button
            type="button"
            className="event-form__link-button"
            onClick={() => {
              setUseManualAddress(false)
              updateField('address', '')
            }}
          >
            Search for the address instead
          </button>
        </>
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