import { DEFAULT_SLOT_HOURS, DEFAULT_HERO } from './mealSlots'

// Time-aware board emphasis. A wall tablet should gently LEAN toward what matters at
// the moment — the day ahead in the morning, the hero meal as it nears, tomorrow's prep
// in the evening — without ever reshuffling or nagging (DAKboard ships "different screens
// by time of day"; we keep it calm: a soft highlight, same layout). Pure + local-hour, so
// it's unit-tested and the board just maps the result to one card's accent.
//
// Returned target → what the board emphasises:
//   'day'     → the « Aujourd'hui » card (its agenda, or its « fil du jour » ribbon)
//   'supper'  → the « Ce soir » hero-meal card (the hero meal is approaching)
//   'evening' → « Aujourd'hui » (its bunched « Demain » prep) as the day winds down
//   null      → quiet hours (late night / mid-morning lull): emphasise nothing
export type MomentFocus = 'day' | 'supper' | 'evening' | null

// The hero window opens this long before the hero meal is served and closes this long
// after — so the default 17:30 souper reproduces the 14h–20h window this used to
// hardcode, and a household that eats at 19:00 gets the same lean, ninety minutes later.
const LEAD_MIN = 3 * 60 + 30
const TRAIL_MIN = 2 * 60 + 30
const DAY_FROM_MIN = 5 * 60
const DAY_TO_MIN = 11 * 60
// The evening lean is about TOMORROW's prep, so it can't start before the actual
// evening however early the household's hero meal sits. 20:00 = the default hero's
// own trail end, so the default is unchanged.
const EVENING_FLOOR_MIN = 20 * 60
const NIGHT_MIN = 23 * 60

// `heroStartMin` is the hero slot's serve time (Réglages ▸ Repas), in minutes from
// local midnight — a household that eats at 19:00 gets its « Ce soir » emphasis ninety
// minutes later than one that eats at 17:30. Defaults to the built-in souper.
//
// The windows are CLAMPED so an exotic hero (a household that made the déjeuner its
// headline) can't produce nonsense: the hero lean never reaches back into the small
// hours or the morning `day` window, and the evening lean never starts before 20:00.
// A hero served in the morning simply gets no hero lean — `day` already covers it.
export function momentFocus(ms: number, heroStartMin: number = DEFAULT_SLOT_HOURS[DEFAULT_HERO]): MomentFocus {
  const at = new Date(ms)
  const min = at.getHours() * 60 + at.getMinutes()
  if (min >= DAY_FROM_MIN && min < DAY_TO_MIN) return 'day' // morning: the day ahead
  const heroFrom = Math.max(heroStartMin - LEAD_MIN, DAY_TO_MIN)
  const heroTo = Math.max(heroStartMin + TRAIL_MIN, heroFrom) // empty window for a morning hero
  if (min >= heroFrom && min < heroTo) return 'supper' // the hero meal is approaching
  const eveningFrom = Math.max(heroTo, EVENING_FLOOR_MIN)
  if (min >= eveningFrom && min < NIGHT_MIN) return 'evening' // winding down: tomorrow's prep
  return null // the small hours and the midday lull
}
