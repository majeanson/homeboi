import { createDeviceStore } from './createDeviceStore'

// D-16 (bmad/09) — the derived-year layer, starting with A-2 « les fêtes
// québécoises et canadiennes ». Same design law as `_lib/birthdays`: annual
// fixed points are DERIVED, never inserted (no rows, no sync, nothing to
// maintain), and every reader shares this ONE tested module. Holidays need no
// household data at all — they're pure functions of the date — so they derive
// CLIENT-side: zero API, zero schema, works offline, and the board merges them
// into its existing event rows as calm, zero-impact announce lines (Marc's
// OQ-4 verdict: announce them all, opt-out in settings).
//
// The set is curated for a QC/CA family fridge — the days a household actually
// marks — not a bank calendar. `kind` reads as: 'ferie' = a stat/school-off
// day (plan around it), 'fete' = a cultural day the house talks about.
// Labels are bilingual inline (the guideContent Bi pattern); the register is
// québécois.

export interface Holiday {
  id: string
  emoji: string
  kind: 'ferie' | 'fete'
  label: { fr: string; en: string }
  // Month/day resolver for a given year, in LOCAL time (the household's wall
  // clock — same day-boundary the board buckets by).
  date: (year: number) => { month: number; day: number } // month 1-12
}

// Anonymous Gregorian computus — Easter Sunday for a given year. Pure, exact.
export function easter(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

// The Nth (1-based) given weekday (0=Sun…6=Sat) of a month, local.
function nthWeekday(year: number, month: number, weekday: number, n: number): { month: number; day: number } {
  const first = new Date(year, month - 1, 1).getDay()
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
  return { month, day }
}

// Journée nationale des patriotes / Victoria Day: the Monday PRECEDING May 25.
function patriotes(year: number): { month: number; day: number } {
  const d = new Date(year, 4, 24) // May 24, the latest possible Monday
  const back = (d.getDay() - 1 + 7) % 7 // days back to Monday
  return { month: 5, day: 24 - back }
}

const shift = (base: { month: number; day: number }, year: number, days: number): { month: number; day: number } => {
  const d = new Date(year, base.month - 1, base.day + days)
  return { month: d.getMonth() + 1, day: d.getDate() }
}

// Curated, calendar-ordered. Ids are stable (a future per-fête opt-out keys on them).
export const HOLIDAYS: Holiday[] = [
  { id: 'jour-de-lan', emoji: '🎆', kind: 'ferie', label: { fr: 'Jour de l’An', en: 'New Year’s Day' }, date: () => ({ month: 1, day: 1 }) },
  { id: 'valentin', emoji: '💝', kind: 'fete', label: { fr: 'Saint-Valentin', en: 'Valentine’s Day' }, date: () => ({ month: 2, day: 14 }) },
  { id: 'vendredi-saint', emoji: '✝️', kind: 'ferie', label: { fr: 'Vendredi saint', en: 'Good Friday' }, date: (y) => shift(easter(y), y, -2) },
  { id: 'paques', emoji: '🐣', kind: 'fete', label: { fr: 'Pâques', en: 'Easter' }, date: (y) => easter(y) },
  { id: 'lundi-de-paques', emoji: '🐰', kind: 'ferie', label: { fr: 'Lundi de Pâques', en: 'Easter Monday' }, date: (y) => shift(easter(y), y, 1) },
  { id: 'meres', emoji: '💐', kind: 'fete', label: { fr: 'Fête des Mères', en: 'Mother’s Day' }, date: (y) => nthWeekday(y, 5, 0, 2) },
  { id: 'patriotes', emoji: '⚜️', kind: 'ferie', label: { fr: 'Journée des Patriotes', en: 'Victoria Day' }, date: (y) => patriotes(y) },
  { id: 'peres', emoji: '🧑‍🧒', kind: 'fete', label: { fr: 'Fête des Pères', en: 'Father’s Day' }, date: (y) => nthWeekday(y, 6, 0, 3) },
  { id: 'st-jean', emoji: '⚜️', kind: 'ferie', label: { fr: 'Saint-Jean-Baptiste', en: 'Saint-Jean-Baptiste' }, date: () => ({ month: 6, day: 24 }) },
  { id: 'canada', emoji: '🍁', kind: 'ferie', label: { fr: 'Fête du Canada', en: 'Canada Day' }, date: () => ({ month: 7, day: 1 }) },
  { id: 'travail', emoji: '🛠️', kind: 'ferie', label: { fr: 'Fête du Travail', en: 'Labour Day' }, date: (y) => nthWeekday(y, 9, 1, 1) },
  { id: 'action-de-grace', emoji: '🦃', kind: 'ferie', label: { fr: 'Action de grâce', en: 'Thanksgiving' }, date: (y) => nthWeekday(y, 10, 1, 2) },
  { id: 'halloween', emoji: '🎃', kind: 'fete', label: { fr: 'Halloween', en: 'Halloween' }, date: () => ({ month: 10, day: 31 }) },
  { id: 'souvenir', emoji: '🌺', kind: 'fete', label: { fr: 'Jour du Souvenir', en: 'Remembrance Day' }, date: () => ({ month: 11, day: 11 }) },
  { id: 'veille-de-noel', emoji: '🎄', kind: 'fete', label: { fr: 'Veille de Noël', en: 'Christmas Eve' }, date: () => ({ month: 12, day: 24 }) },
  { id: 'noel', emoji: '🎄', kind: 'ferie', label: { fr: 'Noël', en: 'Christmas' }, date: () => ({ month: 12, day: 25 }) },
  { id: 'veille-jour-de-lan', emoji: '🥂', kind: 'fete', label: { fr: 'Veille du jour de l’An', en: 'New Year’s Eve' }, date: () => ({ month: 12, day: 31 }) },
]

// Local-midnight unix seconds of a holiday in a given year — the same day key
// the board buckets by (lib/localDay).
export function holidayDaySec(h: Holiday, year: number): number {
  const { month, day } = h.date(year)
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000)
}

