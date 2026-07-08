import type { Env } from './env'

// Per-slot meal settings, household-level (migration 0034). The colours and the
// hide-list set in Réglages ▸ Repas, read back by the board / kitchen so a meal
// reads the same colour everywhere and a hidden slot drops off the glance.
// Validation lives here so both the read path and the PATCH share one definition
// of "a valid slot / a valid colour".

const SLOTS = ['breakfast', 'lunch', 'supper', 'snack', 'dessert'] as const
type Slot = (typeof SLOTS)[number]
const isSlot = (v: unknown): v is Slot => typeof v === 'string' && (SLOTS as readonly string[]).includes(v)
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export interface MealSlotPrefs {
  colors: Record<string, string> // slot → "#rrggbb" (only overridden slots present)
  hidden: string[] // slots to hide; empty = show all
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

const parseJson = (raw: string | null | undefined): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function householdMealSlotPrefs(env: Env, householdId: string): Promise<MealSlotPrefs> {
  const row = await env.DB.prepare('SELECT meal_slot_colours AS meal_slot_colors, meal_slot_hidden FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ meal_slot_colors: string | null; meal_slot_hidden: string | null }>()
  return {
    colors: cleanColors(parseJson(row?.meal_slot_colors)),
    hidden: cleanHidden(parseJson(row?.meal_slot_hidden)),
  }
}
