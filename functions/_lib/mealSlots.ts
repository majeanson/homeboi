import type { Env } from './env'
import { getPref, setPref } from './householdPrefs'

// Per-slot meal settings, household-level. The colours and the hide-list (migration
// 0034) set in Réglages ▸ Repas, read back by the board / kitchen so a meal reads the
// same colour everywhere and a hidden slot drops off the glance. Plus the LAYOUT trio
// — display order, the hero slot, and each slot's start time — which rides
// household_preferences (migration 0106) under key 'mealSlots' rather than widening
// `households` further (DB-6). Validation lives here so both the read path and the
// PATCH share one definition of "a valid slot / colour / order / hour".
//
// THREE independent settings, deliberately not one:
//   • `order` — where a slot appears in a LIST (kitchen grid, day editor, pickers).
//   • `hero`  — which slot is the day's headline (board « Ce soir », kitchen day
//               summary, « à régler », meal suggestions). Defaults to the souper.
//   • `hours` — each slot's START time. The WALL-CLOCK order is DERIVED by sorting
//               these, so `order` can never contradict what time a meal happens:
//               dragging the dessert to the top reorders the list, it doesn't make
//               dessert the next meal at 7 AM. Drives « Prochain repas » (Cuisiner).

const SLOTS = ['breakfast', 'lunch', 'supper', 'snack', 'dessert'] as const
export type Slot = (typeof SLOTS)[number]
const isSlot = (v: unknown): v is Slot => typeof v === 'string' && (SLOTS as readonly string[]).includes(v)
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

// The built-in display order — by time of day. Unchanged from the constant this
// setting replaced (SLOT_TIME_ORDER in src/lib/mealSlots.ts).
export const DEFAULT_SLOT_ORDER: Slot[] = ['breakfast', 'lunch', 'snack', 'supper', 'dessert']

// The souper is the day's hero out of the box: the board headline, the kid
// suggestion target, the shop-the-week driver.
export const DEFAULT_HERO: Slot = 'supper'

// When each meal is SERVED, as minutes from local midnight. An ordinary Québec day.
// Mirrors DEFAULT_SLOT_HOURS in src/lib/mealSlots.ts.
export const DEFAULT_SLOT_HOURS: Record<Slot, number> = {
  breakfast: 7 * 60, // 07:00
  lunch: 12 * 60, // 12:00 — le dîner
  snack: 15 * 60, // 15:00
  supper: 17 * 60 + 30, // 17:30 — le souper
  dessert: 20 * 60, // 20:00
}

const MINUTES_IN_DAY = 24 * 60

export interface MealSlotPrefs {
  colors: Record<string, string> // slot → "#rrggbb" (only overridden slots present)
  hidden: string[] // slots to hide; empty = show all
  order: Slot[] // display order — always complete + deduped
  hero: Slot // the day's headline slot
  hours: Record<Slot, number> // slot → start, minutes from local midnight
}

// The layout half, as stored under the 'mealSlots' preference key. Partial on disk
// (a household that only reordered has no `hero`/`hours`), always complete in memory.
interface MealLayout {
  order: Slot[]
  hero: Slot
  hours: Record<Slot, number>
}

// Keep only valid {slot: hex} pairs, hex lower-cased. Accepts the parsed object
// (from a stored JSON string or a PATCH body) — anything malformed is dropped, so
// a bad value can never poison the board render.
export function cleanColors(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isSlot(k) && isHex(v)) out[k] = v.toLowerCase()
    }
  }
  return out
}

// Keep only valid, de-duped slot names.
export function cleanHidden(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter(isSlot))]
}

// Normalize a display order: known slots only, deduped, in the given order, then any
// slot the client omitted appended in DEFAULT_SLOT_ORDER. Always returns all five —
// so every reader can iterate it directly and a slot can never silently vanish from
// the kitchen because a stale client PATCHed a short list.
export function cleanOrder(input: unknown): Slot[] {
  const seen = new Set<Slot>()
  const out: Slot[] = []
  if (Array.isArray(input)) {
    for (const v of input) {
      if (isSlot(v) && !seen.has(v)) {
        seen.add(v)
        out.push(v)
      }
    }
  }
  for (const s of DEFAULT_SLOT_ORDER) if (!seen.has(s)) out.push(s)
  return out
}