// Every holiday landing on the local day starting at `dayStartSec`.
export function holidaysOnDay(dayStartSec: number): Holiday[] {
  const d = new Date(dayStartSec * 1000)
  const y = d.getFullYear()
  return HOLIDAYS.filter((h) => {
    const { month, day } = h.date(y)
    return month === d.getMonth() + 1 && day === d.getDate()
  })
}

// Holidays in [fromDaySec, fromDaySec + days), calendar order, with their local
// day-start second — the board's « À venir » window. Spans a year boundary
// correctly (checks both years' dates).
export function holidaysInRange(fromDaySec: number, days: number): { holiday: Holiday; at: number }[] {
  const from = new Date(fromDaySec * 1000)
  const end = fromDaySec + days * 86_400
  const out: { holiday: Holiday; at: number }[] = []
  for (const y of [from.getFullYear(), from.getFullYear() + 1]) {
    for (const h of HOLIDAYS) {
      const at = holidayDaySec(h, y)
      if (at >= fromDaySec && at < end) out.push({ holiday: h, at })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

// B-11 (bmad/09): group rows by the LOCAL calendar year of their timestamp,
// newest year first — but a collection living inside ONE year returns a single
// null-labelled group, so a young gallery stays one calm unlabelled grid.
export function groupByYear<T>(rows: readonly T[], at: (x: T) => number): [number | null, T[]][] {
  const by = new Map<number, T[]>()
  for (const x of rows) {
    const y = new Date(at(x) * 1000).getFullYear()
    const g = by.get(y)
    if (g) g.push(x)
    else by.set(y, [x])
  }
  const groups = [...by.entries()].sort((a, b) => b[0] - a[0])
  if (groups.length <= 1) return rows.length ? [[null, [...rows]]] : []
  return groups
}

// B-11 (bmad/09): age (in full years) at a given moment, when the birth YEAR
// is known. Accepts the members.birthday string: 'YYYY-MM-DD' gives an age;
// a year-less 'MM-DD' / '--MM-DD' (or anything else) gives null — we never
// guess an age. Used by the drawings gallery (« Léa · 3 ans »).
export function ageAt(birthday: string | null | undefined, atSec: number): number | null {
  if (!birthday) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1900) return null
  const at = new Date(atSec * 1000)
  let age = at.getFullYear() - y
  if (at.getMonth() + 1 < mo || (at.getMonth() + 1 === mo && at.getDate() < d)) age--
  return age >= 0 && age < 130 ? age : null
}

// Per-DEVICE opt-out (OQ-4: announce all by default; a household that doesn't
// want the lines flips one toggle in Réglages ▸ Affichage ▸ Agenda). A display
// preference, so per-device like the board-card layout — no schema.
const store = createDeviceStore<boolean>('babillard-fetes', true, {
  read: (raw) => raw !== '0',
  write: (v) => (v ? '1' : '0'),
})
export const useHolidaysEnabled = store.use
export const setHolidaysEnabled = store.set
