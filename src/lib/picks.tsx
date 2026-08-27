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

// A saved synonym is sometimes typed as ONE comma list ("apple, apples, pomme")
// instead of one chip per word — that is what a household actually does, and
// `/api/deals?terms=` has always split it that way for the lookup. Matching splits
// it too, or the very line carrying the synonyms never recognizes its own flyer
// names ("Chicken breast, boneless" spawned a duplicate beside a « Poulet » line
// whose one chip read "chicken, chicken breast, poitrine"). Mirror of
// `splitTerms` in functions/_lib/listMatch.ts.
const TERM_SPLIT = /[,;/|\n]+/

function splitTerms(raw: string): string[] {
  return raw.split(TERM_SPLIT).map((s) => s.trim()).filter(Boolean)
}

// Parse the saved flyer-search synonyms off a list row ([] when none / malformed),
// comma lists unpacked — so the chip editor, the deals lookup and matchListItem
// all see the same flat set of synonyms.
export function parseTerms(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const a = JSON.parse(json)
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string').flatMap(splitTerms) : []
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

// Crude per-word singular so « pommes » still finds « Pomme Gala 3 lb » (and the
// reverse). Only a trailing 's' on 4+ letter words — anything smarter belongs in a
// real stemmer, and short words ("mais"/"bas") are too noisy to fold.
function singularWords(key: string): string {
  return key
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ')
}

// The list line matching `name` — the ONE reuse-not-duplicate decision (deal ↔ item
// doctrine: a flyer deal rides on the generic recurring line, never a specific-named
// copy). Tiered, open lines before checked ones:
//   1. exact name  — "oeufs" → the "Oeufs" line
//   2. exact saved synonym — "eggs" → "Oeufs" (search_terms: ["eggs"])
//   3. the LINE's name contained whole-word in the flyer product name —
//      "Pommes Gala 3 lb" ⊇ "pommes" (store-mode / FlyerViewer adds pass the raw
//      product name; before this tier those always spawned a duplicate). One
//      direction only: a generic line inside a specific product name — a deal
//      searched as "oeufs" must NOT land on an "Oeufs en chocolat" line.
//   4. same containment against the line's synonyms.
export function matchListItem(list: ListItem[], name: string): ListItem | null {
  const key = normKey(name)
  if (!key) return null
  const hay = ` ${singularWords(key)} `
  const contains = (lineKey: string) => lineKey.length >= 3 && hay.includes(` ${singularWords(lineKey)} `)
  const tiers: ((i: ListItem) => boolean)[] = [
    (i) => normKey(i.text) === key,
    (i) => parseTerms(i.search_terms).some((term) => normKey(term) === key),
    (i) => contains(normKey(i.text)),
    (i) => parseTerms(i.search_terms).some((term) => contains(normKey(term))),
  ]
  const open = list.filter((i) => !i.checked_at)
  const checked = list.filter((i) => i.checked_at)
  for (const rows of [open, checked]) {
    for (const match of tiers) {
      const hit = rows.find(match)
      if (hit) return hit
    }
  }
  return null
}

// The cached ['board'] list (empty when the cache is cold — callers that add from
// a scene outside HubLayout should still subscribe to BOARD_KEY themselves so the
// match happens before the round-trip; the server backstop in POST /api/list
// re-runs the same decision on every `match: true` add regardless).
function cachedList(qc: QueryClient): ListItem[] {
  return qc.getQueryData<{ list?: ListItem[] }>(BOARD_KEY)?.list ?? []
}

// What a flyer add did: the text of the EXISTING line it rode on, or null when it
// inserted a new one. Callers show it ("✓ sur « Pommes »") so a match doesn't read
// as nothing having happened — the flyer's product name never appears on the list.
export type AddedTo = string | null

// The POST answer: the row it landed on, plus whether the server's backstop
// matched an existing line (client cache cold / an offline replay).
interface AddResult {
  id: string
  text: string
  matched?: boolean
}

// Ask the server to run the same reuse-not-duplicate decision before it inserts
// (`match: true`) — the client decides first against its cached board list, but a
// cold cache or a replayed offline add has nothing to decide against.
async function addLine(qc: QueryClient, body: Record<string, unknown>): Promise<AddedTo> {
  const res = await writeWith<AddResult>(qc, 'list', {
    method: 'POST',
    body: { ...body, match: true },
    affectedKeys: [BOARD_KEY],
  }).catch(() => null)
  return res && !res.queued && res.data?.matched ? res.data.text : null
}

// Put `name` on the list without duplicating: an open match is already there (keep
// its search_terms and hand position), a checked match comes back to buy (uncheck —
// re-adding a ticked line must not spawn a twin beside the strike-through), and
// only a true miss inserts a new line. Returns the matched line's name, or null.
export async function ensureListLine(qc: QueryClient, name: string): Promise<AddedTo> {
  const existing = matchListItem(cachedList(qc), name)
  if (existing) {
    if (existing.checked_at)
      await writeWith(qc, 'list', {
        method: 'PATCH',
        body: { id: existing.id, checked: false },
        affectedKeys: [BOARD_KEY],
      }).catch(() => {})
    return existing.text
  }
  return addLine(qc, { text: name })
}

// Stage a deal: attach it to its grocery line, reusing an existing line or adding
// one. A checked match is unchecked too — the deal means "buy this again", so the
// line comes back instead of gaining a twin. Persists server-side and refreshes
// the board so every device sees it.
export async function stageDeal(qc: QueryClient, name: string, deal: Deal): Promise<AddedTo> {
  const existing = matchListItem(cachedList(qc), name)
  if (existing) {
    const body: { id: string; deal: Deal; checked?: boolean } = { id: existing.id, deal }
    if (existing.checked_at) body.checked = false
    await writeWith(qc, 'list', { method: 'PATCH', body, affectedKeys: [BOARD_KEY] }).catch(() => {})
    return existing.text
  }
  return addLine(qc, { text: name, deal })
}

// Unstage: keep the grocery line, drop its deal (remove it from the cashier set).
// Throws ApiError on a server rejection (offline still queues inside writeWith) so
// the edit scene can say "not saved" instead of closing as if it worked.
export async function unstageDeal(qc: QueryClient, itemId: string): Promise<void> {
  await writeWith(qc, 'list', { method: 'PATCH', body: { id: itemId, deal: null }, affectedKeys: [BOARD_KEY] })
}
