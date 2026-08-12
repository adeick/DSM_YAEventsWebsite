import { useState } from 'react'
import { supabase } from '../supabaseClient'
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
}

export default function EventForm({ userId, onCreated }) {
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  // Only set once the admin explicitly confirms the pin on the
  // geocoder's preview map — null blocks submission (see the button
  // below) so an event can't be saved without a verified location.
  const [confirmedCoords, setConfirmedCoords] = useState(null)

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

    // organizer_photo_url / location_photo_url are intentionally NOT
    // set here — those photos are added directly in the backend since
    // they have to be generated manually, not just pasted as a URL.
    const { error } = await supabase.from('events').insert({
      title: form.title,
      organizer: form.organizer,
      location_name: form.locationName,
      address: form.address,
      latitude: confirmedCoords.lat,
      longitude: confirmedCoords.lng,
      event_date: eventDate.toISOString(),
      description: form.description || null,
      created_by: userId,
    })

    if (error) {
      setError(error.message)
    } else {
      setForm(emptyForm)
      setConfirmedCoords(null)
      setSuccess(true)
      onCreated?.()
    }
    setSubmitting(false)
  }

  return (
    <form className="event-form" onSubmit={handleSubmit}>
      <h2>Add an event</h2>

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

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">Event added.</p>}
      {!confirmedCoords && form.address.trim() && (
        <p className="form-hint">Confirm the event's location on the map above to continue.</p>
      )}

      <button type="submit" disabled={submitting || !confirmedCoords}>
        {submitting ? 'Saving…' : 'Add event'}
      </button>
    </form>
  )
}