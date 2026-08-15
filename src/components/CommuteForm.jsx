import AddressAutocompleteInput from './AddressAutocompleteInput'
import DaySelector from './DaySelector'

// All the actual field state (text + resolved location) lives in
// PublicPage, not here — that's what lets it survive unmounting this
// form (e.g. navigating to CommuteResults and back via "Edit
// addresses") instead of resetting every time.
export default function CommuteForm({
  homeText,
  onHomeTextChange,
  homeLocation,
  onHomeLocationChange,
  workText,
  onWorkTextChange,
  workLocation,
  onWorkLocationChange,
  selectedDay,
  onSelectDay,
  onBack,
  onSubmit,
  loading,
  error,
}) {
  function handleSubmit(e) {
    e.preventDefault()
    if (!homeText.trim() || loading) return
    onSubmit()
  }

  return (
    <form className="commute-form" onSubmit={handleSubmit}>
      <div className="commute-form__header">
        <button
          type="button"
          className="commute-form__back"
          onClick={onBack}
          aria-label="Back to events"
        >
          ← Back
        </button>
        <h2 className="commute-form__heading">Add Daily Mass to your commute</h2>
      </div>

      <DaySelector selectedDay={selectedDay} onSelectDay={onSelectDay} />

      <AddressAutocompleteInput
        label="Address 1 (Home)"
        placeholder="123 Main St, Des Moines, IA"
        required
        disabled={loading}
        value={homeText}
        onChange={onHomeTextChange}
        location={homeLocation}
        onLocationChange={onHomeLocationChange}
      />

      <AddressAutocompleteInput
        label="Address 2 (Work)"
        optional
        placeholder="456 Office Pkwy, Des Moines, IA"
        disabled={loading}
        value={workText}
        onChange={onWorkTextChange}
        location={workLocation}
        onLocationChange={onWorkLocationChange}
      />

      {error && <p className="commute-form__error">{error}</p>}

      <button type="submit" className="commute-form__submit" disabled={!homeText.trim() || loading}>
        {loading ? 'Finding mass times…' : 'Find Mass Times'}
      </button>
    </form>
  )
}