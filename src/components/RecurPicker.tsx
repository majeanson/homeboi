import { useT } from '../i18n'

// Recurrence control for the event form: pick a frequency (or "never"), an
// interval, and — for weekly — which weekdays ("garbage every Wednesday"). Mirror
// of functions/_lib/recur's Recur shape; the two trees don't share code.
export interface RecurValue {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  weekdays: number[] // 0=Sun … 6=Sat
}

export function RecurPicker({ value, onChange }: { value: RecurValue | null; onChange: (v: RecurValue | null) => void }) {
  const t = useT()
  const freq = value?.freq ?? 'none'

  function setFreq(f: string) {
    if (f === 'none') return onChange(null)
    onChange({ freq: f as RecurValue['freq'], interval: value?.interval ?? 1, weekdays: value?.weekdays ?? [] })
  }
  function toggleDay(d: number) {
    if (!value) return
    const days = value.weekdays.includes(d)
      ? value.weekdays.filter((x) => x !== d)
      : [...value.weekdays, d].sort((a, b) => a - b)
    onChange({ ...value, weekdays: days })
  }

  return (
    <div className="recur">
      <label className="recur__row mono">
        <span>{t.recur.repeat}</span>
        <select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="none">{t.recur.none}</option>
          <option value="daily">{t.recur.daily}</option>
          <option value="weekly">{t.recur.weekly}</option>
          <option value="monthly">{t.recur.monthly}</option>
        </select>
      </label>

      {value && (
        <label className="recur__row mono">
          <span>{t.recur.every}</span>
          <input
            className="input recur__interval"
            type="number"
            min={1}
            max={52}
            value={value.interval}
            onChange={(e) => onChange({ ...value, interval: Math.max(1, Math.min(52, Number(e.target.value) || 1)) })}
          />
          <span>{t.recur.unit[value.freq]}</span>
        </label>
      )}

      {value?.freq === 'weekly' && (
        <div className="recur__days">
          {t.recur.weekdayShort.map((lbl, d) => (
            <button
              key={d}
              type="button"
              className={`chip${value.weekdays.includes(d) ? ' is-on' : ''}`}
              onClick={() => toggleDay(d)}
              aria-pressed={value.weekdays.includes(d)}
              aria-label={lbl}
            >
              {lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
