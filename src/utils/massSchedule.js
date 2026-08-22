// Shared between ChurchMap and CommuteResults — day ordering/parsing
// for mass_times rows.

// Order matches DAY_LABELS' indices to whatever day_of_week convention
// the mass_times table uses (0 = Sunday, matching JS Date.getDay()).
// Displayed Monday-first with Sunday at the bottom. DAY_INDEXES maps
// each position here to its actual day_of_week value in the database.
export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_INDEXES = [1, 2, 3, 4, 5, 6, 0]

// mass_times.time is stored as already-formatted text (e.g. "2:30 PM"),
// so nothing needs reformatting for display — but plain string sorting
// breaks across AM/PM ("9:00 AM" would sort after "10:00 AM", and PM
// times wouldn't sort after AM at all). This only extracts a
// minutes-since-midnight value to sort by; the original text is what
// actually gets shown.
export function parseTimeToMinutes(timeStr) {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i)
  if (!match) return null
  const [, hoursStr, minutesStr, period] = match
  let hours = Number(hoursStr) % 12
  if (period.toUpperCase() === 'PM') hours += 12
  return hours * 60 + Number(minutesStr)
}

// Inverse of parseTimeToMinutes — turns a computed minutes-since-
// midnight value (e.g. Mass time minus a drive time) back into a
// "7:05 AM"-style string. Wraps modulo 24h so a value that lands
// before midnight or past it (leaving home at 11:50pm for a very
// early Mass, say) still shows a sensible clock time rather than a
// negative number or "25:10".
export function formatMinutesToClock(totalMinutes) {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  let hours = Math.floor(wrapped / 60)
  const minutes = wrapped % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`
}

// Groups raw mass_times rows by church_id, then by day_of_week, sorted
// chronologically within each day.
export function groupMassTimesByChurch(rows) {
  const grouped = {}
  for (const row of rows) {
    grouped[row.church_id] ??= {}
    grouped[row.church_id][row.day_of_week] ??= []
    grouped[row.church_id][row.day_of_week].push({
      id: row.id,
      text: row.time,
      notes: row.notes,
      sundayObligation: row.sunday_obligation,
    })
  }
  for (const churchTimes of Object.values(grouped)) {
    for (const day of Object.keys(churchTimes)) {
      churchTimes[day].sort(
        (a, b) => (parseTimeToMinutes(a.text) ?? 0) - (parseTimeToMinutes(b.text) ?? 0)
      )
    }
  }
  return grouped
}

// Expands a drive-time-ranked church list into one card per Mass
// option on `day` — a church with two Masses that day produces two
// cards, one with none is skipped entirely. Ranking is preserved:
// primarily by each church's position in `rankedChurches` (drive-time
// order), secondarily by time-of-day within a church (already
// chronological from groupMassTimesByChurch). Stops as soon as
// `maxResults` cards are collected, so this stays cheap even with a
// large church list.
export function buildMassOptionCards(rankedChurches, massTimesByChurch, day, maxResults) {
  const cards = []
  for (const entry of rankedChurches) {
    const times = massTimesByChurch[entry.church.id]?.[day]
    if (!times?.length) continue
    for (const massTime of times) {
      cards.push({ ...entry, massTime })
      if (cards.length >= maxResults) return cards
    }
  }
  return cards
}