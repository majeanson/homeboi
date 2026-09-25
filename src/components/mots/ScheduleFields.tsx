import { type ReactNode } from 'react'
import { useT } from '../../i18n'

// The « Plus tard » date+time picker, shared by the mot composer AND the sender-outbox
// reschedule modal. Calm quick-presets sit above the native inputs so the common cases
// ("ce soir", "demain matin", "ce week-end") are one tap and the raw picker is the escape
// hatch — not the only path. Controlled: the host owns the date/time strings (so it can seed
// them from an existing surface_at) and turns them into a unix-second surface_at.

const pad = (n: number) => String(n).padStart(2, '0')

// A local YYYY-MM-DD for the native <input type="date"> (mirrors EventForm's seed).
export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function todayDateStr(): string {
  return dateStr(new Date())
}
// Local HH:MM for the native <input type="time"> seed (reschedule seeds from surface_at).
export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type SchedulePreset = 'tonight' | 'tomorrowAm' | 'weekend'

// Resolve a preset to a concrete local {date, time}, relative to `now` (injectable → pure &
// unit-tested). « Ce soir » rolls to tomorrow once it's already past 19 h (a "tonight" behind
// us would just surface immediately, reading as broken). « Ce week-end » is the next Saturday
// (today if today already is Saturday).
export function presetWhen(kind: SchedulePreset, now: Date = new Date()): { date: string; time: string } {
  const d = new Date(now.getTime())
  d.setSeconds(0, 0)
  if (kind === 'tonight') {
    if (now.getHours() >= 19) d.setDate(d.getDate() + 1)
    return { date: dateStr(d), time: '19:00' }
  }
  if (kind === 'tomorrowAm') {
    d.setDate(d.getDate() + 1)
    return { date: dateStr(d), time: '08:00' }
  }
  // weekend → next Saturday (getDay() === 6); 0 offset keeps a Saturday on itself.
  const add = (6 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + add)
  return { date: dateStr(d), time: '09:00' }
}

// « Sa fête » (A8) — the next occurrence of a birthday, 08:00 that morning, so a mot can
// wait for the day itself (« leave Léa a note for her birthday »). `birthday` is the
// cercle's 'YYYY-MM-DD' ('0000-MM-DD' when the year is unknown — irrelevant here). The
// day itself still counts as "next" until 08:00 has passed (a mot left at 07:30 lands
// this morning); after that it is a year away. Feb 29 on a non-leap year overflows to
// Mar 1, the calmest answer Date gives for the one birthday the calendar skips. null when
// the string is unreadable — the preset simply does not show. Pure; unit-tested.
export function birthdayWhen(birthday: string | null | undefined, now: Date = new Date()): { date: string; time: string } | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthday ?? '')
  if (!m) return null
  const month = Number(m[1]) - 1
  const day = Number(m[2])
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  const at = (year: number) => new Date(year, month, day, 8, 0, 0, 0)
  let d = at(now.getFullYear())
  if (d.getTime() <= now.getTime()) d = at(now.getFullYear() + 1)
  return { date: dateStr(d), time: '08:00' }
}

const PRESETS: SchedulePreset[] = ['tonight', 'tomorrowAm', 'weekend']

export function ScheduleFields({
  date,
  time,
  onDate,
  onTime,
  extraPresets,
}: {
  date: string
  time: string
  onDate: (v: string) => void
  onTime: (v: string) => void
  /** Host-specific preset chips appended to the quick row — the mot composer's
   *  « Me le rappeler » (demain matin, addressed to me), which needs a recipient
   *  the reschedule sheet doesn't have. Keeps ONE row of presets, not a rival
   *  top-level button that opened this very panel. */
  extraPresets?: ReactNode
}) {
  const fn = useT().mots
  const pick = (k: SchedulePreset) => {
    const w = presetWhen(k)
    onDate(w.date)
    onTime(w.time)
  }
  return (
    <div className="mot-composer__when">
      <div className="mot-composer__presets">
        {PRESETS.map((k) => (
          <button key={k} type="button" className="btn btn--sm btn--ghost mono" onClick={() => pick(k)}>
            {fn.preset[k]}
          </button>
        ))}
        {extraPresets}
      </div>
      <div className="mot-composer__whenrow">
        <input
          className="input"
          type="date"
          value={date}
          min={todayDateStr()}
          onChange={(e) => onDate(e.target.value)}
          aria-label={fn.when}
        />
        <input className="input" type="time" value={time} onChange={(e) => onTime(e.target.value)} aria-label={fn.when} />
      </div>
    </div>
  )
}
