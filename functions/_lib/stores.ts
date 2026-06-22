import type { Env } from './env'

// The stores the household chose to consider in the flyer/deal lookups — an
// allowlist. We key by the merchant name normalized to trim+lowercase so "Super C"
// and "super c" collapse to one identity — the same form Flipp's flyer dedup uses.
// Stored as a JSON array on the household row; absent/garbage/empty simply means
// "no filter — consider every store".

export const storeKey = (merchant: string): string => merchant.trim().toLowerCase()

// Parse + sanitize the stored JSON into a deduped list of merchant keys. Tolerant
// of null, non-arrays, and non-string entries (anything invalid → empty list).
function parseStoreKeys(raw: string | null | undefined): string[] {
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

// The household's "hide at the till" store keys, or [] (= nothing hidden). These
// stores still surface in deal search / flyers / price-match — they're only dropped
// from "Montrer à la caisse" (the cashier stepper), where holding up your own
// grocery store's flyer to its own cashier makes no sense. See migration 0066.
export async function householdCashierExcludedStores(env: Env, householdId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT cashier_excluded_stores FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ cashier_excluded_stores: string | null }>()
  return parseStoreKeys(row?.cashier_excluded_stores)
}
