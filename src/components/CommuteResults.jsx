import DaySelector from './DaySelector'
import { parseTimeToMinutes, formatMinutesToClock } from '../utils/massSchedule'

// day_of_week convention: 0 = Sunday ... 6 = Saturday (see
// commuteDay.js) — Monday through Friday is 1-5.
function isWeekday(day) {
  return day >= 1 && day <= 5
}

// Mass-time boundaries for which commute pattern applies. The gap
// between midnight and 1am (not spelled out in the original ranges)
// falls into 'evening' below, since a Mass at that hour reads as a
// late-night service rather than a morning one.
function categorizeMassTime(minutes) {
  if (minutes >= 60 && minutes <= 644) return 'morning' // 1:00 AM - 10:44 AM
  if (minutes >= 645 && minutes <= 794) return 'noon' // 10:45 AM - 1:14 PM
  return 'evening' // 1:15 PM - 11:59 PM, plus the 12:00-12:59 AM gap
}

function formatMinutes(seconds) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return '<1 min'
  return `${minutes} min`
}

// Weekend commute-mode cards, and the no-work-address fallback, both
// just show a plain one-way drive time from home — leg1Seconds holds
// that in both shapes of ranked-church entry (see PublicPage).
function CommuteTimeFromHome({ leg1Seconds }) {
  return <span className="commute-result__distance">{formatMinutes(leg1Seconds)} from home</span>
}

// Weekday commute-mode timing block: which lines show depends on
// which part of the day the Mass falls in.
function CommuteTiming({ card }) {
  const minutes = parseTimeToMinutes(card.massTime.text)
  if (minutes == null) return null // unparseable time string — skip rather than guess

  const category = categorizeMassTime(minutes)

  if (category === 'morning') {
    return (
      <div className="commute-result__timing">
        <div className="commute-result__timing-row">
          <span className="commute-result__timing-label">Leave home by</span>
          {formatMinutesToClock(minutes - card.leg1Seconds / 60)}
        </div>
        <div className="commute-result__timing-row">
          <span className="commute-result__timing-label">Arrive at work by</span>
          {formatMinutesToClock(minutes + 30 + card.leg2Seconds / 60)}
        </div>
      </div>
    )
  }

  if (category === 'noon') {
    return (
      <div className="commute-result__timing">
        <div className="commute-result__timing-row">
          <span className="commute-result__timing-label">Leave work by</span>
          {formatMinutesToClock(minutes - card.leg3Seconds / 60)}
        </div>
      </div>
    )
  }

  // evening
  return (
    <div className="commute-result__timing">
      <div className="commute-result__timing-row">
        <span className="commute-result__timing-label">Leave work by</span>
        {formatMinutesToClock(minutes - card.leg3Seconds / 60)}
      </div>
      <div className="commute-result__timing-row">
        <span className="commute-result__timing-label">Arrive home by</span>
        {formatMinutesToClock(minutes + 30 + card.leg4Seconds / 60)}
      </div>
    </div>
  )
}

// `cards` — one entry per Mass option (a church with two Masses on the
// selected day appears twice), already ranked by drive time and built
// by buildMassOptionCards in PublicPage. Switching days here just
// re-derives that list from data already in memory — no re-search.
export default function CommuteResults({ cards, hasRoute, selectedDay, onSelectDay, onBack }) {
  const showCommuteTiming = hasRoute && isWeekday(selectedDay)

  return (
    <div className="commute-results">
      <div className="commute-form__header">
        <button type="button" className="commute-form__back" onClick={onBack}>
          ← Edit addresses
        </button>
        <h2 className="commute-form__heading">
          {hasRoute ? 'Churches on your commute' : 'Churches near home'}
        </h2>
      </div>

      <DaySelector selectedDay={selectedDay} onSelectDay={onSelectDay} />

      {cards.length === 0 ? (
        <p className="commute-results__empty">
          No Mass options found for that day along this commute — try another day, or check the
          map for all parishes.
        </p>
      ) : (
        <div className="commute-results__list">
          {cards.map((card) => {
            const { church, massTime } = card
            return (
              <div className="commute-result" key={`${church.id}-${massTime.id}`}>
                <div className="commute-result__header">
                  <h3>{church.name}</h3>
                  {!showCommuteTiming && <CommuteTimeFromHome leg1Seconds={card.leg1Seconds} />}
                </div>
                <div className="commute-result__time">
                  <span className="commute-result__time-text">{massTime.text}</span>
                  {massTime.sundayObligation && (
                    <span className="commute-result__obligation-tag">Sunday Obligation</span>
                  )}
                </div>
                {showCommuteTiming && <CommuteTiming card={card} />}
                {massTime.notes && <p className="commute-result__notes">{massTime.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}