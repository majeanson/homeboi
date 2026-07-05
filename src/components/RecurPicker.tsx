import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { Chip } from './Chip'

// Recurrence control for the event form: pick a frequency (or "never"), an
// interval, and — for weekly — which weekdays ("garbage every Wednesday"). Mirror
// of functions/_lib/recur's Recur shape; the two trees don't share code.
export interface RecurValue {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  weekdays: number[] // 0=Sun … 6=Sat
}

export function RecurPicker({ value, onChange }: { value: RecurValue | null; onChange: (v: RecurValue | null) => void }) {
  const t = useT()
  const freq = value?.freq ?? 'none'

  // Keep a local draft of the interval field so it can be transiently empty or
  // half-typed ("" while retyping "1" → "31"). A number-coerced controlled input
  // snaps back to 1 the instant it empties, forcing a backspace-first dance. We
  // clamp to the real value only on blur; sync down when the parent value changes.
  const [draft, setDraft] = useState(String(value?.interval ?? 1))
  useEffect(() => {
    if (value) setDraft(String(value.interval))
  }, [value?.interval])

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
          <option value="yearly">{t.recur.yearly}</option>
        </select>
      </label>

      {value && (
        <label className="recur__row mono">
          <span>{t.recur.every}</span>
          <input
            className="input recur__interval"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              setDraft(digits)
              // Commit whenever it parses to a valid in-range number; leave the
              // clamp for blur so a transient "" or "0" doesn't fight the typist.
              const n = Number(digits)
              if (digits && n >= 1 && n <= 52) onChange({ ...value, interval: n })
            }}
            onBlur={() => {
              const n = Math.max(1, Math.min(52, Number(draft) || 1))
              setDraft(String(n))
              onChange({ ...value, interval: n })
            }}
          />
          <span>{t.recur.unit[value.freq]}</span>
        </label>
      )}

      {value?.freq === 'weekly' && (
        <div className="recur__days">
          {t.recur.weekdayShort.map((lbl, d) => (
            <Chip key={d} selected={value.weekdays.includes(d)} onClick={() => toggleDay(d)} ariaLabel={lbl}>
              {lbl}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}