// The hero falls back to the souper on anything unrecognized. A HIDDEN hero is
// allowed and meaningful: it drops the board's headline entirely (the pre-existing
// "hidden souper hides the hero" behaviour), so we don't second-guess it here.
export function cleanHero(input: unknown): Slot {
  return isSlot(input) ? input : DEFAULT_HERO
}

// Per-slot start minute. Each slot independently falls back to its default, so a
// partial map ({supper: 1080}) is a valid PATCH. Values are clamped to a real
// minute-of-day; a non-integer / out-of-range value is dropped, not clamped
// silently to a boundary that would reorder the day.
export function cleanHours(input: unknown): Record<Slot, number> {
  const out = { ...DEFAULT_SLOT_HOURS }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (!isSlot(k)) continue
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= MINUTES_IN_DAY) continue
      out[k] = v
    }
  }
  return out
}

// (The wall-clock order lives client-side only — `clockOrder` in src/lib/mealSlots.ts.
// No handler needs it: the server sorts rows by the DISPLAY order and hands the clock
// reasoning — « Prochain repas », the emphasis window — to the SPA.)

// An SQL `CASE slot WHEN … END` that ranks rows by the household's display order.
// Safe to interpolate: every emitted literal comes from the SLOTS allowlist above,
// never from the request. `ELSE 9` parks an unknown/legacy slot after the known five.
export function slotCaseSql(order: Slot[]): string {
  const whens = order.map((s, i) => {
    if (!isSlot(s)) throw new Error(`slotCaseSql: refusing to interpolate unknown slot ${JSON.stringify(s)}`)
    return `WHEN '${s}' THEN ${i}`
  })
  return `CASE slot ${whens.join(' ')} ELSE 9 END`
}

// The full ORDER BY tail for a meal read: household slot order, then `position`
// within the slot (migration 0033), then a deterministic tie-break.
export function mealOrderSql(order: Slot[]): string {
  return `${slotCaseSql(order)}, position, created_at, id`
}

const parseJson = (raw: string | null | undefined): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// The layout trio, read from household_preferences. Missing key / corrupt JSON →
// the built-in defaults, so a household that never opened Réglages ▸ Repas behaves
// exactly as the app did before this setting existed.
export async function householdMealLayout(env: Env, householdId: string): Promise<MealLayout> {
  const raw = await getPref<Partial<MealLayout>>(env, householdId, 'mealSlots')
  return {
    order: cleanOrder(raw?.order),
    hero: cleanHero(raw?.hero),
    hours: cleanHours(raw?.hours),
  }
}

// Merge a partial layout PATCH onto what's stored. Each field is only touched when
// the caller passes it, so the reorder control and the hero picker can save
// independently without clobbering each other.
export async function setHouseholdMealLayout(
  env: Env,
  householdId: string,
  patch: { order?: unknown; hero?: unknown; hours?: unknown },
): Promise<void> {
  const current = await householdMealLayout(env, householdId)
  await setPref(env, householdId, 'mealSlots', {
    order: 'order' in patch ? cleanOrder(patch.order) : current.order,
    hero: 'hero' in patch ? cleanHero(patch.hero) : current.hero,
    hours: 'hours' in patch ? cleanHours({ ...current.hours, ...(patch.hours as object) }) : current.hours,
  })
}

export async function householdMealSlotPrefs(env: Env, householdId: string): Promise<MealSlotPrefs> {
  const [row, layout] = await Promise.all([
    env.DB.prepare('SELECT meal_slot_colours AS meal_slot_colors, meal_slot_hidden FROM households WHERE id = ?')
      .bind(householdId)
      .first<{ meal_slot_colors: string | null; meal_slot_hidden: string | null }>(),
    householdMealLayout(env, householdId),
  ])
  return {
    colors: cleanColors(parseJson(row?.meal_slot_colors)),
    hidden: cleanHidden(parseJson(row?.meal_slot_hidden)),
    ...layout,
  }
}
