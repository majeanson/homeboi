import type { Env } from './env'

// Storage locations for La réserve, household-level (migration 0036). A JSON
// array of {id, name, color?} set in Réglages ▸ Réserve and read back wherever a
// reserve item is shown so it groups under the right spot. Validation lives here
// so the read path and the PATCH share one definition of "a valid location".
//
// The two seeded defaults (Garde-manger, Congélateur) are NOT baked in here —
// they're localized, so the client resolves them when the stored value is null.
// A stored array (including an empty one = "removed them all") is the household's
// own choice and overrides the defaults.

export interface ReserveLocation {
  id: string
  name: string
  color?: string // "#rrggbb"
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

// Keep only valid, de-duped {id, name, color?} entries — anything malformed is
// dropped so a bad value can never poison the kitchen render. Caps the list so a
// runaway client can't write an unbounded blob.
export function cleanReserveLocations(input: unknown): ReserveLocation[] {
  if (!Array.isArray(input)) return []
  const out: ReserveLocation[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim().slice(0, 40) : ''
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : ''
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    const loc: ReserveLocation = { id, name }
    if (isHex(r.color)) loc.color = r.color.toLowerCase()
    out.push(loc)
    if (out.length >= 12) break
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

// The stored locations, or NULL when the household has never configured them (so
// the client shows the two localized defaults). An explicit empty array stays an
// empty array — "removed them all" must not silently revert to the defaults.
export async function householdReserveLocations(env: Env, householdId: string): Promise<ReserveLocation[] | null> {
  const row = await env.DB.prepare('SELECT reserve_locations FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ reserve_locations: string | null }>()
  if (row?.reserve_locations == null) return null
  const parsed = parseJson(row.reserve_locations)
  if (!Array.isArray(parsed)) return null
  return cleanReserveLocations(parsed)
}
