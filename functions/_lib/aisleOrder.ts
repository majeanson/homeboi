// The household's user-defined grocery aisle ORDER (Réglages ▸ Magasinage). Stored
// as a JSON array of aisle ids on households.aisle_order. The backend only validates
// + persists + reads the order; it never CLASSIFIES an item into an aisle — that's
// client-side, reusing the row-picture keywords (src/lib/aisle.ts). So this stays a
// tiny fixed allowlist of ids, kept in sync by hand with AisleId there.
const AISLE_IDS = [
  'produce',
  'bakery',
  'meat',
  'dairy',
  'pantry',
  'frozen',
  'snacks',
  'drinks',
  'household',
  'autres',
] as const

// Normalize a saved aisle order: keep only known ids, deduped, in the given order.
// Returns [] when nothing valid (→ stored as NULL = the built-in default order).
export function cleanAisleOrder(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const known = new Set<string>(AISLE_IDS)
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of v) {
    const id = typeof x === 'string' ? x : ''
    if (known.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

// Read the saved order, or null when unset/corrupt (the client then uses its
// default store-walk order).
export async function householdAisleOrder(
  env: { DB: D1Database },
  householdId: string,
): Promise<string[] | null> {
  const row = await env.DB.prepare('SELECT aisle_order FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ aisle_order: string | null }>()
  if (!row?.aisle_order) return null
  try {
    const arr = cleanAisleOrder(JSON.parse(row.aisle_order))
    return arr.length ? arr : null
  } catch {
    return null
  }
}
