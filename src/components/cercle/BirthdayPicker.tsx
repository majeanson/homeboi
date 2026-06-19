import { useEffect, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { parseBirthday, monthNames, daysInMonth, makeBirthday } from '../../lib/cercle'

// An easy birthday picker: Month + Day dropdowns with an OPTIONAL Year. Birthdays
// often have an unknown year (friends, extended family), and a plain calendar grid
// makes you scroll decades back to a birth year — so we split the parts instead
// (the iOS/Android Contacts pattern). Year-unknown is a first-class state: leave it
// blank → stored as '0000-MM-DD', and the board/age logic treats it as no-year.
// Touch-friendly big targets; stores 'YYYY-MM-DD'.
//
// The picker holds its OWN partial state (month/day/year). The stored value only
// becomes a real 'YYYY-MM-DD' once BOTH month and day are picked, so deriving the
// dropdowns straight from `value` would discard a half-finished pick (choose a
// month → value is still null → the month select snaps back). Local state lets you
// pick the parts in any order; we commit up via onChange whenever they change.
export function BirthdayPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const t = useT()
  const { lang } = useLang()
  const months = monthNames(lang)
  const thisYear = new Date().getFullYear()

  const parsed = parseBirthday(value)
  const [month, setMonth] = useState(parsed?.month ?? 0)
  const [day, setDay] = useState(parsed?.day ?? 0)
  const [year, setYear] = useState<number | null>(parsed?.yearKnown ? parsed.year : null)

  // Resync when the value changes from OUTSIDE (e.g. switching which contact is
  // being edited) — but ignore the echo of our own commits so an in-progress pick
  // isn't clobbered. makeBirthday(month, day, year) is exactly what we last emitted.
  useEffect(() => {
    if (value === makeBirthday(month, day, year)) return
    const p = parseBirthday(value)
    setMonth(p?.month ?? 0)
    setDay(p?.day ?? 0)
    setYear(p?.yearKnown ? p.year : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const maxDay = month ? daysInMonth(month) : 31

  function commit(m: number, d: number, y: number | null) {
    setMonth(m)
    setDay(d)
    setYear(y)
    onChange(makeBirthday(m, d, y))
  }

  return (
    <div className="cf__bday">
      <select
        className="cf__input"
        aria-label={t.cercle.monthLabel}
        value={month}
        onChange={(e) => {
          const m = Number(e.target.value)
          // Clamp the day if the new month is shorter (e.g. 31 → Feb).
          const d = m && day > daysInMonth(m) ? daysInMonth(m) : day
          commit(m, d, year)
        }}
      >
        <option value={0}>{t.cercle.monthLabel}</option>
        {months.map((mn, i) => (
          <option key={i} value={i + 1}>
            {mn}
          </option>
        ))}
      </select>
      <select
        className="cf__input"
        aria-label={t.cercle.dayLabel}
        value={day}
        disabled={!month}
        onChange={(e) => commit(month, Number(e.target.value), year)}
      >
        <option value={0}>{t.cercle.dayLabel}</option>
        {Array.from({ length: maxDay }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <input
        className="cf__input cf__bday-year"
        type="number"
        inputMode="numeric"
        aria-label={t.cercle.yearOptional}
        placeholder={t.cercle.yearOptional}
        value={year ?? ''}
        min={1900}
        max={thisYear}
        onChange={(e) => {
          const v = e.target.value.trim()
          commit(month, day, v ? Number(v) : null)
        }}
      />
    </div>
  )
}
