import { useState } from 'react'
import { supabase } from '../supabaseClient'

const emptyForm = {
  title: '',
  description: '',
  date: '',
  time: '',
  location: '',
}

export default function EventForm({ userId, onCreated }) {
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setSuccess(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const eventDate = new Date(`${form.date}T${form.time || '00:00'}`)

    const { error } = await supabase.from('events').insert({
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      event_date: eventDate.toISOString(),
      created_by: userId,
    })

    if (error) {
      setError(error.message)
    } else {
      setForm(emptyForm)
      setSuccess(true)
      onCreated?.()
    }
    setSubmitting(false)
  }

  return (
    <form className="event-form" onSubmit={handleSubmit}>
      <h2>Add an event</h2>

      <label>
        Title
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          required
        />
      </label>

      <div className="event-form__row">
        <label>
          Date
          <input
            type="date"
            value={form.date}
            onChange={(e) => updateField('date', e.target.value)}
            required
          />
        </label>
        <label>
          Time
          <input
            type="time"
            value={form.time}
            onChange={(e) => updateField('time', e.target.value)}
          />
        </label>
      </div>

      <label>
        Location
        <input
          type="text"
          value={form.location}
          onChange={(e) => updateField('location', e.target.value)}
          placeholder="e.g. St. Ambrose Cathedral"
        />
      </label>

      <label>
        Description
        <textarea
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          rows={3}
        />
      </label>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">Event added.</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add event'}
      </button>
    </form>
  )
}