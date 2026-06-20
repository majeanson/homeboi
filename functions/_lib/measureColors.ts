import type { Env } from './env'

// Household measuring-tool colours (migration 0048). The editable swatches — six
// physical spoons + seven measuring-cup sizes (qty|unit) + three per-unit fallbacks —
// set in Réglages ▸ Affichage and read back by every recipe surface so the measure
// pills + Cook-mode scoop circles match the household's own tools everywhere.
// Validation lives here so the read path and the PATCH share one definition of "a
// valid swatch / colour". Keep this id list in sync with MEASURE_SWATCHES in
// src/lib/measurePrefs.ts.

const TOOL_KEYS = [
  '1|tbsp', '1/2|tbsp', '1|tsp', '1/2|tsp', '1/4|tsp', '1/8|tsp',
  '1|cup', '3/4|cup', '2/3|cup', '1/2|cup', '1/3|cup', '1/4|cup', '1/8|cup',
] as const
const UNIT_KEYS = ['unit:tbsp', 'unit:tsp', 'unit:cup'] as const
const VALID = new Set<string>([...TOOL_KEYS, ...UNIT_KEYS])
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

// Keep only valid {swatchId: hex} pairs, hex lower-cased. Accepts the parsed object
// (from a stored JSON string or a PATCH body) — anything malformed is dropped, so a
// bad value can never poison a recipe render.
export function cleanMeasureColors(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (VALID.has(k) && isHex(v)) out[k] = v.toLowerCase()
    }
  }
  return out
}

const parseJson = (raw: string | null | undefined): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function householdMeasureColors(env: Env, householdId: string): Promise<Record<string, string>> {
  const row = await env.DB.prepare('SELECT measure_colors FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ measure_colors: string | null }>()
  return cleanMeasureColors(parseJson(row?.measure_colors))
}
