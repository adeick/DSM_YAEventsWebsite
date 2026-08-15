// Day-of-week metadata + "what day is it right now, for Mass-planning
// purposes" for the commute feature's day selector.
//
// `day` values match the mass_times table's convention (0 = Sunday,
// same as JS's Date.getDay()) — same as DAY_INDEXES in
// massSchedule.js, just ordered Sunday-first here to match the
// selector's S M T W R F S layout, rather than that file's
// Monday-first weekly-schedule display order.
export const DAY_OPTIONS = [
  { day: 0, letter: 'S', label: 'Sunday' },
  { day: 1, letter: 'M', label: 'Monday' },
  { day: 2, letter: 'T', label: 'Tuesday' },
  { day: 3, letter: 'W', label: 'Wednesday' },
  { day: 4, letter: 'R', label: 'Thursday' },
  { day: 5, letter: 'F', label: 'Friday' },
  { day: 6, letter: 'S', label: 'Saturday' },
]

// Defaults to today, or tomorrow once it's past 6pm — checked in the
// diocese's own timezone (Central) rather than the visitor's local
// clock, since someone checking from another timezone should still
// see "today" the way Des Moines means it.
export function getDefaultDay() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date())

  const weekdayAbbr = parts.find((p) => p.type === 'weekday').value
  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekdayAbbr]

  return hour >= 18 ? (weekdayIndex + 1) % 7 : weekdayIndex
}