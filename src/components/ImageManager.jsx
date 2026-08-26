import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { uploadImage } from '../utils/imageUpload'

// A logo (shown alongside the organizer name) and a label (shown
// INSTEAD of it) use the same upload shape, but showing both upload
// slots side by side invited mistakes — easy to upload the same
// picture to the wrong one. image_mode ('logo' | 'label') is saved on
// the organization itself, so switching it is a deliberate choice
// that only ever shows the one set of upload slots that's actually in
// use, not a toggle purely local to this admin session.
function OrganizationImageSection({ organizations, onUpdated }) {
  const [selectedId, setSelectedId] = useState('')
  const [uploadingMode, setUploadingMode] = useState(null) // 'light' | 'dark' | null
  const [error, setError] = useState(null)

  const selectedOrg = organizations.find((o) => o.id === selectedId)
  const imageField = selectedOrg?.image_mode // 'logo' | 'label' | null

  async function handleSetImageMode(mode) {
    if (!selectedOrg) return
    setError(null)
    const { error } = await supabase
      .from('organizations')
      .update({ image_mode: mode })
      .eq('id', selectedOrg.id)
    if (error) setError(error.message)
    else onUpdated()
  }

  async function handleUpload(mode, file) {
    if (!file || !selectedOrg || !imageField) return
    setUploadingMode(mode)
    setError(null)
    try {
      const url = await uploadImage(file, `organizations/${imageField}`)
      const column = `${imageField}_${mode}_url`
      const { error } = await supabase
        .from('organizations')
        .update({ [column]: url })
        .eq('id', selectedOrg.id)
      if (error) throw error
      onUpdated()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingMode(null)
    }
  }

  return (
    <div className="image-manager__section">
      <h3>Organization images</h3>
      <p className="image-manager__hint">
        A logo shows ALONGSIDE the organizer's name on an event card; a label REPLACES it.
        Pick one per organization.
      </p>
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        <option value="">Select an organization…</option>
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>

      {selectedOrg && (
        <>
          <div className="image-manager__mode-toggle" role="group" aria-label="Image type">
            <button
              type="button"
              className={
                'image-manager__mode-button' + (imageField === 'logo' ? ' image-manager__mode-button--active' : '')
              }
              onClick={() => handleSetImageMode('logo')}
            >
              Logo (alongside name)
            </button>
            <button
              type="button"
              className={
                'image-manager__mode-button' + (imageField === 'label' ? ' image-manager__mode-button--active' : '')
              }
              onClick={() => handleSetImageMode('label')}
            >
              Label (replaces name)
            </button>
          </div>

          {imageField && (
            <div className="image-manager__theme-pair">
              {['light', 'dark'].map((mode) => {
                const currentUrl = selectedOrg[`${imageField}_${mode}_url`]
                return (
                  <div
                    key={mode}
                    className={
                      'image-manager__upload-slot' +
                      (mode === 'dark' ? ' image-manager__upload-slot--dark' : '')
                    }
                  >
                    <span className="image-manager__slot-label">
                      {mode === 'light' ? 'Light mode' : 'Dark mode'}
                    </span>
                    {currentUrl && (
                      <img src={currentUrl} alt="" className="image-manager__preview" />
                    )}
                    <label className="image-manager__upload-button">
                      {uploadingMode === mode ? 'Uploading…' : currentUrl ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => handleUpload(mode, e.target.files[0])}
                        disabled={uploadingMode !== null}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

// Populates the same event_preview_images table EventForm's "Featured
// image" dropdown already reads from — this replaces having to add
// rows manually via the Supabase table editor with a real upload UI.
function EventHeaderImagesSection({ images, onUpdated }) {
  const [label, setLabel] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!label.trim() || !file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadImage(file, 'event-headers')
      const { error } = await supabase
        .from('event_preview_images')
        .insert({ label: label.trim(), url })
      if (error) throw error
      setLabel('')
      setFile(null)
      onUpdated()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this image? Events already using it will keep showing it until changed.')) return
    await supabase.from('event_preview_images').delete().eq('id', id)
    onUpdated()
  }

  return (
    <div className="image-manager__section">
      <h3>Event card header images</h3>
      <p className="image-manager__hint">
        Populates the "Featured image" dropdown when creating or editing an event.
      </p>
      <form className="image-manager__add-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder='Label (e.g. "Advent candles")'
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files[0] || null)}
          required
        />
        <button type="submit" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Add image'}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {images.length > 0 && (
        <ul className="image-manager__grid">
          {images.map((img) => (
            <li key={img.id}>
              <img src={img.url} alt={img.label} />
              <span>{img.label}</span>
              <button type="button" onClick={() => handleDelete(img.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// One image per church (churches.icon_url — already existed, previously
// pointed at files in /public/church-photos). This is the migration
// path off that: upload here instead of adding a file to the repo.
function ChurchHeaderImageSection({ churches, onUpdated }) {
  const [selectedId, setSelectedId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const selectedChurch = churches.find((c) => c.id === selectedId)

  async function handleUpload(file) {
    if (!file || !selectedChurch) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadImage(file, 'church-headers')
      const { error } = await supabase
        .from('churches')
        .update({ icon_url: url })
        .eq('id', selectedChurch.id)
      if (error) throw error
      onUpdated()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="image-manager__section">
      <h3>Church card header images</h3>
      <p className="image-manager__hint">Replaces the photo shown on a church's map card.</p>
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        <option value="">Select a church…</option>
        {churches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {selectedChurch && (
        <div className="image-manager__upload-slot">
          {selectedChurch.icon_url && (
            <img src={selectedChurch.icon_url} alt="" className="image-manager__preview" />
          )}
          <label className="image-manager__upload-button">
            {uploading ? 'Uploading…' : selectedChurch.icon_url ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleUpload(e.target.files[0])}
              disabled={uploading}
            />
          </label>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

// `onImagesChanged` bumps a shared version number up in AdminPage so
// EventForm's own (separately-fetched) organizations/preview-images
// dropdowns refresh too — otherwise a newly uploaded image wouldn't
// show up there until a full page reload.
export default function ImageManager({ onImagesChanged }) {
  const [organizations, setOrganizations] = useState([])
  const [churches, setChurches] = useState([])
  const [eventImages, setEventImages] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase
      .from('organizations')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setOrganizations(data)
      })
    supabase
      .from('churches')
      .select('id, name, icon_url')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setChurches(data)
      })
    supabase
      .from('event_preview_images')
      .select('id, label, url')
      .order('label', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setEventImages(data)
      })
  }, [refreshKey])

  function refresh() {
    setRefreshKey((k) => k + 1)
    onImagesChanged?.()
  }

  return (
    <section className="image-manager">
      <h2>Manage images</h2>
      <OrganizationImageSection organizations={organizations} onUpdated={refresh} />
      <EventHeaderImagesSection images={eventImages} onUpdated={refresh} />
      <ChurchHeaderImageSection churches={churches} onUpdated={refresh} />
    </section>
  )
}