import { Fragment, useState } from 'react'
import DaySelector from './DaySelector'
import { parseTimeToMinutes, formatMinutesToClock } from '../utils/massSchedule'

// Mass-time boundaries for which commute pattern applies. The gap
// between midnight and 1am (not spelled out in the original ranges)
// falls into 'evening' below, since a Mass at that hour reads as a
// late-night service rather than a morning one.
function categorizeMassTime(minutes) {
  if (minutes >= 60 && minutes <= 644) return 'morning' // 1:00 AM - 10:44 AM
  if (minutes >= 645 && minutes <= 794) return 'noon' // 10:45 AM - 1:14 PM
  return 'evening' // 1:15 PM - 11:59 PM, plus the 12:00-12:59 AM gap
}

// Display text for each category's section label — 'noon' shows as
// "Over Lunch" rather than the internal category name.
const CATEGORY_SECTION_LABELS = {
  morning: 'Morning',
  noon: 'Over Lunch',
  evening: 'Evening',
}

function formatMinutes(seconds) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return '<1 min'
  return `${minutes} min`
}

// Selection (which 6 options make the list) is still governed by
// drive time — this only decides the badge shown on each card.
// `rankIndex` is the card's position in that drive-time order (see
// PublicPage), independent of the time-sorted order the cards are
// actually displayed in.
//
// `detourSeconds` only exists when a work address was given — it's
// the extra time this church adds vs. driving straight home->work,
// which is what "On the Way" actually means (raw total A->church->B
// time is almost never small, even for a church genuinely on the
// route). With no work address there's no detour to measure, so a
// low raw drive time from home is labeled "Nearby" instead — same
// tier, different wording since there's no commute for it to be "on."
// Either way, a match in that top tier always wins regardless of
// rank — genuinely nearby beats "technically 4th closest."
function rankBadge({ rankIndex, totalSeconds, detourSeconds }) {
  if (detourSeconds != null) {
    if (detourSeconds <= 300) return { label: 'On the Way', className: 'on-the-way' }
  } else if (totalSeconds <= 300) {
    return { label: 'Nearby', className: 'on-the-way' }
  }
  if (rankIndex < 3) return { label: 'Closer', className: 'closer' }
  return { label: 'Further', className: 'further' }
}

// Shown only when there's no work address to route through — a plain
// one-way drive time from home. leg1Seconds holds that value in both
// shapes of ranked-church entry (see PublicPage).
function CommuteTimeFromHome({ leg1Seconds }) {
  return <span className="commute-result__distance">{formatMinutes(leg1Seconds)} from home</span>
}

// Commute-mode timing block (shown any day of the week, as long as a
// work address was given) — which lines show depends on which part of
// the day the Mass falls in. Every "leave by" time
// includes a 5-minute buffer beyond the raw drive time (leave a bit
// early rather than cutting it exactly to the minute), and every
// "arrive by" time uses a 35-minute buffer (30 min for Mass itself
// + 5 min slack) instead of a flat 30.
function CommuteTiming({ card }) {
  const minutes = parseTimeToMinutes(card.massTime.text)
  if (minutes == null) return null // unparseable time string — skip rather than guess

  const category = categorizeMassTime(minutes)

  if (category === 'morning') {
    return (
      <div className="commute-result__timing">
        <div className="commute-result__timing-row">
          <span className="commute-result__timing-label">Leave home by</span>
          <span className="commute-result__timing-value">
            {formatMinutesToClock(minutes - card.leg1Seconds / 60 - 5)}
          </span>
        </div>
        <div className="commute-result__timing-row">
          <span className="commute-result__timing-label">Arrive at work by</span>
          <span className="commute-result__timing-value">
            {formatMinutesToClock(minutes + 35 + card.leg2Seconds / 60)}
          </span>
        </div>
      </div>
    )
  }

  if (category === 'noon') {
    return (
      <div className="commute-result__timing">
        <div className="commute-result__timing-row">
          <span className="commute-result__timing-label">Leave work by</span>
          <span className="commute-result__timing-value">
            {formatMinutesToClock(minutes - card.leg3Seconds / 60 - 5)}
          </span>
        </div>
      </div>
    )
  }

  // evening
  return (
    <div className="commute-result__timing">
      <div className="commute-result__timing-row">
        <span className="commute-result__timing-label">Leave work by</span>
        <span className="commute-result__timing-value">
          {formatMinutesToClock(minutes - card.leg3Seconds / 60 - 5)}
        </span>
      </div>
      <div className="commute-result__timing-row">
        <span className="commute-result__timing-label">Arrive home by</span>
        <span className="commute-result__timing-value">
          {formatMinutesToClock(minutes + 35 + card.leg4Seconds / 60)}
        </span>
      </div>
    </div>
  )
}

