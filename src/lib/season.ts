// Which season it is, for the board's ambient « living canvas ». Northern-hemisphere
// (Québec) by month — coarse on purpose (the canvas only needs a hue + motif, not the
// astronomical solstice). Pure + local, so it's unit-tested and the canvas just maps the
// result to a `data-season` attribute.
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

export function season(ms: number): Season {
  const m = new Date(ms).getMonth() // 0 = Jan
  if (m <= 1 || m === 11) return 'winter' // Dec, Jan, Feb
  if (m <= 4) return 'spring' // Mar, Apr, May
  if (m <= 7) return 'summer' // Jun, Jul, Aug
  return 'autumn' // Sep, Oct, Nov
}

// The current season (sugar over season() for a Date).
export function currentSeason(now: Date = new Date()): Season {
  return season(now.getTime())
}

// Content emoji per season (content emoji is allowed, like the carnet KIND_EMOJI).
export const SEASON_EMOJI: Record<Season, string> = {
  winter: '❄️',
  spring: '🌷',
  summer: '☀️',
  autumn: '🍂',
}

// The first instant of the NEXT season — the exclusive end of the current season's
// window. Season-start months are Mar/Jun/Sep/Dec; from December we roll to next March.
// Reused by « Cette saison » (board card + Réglages Entretien glance) to decide which
// recurring upkeep is due before the season turns over.
export function nextSeasonStart(now: Date = new Date()): Date {
  const m = now.getMonth()
  for (const b of [2, 5, 8, 11]) if (m < b) return new Date(now.getFullYear(), b, 1)
  return new Date(now.getFullYear() + 1, 2, 1) // December → next March
}

// Season-start months (0-based) — the same boundaries season() buckets by.
export const SEASON_START_MONTH: Record<Season, number> = { spring: 2, summer: 5, autumn: 8, winter: 11 }

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// The anchor DATE (yyyy-mm-dd, for a <input type=date>) a « chaque <saison> »
// preset fills in. Mid-season, the anchor is TODAY — « chaque automne » created in
// October is due now and repeats yearly on this date (never a back-dated anchor
// that would read as instantly owed). Otherwise, the next start of that season.
export function nextSeasonAnchorDate(s: Season, now: Date = new Date()): string {
  if (currentSeason(now) === s) return ymd(now)
  const m = SEASON_START_MONTH[s]
  const y = now.getMonth() < m ? now.getFullYear() : now.getFullYear() + 1
  return ymd(new Date(y, m, 1))
}

// « Chaque saison » (quarterly): anchored on the next season boundary, so a
// monthly/3 rule then lands on every season start.
export function everySeasonAnchorDate(now: Date = new Date()): string {
  return ymd(nextSeasonStart(now))
}

// Is this upkeep due within the current season? True when its next occurrence (the
// server-derived nextAt, unix sec) lands before the season turns over — an overdue
// one-off (nextAt in the past) still counts (it's pending now). null = undated = never.
export function isThisSeason(nextAt: number | null | undefined, now: Date = new Date()): boolean {
  if (nextAt == null) return false
  return nextAt * 1000 < nextSeasonStart(now).getTime()
}

// The ONE « Cette saison » selection — shared by the board SeasonUpkeepCard and the
// Réglages ▸ Entretien glance so the two can never drift. Upkeep rows that are owed
// (overdueSince, the carry-forward) or due before the season turns over, owed first,
// each bucket by date. A settled one-off (checked, no recurrence) is done — out.
export function seasonUpkeepItems<
  T extends {
    kind?: string
    nextAt?: number | null
    overdueSince?: number | null
    recur_json?: string | null
    last_done_at?: number | null
  },
>(projects: T[], now: Date = new Date()): T[] {
  return projects
    .filter((p) => (p.kind ?? 'plan') === 'upkeep')
    .filter((p) => !(p.recur_json == null && p.last_done_at != null))
    .filter((p) => p.overdueSince != null || isThisSeason(p.nextAt, now))
    .sort((a, b) => {
      const ao = a.overdueSince != null ? 0 : 1
      const bo = b.overdueSince != null ? 0 : 1
      if (ao !== bo) return ao - bo
      return (a.overdueSince ?? a.nextAt ?? 0) - (b.overdueSince ?? b.nextAt ?? 0)
    })
}
