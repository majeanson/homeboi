// The "cashier list" now lives ON the shared grocery list: a staged flyer deal is
// stored against its line (list_items.deal_json), so it syncs across every device
// via the board read and clears automatically when the item is checked off. These
// helpers stage / unstage a deal and derive the cashier Pick[] from the list —
// no per-device localStorage store anymore.
import { type QueryClient } from '@tanstack/react-query'
import { api } from './api'
import { type Deal, type Pick } from './deals'
import { normKey } from './cookable'

// A list row as it arrives in the ['board'] cache (deal_json = the staged deal).
export interface ListItem {
  id: string
  text: string
  source?: string
  added_by?: string | null
  deal_json?: string | null
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

// The cashier stepper's Pick[]: every open list line that carries a deal.
export function pickListFrom(items: ListItem[]): Pick[] {
  return items
    .map((i) => {
      const deal = parseDeal(i.deal_json)
      return deal ? { itemId: i.id, itemText: i.text, deal } : null
    })
    .filter((p): p is Pick => p != null)
}

// The id of an OPEN list item matching `name` (normalized), from the ['board']
// cache — so staging reuses an existing line instead of inserting a duplicate.
export function existingListId(qc: QueryClient, name: string): string | null {
  const key = normKey(name)
  if (!key) return null
  const board = qc.getQueryData<{ list?: ListItem[] }>(['board'])
  return board?.list?.find((i) => normKey(i.text) === key)?.id ?? null
}

// Stage a deal: attach it to its grocery line, reusing an existing line or adding
// one. Persists server-side and refreshes the board so every device sees it.
export async function stageDeal(qc: QueryClient, name: string, deal: Deal): Promise<void> {
  const existing = existingListId(qc, name)
  if (existing) {
    await api('list', { method: 'PATCH', body: { id: existing, deal } }).catch(() => {})
  } else {
    await api('list', { method: 'POST', body: { text: name, deal } }).catch(() => {})
  }
  qc.invalidateQueries({ queryKey: ['board'] })
}

// Unstage: keep the grocery line, drop its deal (remove it from the cashier set).
export async function unstageDeal(qc: QueryClient, itemId: string): Promise<void> {
  await api('list', { method: 'PATCH', body: { id: itemId, deal: null } }).catch(() => {})
  qc.invalidateQueries({ queryKey: ['board'] })
}