// `cardsByTime` / `cardsByLocation` — two orderings of the same set of
// Mass options (one card per option; a church with two Masses on the
// selected day appears twice), both built by buildMassOptionCards in
// PublicPage. Drive time always determines WHICH 6 options make the
// list and each card's rank badge (see rankBadge above) — this toggle
// only changes the on-screen order. Switching days or sort mode here
// just re-derives from data already in memory — no re-search.
export default function CommuteResults({
  cardsByTime,
  cardsByLocation,
  hasRoute,
  selectedDay,
  onSelectDay,
  onFocusRoute,
  focusedChurchId,
  onBack,
}) {
  const [sortMode, setSortMode] = useState('time')
  const showCommuteTiming = hasRoute
  const cards = sortMode === 'time' ? cardsByTime : cardsByLocation

  // Time-of-day section labels only make sense in time-sorted order —
  // in location order, categories interleave (a "closer" evening Mass
  // can sit right next to a "farther" morning one), so grouping by
  // category would produce a scattered mess of one-off labels instead
  // of clean sections. Skipped entirely outside time mode.
  let previousCategory = null
  const rows = cards.map((card) => {
    if (sortMode !== 'time') return { card, sectionLabel: null }
    const minutes = parseTimeToMinutes(card.massTime.text)
    const category = minutes == null ? null : categorizeMassTime(minutes)
    const sectionLabel = category && category !== previousCategory ? category : null
    if (category) previousCategory = category
    return { card, sectionLabel }
  })

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

      <div className="commute-results__sort-control">
        <span className="commute-results__sort-label">Sort By</span>
        <button
          type="button"
          className="commute-results__sort-toggle"
          onClick={() => setSortMode((mode) => (mode === 'time' ? 'location' : 'time'))}
        >
          {sortMode === 'time' ? 'Time' : 'Distance'}
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="commute-results__empty">
          No Mass options found for that day along this commute — try another day, or check the
          map for all parishes.
        </p>
      ) : (
        <div className="commute-results__list">
          {rows.map(({ card, sectionLabel }) => {
            const { church, massTime } = card
            const badge = rankBadge(card)
            const isActive = focusedChurchId === church.id
            return (
              <Fragment key={`${church.id}-${massTime.id}`}>
                {sectionLabel && (
                  <div className="commute-results__section-label">
                    {CATEGORY_SECTION_LABELS[sectionLabel]}
                  </div>
                )}
                <div
                  className={`commute-result commute-result--clickable${
                    isActive ? ' commute-result--active' : ''
                  }`}
                  onClick={() => onFocusRoute(church)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onFocusRoute(church)
                    }
                  }}
                >
                  {church.icon_url && (
                    <img className="commute-result__photo" src={church.icon_url} alt="" />
                  )}
                  <div className="commute-result__body">
                    <div className="commute-result__header">
                      <div className="commute-result__header-text">
                        <h3>{church.name}</h3>
                        <span
                          className={`commute-result__badge commute-result__badge--${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {!showCommuteTiming && (
                          <CommuteTimeFromHome leg1Seconds={card.leg1Seconds} />
                        )}
                      </div>
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
                </div>
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}