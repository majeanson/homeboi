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
