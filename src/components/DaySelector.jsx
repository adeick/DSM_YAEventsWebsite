import { DAY_OPTIONS } from '../utils/commuteDay'

export default function DaySelector({ selectedDay, onSelectDay }) {
  return (
    <div className="day-selector" role="group" aria-label="Day of the week">
      {DAY_OPTIONS.map(({ day, letter, label }) => (
        <button
          key={day}
          type="button"
          className={`day-selector__button${
            day === selectedDay ? ' day-selector__button--selected' : ''
          }`}
          onClick={() => onSelectDay(day)}
          aria-pressed={day === selectedDay}
          aria-label={label}
          title={label}
        >
          {letter}
        </button>
      ))}
    </div>
  )
}