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

// Is this upkeep due within the current season? True when its next occurrence (the
// server-derived nextAt, unix sec) lands before the season turns over — an overdue
// one-off (nextAt in the past) still counts (it's pending now). null = undated = never.
export function isThisSeason(nextAt: number | null | undefined, now: Date = new Date()): boolean {
  if (nextAt == null) return false
  return nextAt * 1000 < nextSeasonStart(now).getTime()
}
