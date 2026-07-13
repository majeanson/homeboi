// The "cashier list" now lives ON the shared grocery list: a staged flyer deal is
// stored against its line (list_items.deal_json), so it syncs across every device
// via the board read and clears automatically when the item is checked off. These
// helpers stage / unstage a deal and derive the cashier Pick[] from the list —
// no per-device localStorage store anymore.
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from './api'
import { writeWith } from './write'
import { type Deal, type Pick } from './deals'
import { normKey } from './cookable'
import { BOARD_KEY, HOUSEHOLD_KEY } from './queryKeys'

// A list row as it arrives in the ['board'] cache (deal_json = the staged deal).
export interface ListItem {
  id: string
  text: string
  source?: string
  added_by?: string | null
  deal_json?: string | null
  search_terms?: string | null // JSON array of extra flyer-search synonyms, if any
  checked_at?: number | null // ticked-off timestamp (null/absent = still to buy)
  non_urgent?: number | null // 1 = « pas pressé »: buy it only if a good deal is on
}

// Parse a staged deal off a list row (null when none / malformed).
export function parseDeal(dealJson: string | null | undefined): Deal | null {
  if (!dealJson) return null
  try {
    return JSON.parse(dealJson) as Deal
  } catch {
    return null
  }
}

// Parse the saved flyer-search synonyms off a list row ([] when none / malformed).
export function parseTerms(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const a = JSON.parse(json)
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// The cashier stepper's Pick[]: every open list line that carries a deal.
export function pickListFrom(items: ListItem[]): Pick[] {
  return items
    .map((i) => {
      const deal = parseDeal(i.deal_json)
      return deal ? { itemId: i.id, itemText: i.text, deal } : null
    })
    .filter((p): p is Pick => p != null)
}

// Stores the household hid at the till (Réglages ▸ Magasinage ▸ store filter ▸
// « À la caisse : Non », migration 0066) — e.g. the store you do your own shopping
// at, where showing its own flyer to its own cashier is pointless. Rides the shared
// HOUSEHOLD_KEY cache; stale is fine (background refetch). Empty set while
// loading/unset. Hooks-rule note: call it unconditionally, before any early return.
export function useTillHiddenStores(): Set<string> {
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ cashierExcludedStores?: string[] }>('household'),
    staleTime: 5 * 60_000,
  })
  return new Set(data?.cashierExcludedStores ?? [])
}

// The cashier set AS THE TILL SHOWS IT: pickListFrom minus the till-hidden stores.
// Every surface that counts, gates, or steps through the cashier picks — the
// « Montrer à la caisse » button on La liste, the /liste/cashier stepper, the
// AddSheet auto-stage hand-off — derives from THIS, so their counts never disagree.
export function cashierPicksFrom(items: ListItem[], tillHidden: Set<string>): Pick[] {
  return pickListFrom(items).filter((p) => !tillHidden.has(p.deal.merchant.trim().toLowerCase()))
}

// The id of an OPEN list item matching `name` (normalized), from the ['board']
// cache — so staging reuses an existing line instead of inserting a duplicate.
// Matches the item's own name first, then any of its saved flyer synonyms: a deal
// searched as "eggs" lands on the recurring "Oeufs" line (synonym "eggs") rather
// than spawning a specific-named duplicate. Keeps the household's items generic
// and stable while the weekly deal that rides on them changes.
export function existingListId(qc: QueryClient, name: string): string | null {
  const key = normKey(name)
  if (!key) return null
  const list = qc.getQueryData<{ list?: ListItem[] }>(BOARD_KEY)?.list ?? []
  return (
    list.find((i) => normKey(i.text) === key)?.id ??
    list.find((i) => parseTerms(i.search_terms).some((term) => normKey(term) === key))?.id ??
    null
  )
}

// Stage a deal: attach it to its grocery line, reusing an existing line or adding
// one. Persists server-side and refreshes the board so every device sees it.
export async function stageDeal(qc: QueryClient, name: string, deal: Deal): Promise<void> {
  const existing = existingListId(qc, name)
  if (existing) {
    await writeWith(qc, 'list', { method: 'PATCH', body: { id: existing, deal }, affectedKeys: [BOARD_KEY] }).catch(
      () => {},
    )
  } else {
    await writeWith(qc, 'list', { method: 'POST', body: { text: name, deal }, affectedKeys: [BOARD_KEY] }).catch(() => {})
  }
}

// Unstage: keep the grocery line, drop its deal (remove it from the cashier set).
// Throws ApiError on a server rejection (offline still queues inside writeWith) so
// the edit scene can say "not saved" instead of closing as if it worked.
export async function unstageDeal(qc: QueryClient, itemId: string): Promise<void> {
  await writeWith(qc, 'list', { method: 'PATCH', body: { id: itemId, deal: null }, affectedKeys: [BOARD_KEY] })
}
