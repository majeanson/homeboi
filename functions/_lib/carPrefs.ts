import type { Env } from './env'

// The household's vehicle(s) for « L'auto », household-level (migration 0067). A
// JSON array of {id, name, color?} set in Réglages ▸ L'auto and read back wherever
// a ride, the car-availability glance, or the /voiture week view names/tints a car.
// Validation lives here so the read path and the PATCH share one definition of "a
// valid car".
//
// The single seeded default (« L'auto ») is NOT baked in here — it's localized, so
// the client resolves it when the stored value is null. A stored array (including
// an empty one = "we have no car") is the household's own choice and overrides the
// default. Holds no quantities/counts — a name + colour only (NFR-CALM).

export interface Car {
  id: string
  name: string
  color?: string // "#rrggbb"
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

// Keep only valid, de-duped {id, name, color?} entries — anything malformed is
// dropped so a bad value can never poison a ride/glance render. Caps the list so a
// runaway client can't write an unbounded blob (a household has a car or two, not
// a fleet).
export function cleanCars(input: unknown): Car[] {
  if (!Array.isArray(input)) return []
  const out: Car[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim().slice(0, 40) : ''
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : ''
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    const car: Car = { id, name }
    if (isHex(r.color)) car.color = r.color.toLowerCase()
    out.push(car)
    if (out.length >= 6) break
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

// The stored cars, or NULL when the household has never configured them (so the
// client shows the localized « L'auto » default). An explicit empty array stays an
// empty array — "we have no car" must not silently revert to the default.
export async function householdCars(env: Env, householdId: string): Promise<Car[] | null> {
  const row = await env.DB.prepare('SELECT cars FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ cars: string | null }>()
  if (row?.cars == null) return null
  const parsed = parseJson(row.cars)
  if (!Array.isArray(parsed)) return null
  return cleanCars(parsed)
}
