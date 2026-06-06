import type { Env } from './env'

// Canadian postal code helpers, shared by the household setting and the flyer/
// deal lookups so validation + normalization stay identical everywhere.

const FSA = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/

// Valid? (accepts an optional middle space, e.g. "H2X 1Y4" or "H2X1Y4".)
export const isPostal = (s: string): boolean => FSA.test(s.trim())

// Canonical form Flipp's backend wants: uppercase, no spaces.
export const normalizePostal = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, '')

// The household's saved postal code, or null. Used as the fallback location for
// /api/deals and /api/flyer when the caller doesn't pass one explicitly.
export async function householdPostal(env: Env, householdId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT postal_code FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ postal_code: string | null }>()
  return row?.postal_code ?? null
}
