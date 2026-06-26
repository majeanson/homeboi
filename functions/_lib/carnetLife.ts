// « Le long jeu » — a carnet's lifecycle horizon, DERIVED from installed_at +
// lifespan_months, never materialized as a row (mirrors birthdays.ts). A thing
// with a known install date and an expected service life has one future
// replacement date; we surface a calm "commence à y penser" once it enters its
// lead window (and keep showing it once overdue). Pure + deterministic.
//
// Calm: this is a horizon of TIME, not a score or a countdown-of-doom — the UI
// shows "≈ dans 2 ans" / "à prévoir", never a red timer.

import { localDayStart } from './ids'

export interface CarnetLifeItem {
  carnetId: string
  name: string
  kind: string
  color: string | null
  installedAt: number // unix sec, local midnight of the install day
  lifespanMonths: number // expected service life
}

export interface CarnetLifeSoon {
  carnetId: string
  name: string
  kind: string
  color: string | null
  at: number // unix sec, local midnight of the projected replacement day
  monthsLeft: number // negative once overdue
}

// The projected replacement day (local midnight). Adds whole months to the install
// date; JS Date normalizes month overflow, and noon-UTC keeps us inside the civil
// date in any North-American zone before localDayStart pins it to local midnight.
export function replacementAt(installedAt: number, lifespanMonths: number): number {
  const d = new Date(installedAt * 1000)
  return localDayStart(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + lifespanMonths, d.getUTCDate(), 12)))
}

// Default lead: start nudging ~6 months before a thing is due to be replaced.
const DEFAULT_LEAD_DAYS = 183

// Items entering their "think about it" window (or already overdue), soonest first.
export function carnetLifeSoon(items: CarnetLifeItem[], now: number, leadDays = DEFAULT_LEAD_DAYS): CarnetLifeSoon[] {
  const horizon = now + leadDays * 86400
  const out: CarnetLifeSoon[] = []
  for (const it of items) {
    if (!(it.lifespanMonths > 0) || !(it.installedAt > 0)) continue
    const at = replacementAt(it.installedAt, it.lifespanMonths)
    if (at > horizon) continue // still far off — stays quiet
    out.push({
      carnetId: it.carnetId,
      name: it.name,
      kind: it.kind,
      color: it.color,
      at,
      monthsLeft: Math.round((at - now) / (30 * 86400)),
    })
  }
  return out.sort((a, b) => a.at - b.at)
}

interface CarnetLifeRow {
  id: string
  name: string
  kind: string
  color: string | null
  installed_at: number | null
  lifespan_months: number | null
}

// Active carnets that carry a lifecycle (install date + lifespan), for the board
// glance + the « Le long jeu » horizon.
export async function fetchCarnetLifeItems(db: D1Database, householdId: string): Promise<CarnetLifeItem[]> {
  const res = await db
    .prepare(
      `SELECT id, name, kind, colour AS color, installed_at, lifespan_months
         FROM carnets
        WHERE household_id = ? AND archived_at IS NULL
          AND installed_at IS NOT NULL AND lifespan_months IS NOT NULL AND lifespan_months > 0`,
    )
    .bind(householdId)
    .all<CarnetLifeRow>()
  return res.results.map((r) => ({
    carnetId: r.id,
    name: r.name,
    kind: r.kind,
    color: r.color,
    installedAt: r.installed_at as number,
    lifespanMonths: r.lifespan_months as number,
  }))
}
