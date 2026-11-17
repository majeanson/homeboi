import { useLang } from '../i18n'
import { clockFieldName } from '../lib/format'

// THE time-of-day control: an hour and a minute, always on a 24-hour clock.
//
// A native <input type="time"> draws whatever clock the BROWSER's locale uses, not the
// page's: on an English-locale Chrome a Québec household read « 08:00 AM / 05:00 PM »
// in a French app where every other time says « 8 h 00 » (review #11, 2026-11-17). No
// attribute fixes that, so the control is two selects (the BirthdayPicker pattern),
// which also stay native wheels on a phone.
//
// The value keeps the native input's shape, « HH:MM » (or '' when optional and
// unset), so a call site swaps `onChange={(e) => set(e.target.value)}` for
// `onChange={set}` and nothing else moves. `noneLabel` makes it optional: that entry
// (the caller's own words, e.g. « Toute la journée ») clears it and hides the minutes.
//
// Minutes step by `step` (5 by default); a stored value off the step (07:32) stays
// listed, so opening a form never rewrites a time nobody touched.

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** « HH:MM » → its parts, or null for anything else (an empty optional field). */
export function parseHhmm(v: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? { h, m: min } : null
}

export function TimeField({
  value,
  onChange,
  label,
  noneLabel,
  step = 5,
  className,
}: {
  value: string
  onChange: (v: string) => void
  /** The field's accessible name (the group's); the two selects are « Heure » / « Minute ». */
  label: string
  /** Makes it optional: the hour list's first entry, which clears the value. */
  noneLabel?: string | undefined
  step?: number
  className?: string
}) {
  const { lang } = useLang()
  const p = parseHhmm(value) ?? (noneLabel ? null : { h: 0, m: 0 })
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step)
  if (p && !minutes.includes(p.m)) minutes.push(p.m)
  minutes.sort((a, b) => a - b)

  return (
    <span className={'time-field' + (className ? ` ${className}` : '')} role="group" aria-label={label}>
      <select
        className="input time-field__part"
        aria-label={clockFieldName('hour', lang)}
        value={p ? String(p.h) : ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : `${pad(Number(e.target.value))}:${pad(p?.m ?? 0)}`)}
      >
        {noneLabel && <option value="">{noneLabel}</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {lang === 'fr' ? `${h} h` : pad(h)}
          </option>
        ))}
      </select>
      {p && (
        <>
          {lang !== 'fr' && <span aria-hidden="true">:</span>}
          <select
            className="input time-field__part"
            aria-label={clockFieldName('minute', lang)}
            value={String(p.m)}
            onChange={(e) => onChange(`${pad(p.h)}:${pad(Number(e.target.value))}`)}
          >
            {minutes.map((m) => (
              <option key={m} value={m}>
                {pad(m)}
              </option>
            ))}
          </select>
        </>
      )}
    </span>
  )
}
