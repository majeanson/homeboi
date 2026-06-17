// Best-effort natural-language -> timestamp for the "when" the intent-router
// echoes ("mardi 15h", "demain", "jeudi", "20 juin", "le 20", "après-demain").
// Deliberately small and forgiving: it covers the common household phrasings,
// and anything it can't read falls back to "today" so an event still lands
// somewhere visible rather than being dropped. A real calendar parser is out of
// scope for the prototype.
//
// All day/time math is HOUSEHOLD-LOCAL (America/Toronto, DST-aware via _lib/ids),
// exactly like _lib/recur and /api/month — NOT UTC. On UTC the day flips at 20:00
// Eastern and the clock is 4–5 h off, so "mardi 15h" used to store 15:00 UTC =
// 11:00 local (a 3 PM dentist appointment showed at 11 AM) and a late-evening
// "demain" bucketed a day early. Reading every day + time as the household's wall
// clock keeps capture consistent with how the board, month grid and meal week
// bucket the very same rows.

import { localDayStart, addLocalDays, localTimeOnDay, localDayOfWeek } from './ids'

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

// Month names FR-CA + EN, with the common accent-dropped spellings ("fevrier",
// "aout", "decembre") so a typed/spoken date matches without diacritics.
const MONTHS: Record<string, number> = {
  janvier: 0,
  février: 1,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
  decembre: 11,
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

// Local midnight (unix s) for an explicit WALL calendar date (month 0-based).
// Noon-UTC of that date is the same calendar day in any North-American zone, so
// localDayStart snaps it to that day's household-local midnight — the same trick
// addLocalDays uses.
function localMidnightOf(y: number, mo0: number, d: number): number {
  return localDayStart(new Date(Date.UTC(y, mo0, d, 12)))
}

// Resolve an EXPLICIT calendar date out of `w` ("20 juin", "june 20", "le 20") to
// a household-local midnight, or null if none. `dayText` is the phrase with any
// time token already stripped, so the hour in "20 juin 15h" isn't read as the
// day. (`ty`,`tmo`,`td`) are today's LOCAL year/month(0-based)/day. A date already
// past rolls forward (bare "le 20" before the 20th = this month, after = next;
// "20 janvier" said in June = next January) — the household means the upcoming one.
function explicitDate(w: string, dayText: string, ty: number, tmo: number, td: number): number | null {
  const todayKey = Date.UTC(ty, tmo, td) // pure calendar ordinal, for "already passed?"
  for (const [name, mo] of Object.entries(MONTHS)) {
    // Whole-word match so short names don't fire inside other words ("mai" in
    // "semaine", "may" in "maybe").
    if (!new RegExp(`\\b${name}\\b`).test(w)) continue
    const m = dayText.match(/\b(\d{1,2})\b/)
    const day = m ? parseInt(m[1]!, 10) : NaN
    if (!(day >= 1 && day <= 31)) continue
    let year = ty
    if (Date.UTC(year, mo, day) < todayKey) year++
    return localMidnightOf(year, mo, day)
  }
  // "le 20" / "the 20th" — a day number with no month means this month, or next
  // if it's already past.
  const le = dayText.match(/\b(?:le|the)\s+(\d{1,2})\b/)
  if (le) {
    const day = parseInt(le[1]!, 10)
    if (day >= 1 && day <= 31) {
      let mo = tmo
      let year = ty
      if (day < td) {
        mo++
        if (mo > 11) {
          mo = 0
          year++
        }
      }
      return localMidnightOf(year, mo, day)
    }
  }
  return null
}

// Returns { startAt, allDay }. `now` is injectable so tests are deterministic
// (the runtime forbids argless Date in some contexts; callers pass Date.now()).
export function parseWhen(when: string | undefined, nowMs: number): { startAt: number; allDay: boolean } {
  if (!when) return { startAt: Math.floor(nowMs / 1000), allDay: true }
  const w = when.toLowerCase()

  // Today, as a household-LOCAL midnight; its UTC Y/M/D read the LOCAL calendar
  // date (local midnight ≈ 04:00–05:00 UTC, same day).
  const todayDay = localDayStart(new Date(nowMs))
  const todayWall = new Date(todayDay * 1000)
  const ty = todayWall.getUTCFullYear()
  const tmo = todayWall.getUTCMonth()
  const td = todayWall.getUTCDate()
  const todayDow = localDayOfWeek(new Date(nowMs))

  // Time of day: "15h", "15h30", "3pm", "9:00". Parsed first so its digits are
  // removed before we look for a day number (else "20 juin 15h" reads 15 as day).
  let secsOfDay: number | null = null
  const tMatch = w.match(/(\d{1,2})\s*(?:h|:)\s*(\d{0,2})/) || w.match(/(\d{1,2})\s*(am|pm)/)
  if (tMatch) {
    let hour = parseInt(tMatch[1]!, 10)
    const min = tMatch[2] && /^\d+$/.test(tMatch[2]) ? parseInt(tMatch[2], 10) : 0
    if (/pm/.test(w) && hour < 12) hour += 12
    if (/am/.test(w) && hour === 12) hour = 0
    if (hour >= 0 && hour <= 23) secsOfDay = hour * 3600 + min * 60
  }
  const dayText = tMatch ? w.replace(tMatch[0], ' ') : w

  // Resolve the target LOCAL day. Order matters: "après-demain" contains "demain".
  let day: number | null = null
  if (
    w.includes('après-demain') ||
    w.includes('apres-demain') ||
    w.includes('day after tomorrow') ||
    w.includes('overmorrow')
  ) {
    day = addLocalDays(todayDay, 2)
  } else if (w.includes('demain') || w.includes('tomorrow')) {
    day = addLocalDays(todayDay, 1)
  } else if (
    w.includes("aujourd'hui") ||
    w.includes('today') ||
    w.includes('asoir') ||
    w.includes('à soir') ||
    w.includes('ce soir') ||
    w.includes('tonight')
  ) {
    day = todayDay
  } else {
    const explicit = explicitDate(w, dayText, ty, tmo, td)
    if (explicit !== null) {
      day = explicit
    } else {
      for (const [name, dow] of Object.entries(WEEKDAYS)) {
        if (dayText.includes(name)) {
          // Next occurrence of that weekday (today counts as 7 days out, so
          // "mardi" said on a Tuesday means next Tuesday — the common intent).
          const delta = ((dow - todayDow + 7) % 7) || 7
          day = addLocalDays(todayDay, delta)
          break
        }
      }
    }
  }

  // A time-of-day word with no explicit clock nudges a captured day to a sensible
  // hour, so "souper à soir" lands in the evening, not at midnight.
  if (day !== null && secsOfDay === null) {
    if (/\b(soir|tonight|tantôt)\b/.test(w) || w.includes('à soir') || w.includes('asoir')) secsOfDay = 18 * 3600
    else if (/\b(midi|noon)\b/.test(w)) secsOfDay = 12 * 3600
    else if (/\b(matin|morning)\b/.test(w)) secsOfDay = 8 * 3600
  }

  // No day matched: a bare time applies to today; otherwise fall back to now/all-day.
  if (day === null) {
    if (secsOfDay !== null) return { startAt: localTimeOnDay(todayDay, secsOfDay), allDay: false }
    return { startAt: Math.floor(nowMs / 1000), allDay: true }
  }
  // A day with a time → that wall time on the local day; a day alone → local midnight.
  if (secsOfDay !== null) return { startAt: localTimeOnDay(day, secsOfDay), allDay: false }
  return { startAt: day, allDay: true }
}
