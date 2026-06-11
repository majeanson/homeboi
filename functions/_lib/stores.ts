import type { Env } from './env'

// The stores the household chose to consider in the flyer/deal lookups — an
// allowlist. We key by the merchant name normalized to trim+lowercase so "Super C"
// and "super c" collapse to one identity — the same form Flipp's flyer dedup uses.
// Stored as a JSON array on the household row; absent/garbage/empty simply means
// "no filter — consider every store".

export const storeKey = (merchant: string): string => merchant.trim().toLowerCase()

// Parse + sanitize the stored JSON into a deduped list of merchant keys. Tolerant
// of null, non-arrays, and non-string entries (anything invalid → empty list).
export function parseStoreKeys(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return [...new Set(v.filter((s): s is string => typeof s === 'string').map(storeKey).filter(Boolean))]
  } catch {
    return []
  }
}

// The household's included store keys, or [] (= no filter set, consider every
// store). Used by /api/deals and /api/flyers to keep only the merchants the
// operator chose before they reach the UI. An empty list is the unconfigured
// default — everything is considered, and a store the feed newly surfaces shows
// until the operator narrows the list.
export async function householdIncludedStores(env: Env, householdId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT included_stores FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ included_stores: string | null }>()
  return parseStoreKeys(row?.included_stores)
}
