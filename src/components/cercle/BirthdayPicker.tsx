import { useLang, useT } from '../../i18n'
import { parseBirthday, monthNames, daysInMonth, makeBirthday } from '../../lib/cercle'

// An easy birthday picker: Month + Day dropdowns with an OPTIONAL Year. Birthdays
// often have an unknown year (friends, extended family), and a plain calendar grid
// makes you scroll decades back to a birth year — so we split the parts instead
// (the iOS/Android Contacts pattern). Year-unknown is a first-class state: leave it
// blank → stored as '0000-MM-DD', and the board/age logic treats it as no-year.
// Touch-friendly big targets; stores 'YYYY-MM-DD'.
export function BirthdayPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const t = useT()
  const { lang } = useLang()
  const parsed = parseBirthday(value)
  const month = parsed?.month ?? 0
  const day = parsed?.day ?? 0
  const year = parsed?.yearKnown ? parsed.year : null
  const months = monthNames(lang)
  const maxDay = month ? daysInMonth(month) : 31
  const thisYear = new Date().getFullYear()

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
          onChange(makeBirthday(m, d, year))
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
        onChange={(e) => onChange(makeBirthday(month, Number(e.target.value), year))}
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
          onChange(makeBirthday(month, day, v ? Number(v) : null))
        }}
      />
    </div>
  )
}
