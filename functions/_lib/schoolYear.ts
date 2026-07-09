import type { Env } from './env'
import { getPref, setPref, clearPref } from './householdPrefs'

// D-17 (bmad/10) — « La rentrée ». The household types its school-year bounds once
// a year (first/last day, relâche windows) so the board's « Demain » can tell a
// school morning from a vacation morning, and the year view gets its school-year
// bounds for free — no imports, ONE settings card. Rides household_preferences
// (migration 0106) under key 'schoolYear'; see functions/_lib/householdPrefs.ts.
//
// Dates are LOCAL-midnight unix seconds — the same day-key convention every other
// dated thing in this schema uses (functions/_lib/ids.ts local-day bucketing), so
// they compare directly against the board's day keys with no timezone math here.

// Not exported — nothing outside this file needs the break shape on its own; the
// frontend's own SchoolBreak (src/lib/year.ts) is the type callers actually import.
interface SchoolBreak {
  from: number // local-midnight unix s, inclusive
  to: number // local-midnight unix s, inclusive
  label?: string
}
export interface SchoolYear {
  firstDay: number // local-midnight unix s — la rentrée
  lastDay: number // local-midnight unix s — le dernier jour
  breaks: SchoolBreak[] // relâche(s), Noël, etc. — each inside [firstDay, lastDay]
}

const PREF_KEY = 'schoolYear'
const isDaySec = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

// Validate + normalize a client-submitted schoolYear payload. Returns null when the
// payload doesn't validate (missing/unparseable dates, or firstDay not before
// lastDay) — the caller rejects with a 400 in that case. A break outside the term
// bounds, mis-ordered (from > to), or beyond a 12-entry cap is silently dropped
// rather than failing the whole save; overlapping/out-of-order breaks collapse to
// the ones that fit, kept in chronological order.
export function cleanSchoolYear(input: unknown): SchoolYear | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  const firstDay = r.firstDay
  const lastDay = r.lastDay
  if (!isDaySec(firstDay) || !isDaySec(lastDay) || firstDay >= lastDay) return null

  const breaksRaw = Array.isArray(r.breaks) ? r.breaks : []
  const candidates: SchoolBreak[] = []
  for (const raw of breaksRaw) {
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    const from = b.from
    const to = b.to
    if (!isDaySec(from) || !isDaySec(to) || from > to) continue
    if (from < firstDay || to > lastDay) continue // a break must live inside the term
    const label = typeof b.label === 'string' ? b.label.trim().slice(0, 60) : ''
    candidates.push(label ? { from, to, label } : { from, to })
    if (candidates.length >= 12) break
  }
  candidates.sort((a, b) => a.from - b.from)
  const breaks: SchoolBreak[] = []
  let cursor = firstDay - 1
  for (const b of candidates) {
    if (b.from > cursor) {
      breaks.push(b)
      cursor = b.to
    }
  }
  return { firstDay, lastDay, breaks }
}

export async function householdSchoolYear(env: Env, householdId: string): Promise<SchoolYear | null> {
  return getPref<SchoolYear>(env, householdId, PREF_KEY)
}

export async function setHouseholdSchoolYear(env: Env, householdId: string, sy: SchoolYear): Promise<void> {
  await setPref(env, householdId, PREF_KEY, sy)
}

export async function clearHouseholdSchoolYear(env: Env, householdId: string): Promise<void> {
  await clearPref(env, householdId, PREF_KEY)
}
