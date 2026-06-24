// Time-aware board emphasis. A wall tablet should gently LEAN toward what matters at
// the moment — the day ahead in the morning, the supper as dinner nears, tomorrow's prep
// in the evening — without ever reshuffling or nagging (DAKboard ships "different screens
// by time of day"; we keep it calm: a soft highlight, same layout). Pure + local-hour, so
// it's unit-tested and the board just maps the result to one card's accent.
//
// Returned target → what the board emphasises:
//   'day'     → the day's glance (« Le fil du jour » if shown, else « Aujourd'hui »)
//   'supper'  → the « Ce soir » supper hero (dinner is approaching)
//   'evening' → « Aujourd'hui » (its bunched « Demain » prep) as the day winds down
//   null      → quiet hours (late night / mid-morning lull): emphasise nothing
export type MomentFocus = 'day' | 'supper' | 'evening' | null

export function momentFocus(ms: number): MomentFocus {
  const h = new Date(ms).getHours()
  if (h >= 5 && h < 11) return 'day' // morning: the day ahead
  if (h >= 14 && h < 20) return 'supper' // afternoon → dinner: "what's for supper"
  if (h >= 20 && h < 23) return 'evening' // winding down: tomorrow's prep
  return null // 23–05 and the 11–14 midday lull
}
