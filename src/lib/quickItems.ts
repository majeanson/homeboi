// Quick-add candidates: past buys (history) merged with due-soon predictions
// (ghosts), keyed by folded label so an item that's both collapses to one.
// Anything already on the open list is dropped — the panel only offers re-adds.
// Lives here (not inline in Liste) so both the Liste ⚡ badge count and the
// /liste/quick page read the exact same set off the shared caches.
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { BOARD_KEY, GHOSTS_KEY, HISTORY_KEY } from './queryKeys'
import { fetchGhosts } from './ghost'
import { parseTerms } from './picks'

// One re-add candidate: something bought before (history) and/or near its renewal
// point (a ghost 'due'/'soon'). Carries the flyer synonyms it last shopped with,
// so re-adding "Pain" restocks "baguette/bread" too.
export interface QuickItem {
  key: string
  label: string
  count: number
  searchTerms: string[]
  status?: 'due' | 'soon'
  always?: boolean // #27: a standing staple — shown first in a "Toujours" group
  // A tracked item that isn't near renewal yet (a 'later' ghost) — surfaced as a
  // quiet, opt-in "Souvent racheté" group. CALM: no count/cadence is ever shown,
  // only the label; buying still never enrolls anything (the strip only OFFERS).
  often?: boolean
  // Source keys, carried so the Quick-add page can swipe-remove a suggestion the
  // same way Réglages does (history prune / ghost mute / unpin). A candidate folds
  // several sources under one label, so it can carry more than one.
  historyKey?: string // purchase_log item_key → DELETE (drop from history)
  ghostKey?: string // ghost suggestion key → mute (hide from predictions)
  stapleKey?: string // standing staple item_key → unpin from the "Toujours" group
}

interface ListRow {
  id: string
  text: string
}
interface HistoryItem {
  key: string
  text: string
  count: number
  lastAt: number
  searchTerms?: string | null
}

// Accent/case-insensitive matching ("creme" finds "Crème").
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

export function useQuickItems(): QuickItem[] {
  // Reuses the shared ['board'] cache (no extra fetch); ghosts/history are quiet
  // best-effort layers — a failure just thins the panel, never breaks it.
  const { data: board } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<{ list: ListRow[] }>('board'), ...live })
  const { data: ghostsData } = useQuery({ queryKey: GHOSTS_KEY, queryFn: () => fetchGhosts(), retry: false })
  const { data: history } = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: () => api<{ items: HistoryItem[] }>('list?view=history').then((r) => r.items),
    retry: false,
    staleTime: 60_000,
  })

  const list = board?.list ?? []
  const ghosts = ghostsData?.ghosts ?? []
  const standing = ghostsData?.staples ?? []
  const openTexts = new Set(list.map((i) => fold(i.text)))
  const quickByLabel = new Map<string, QuickItem>()
  for (const h of history ?? []) {
    const f = fold(h.text)
    if (!f || openTexts.has(f)) continue
    quickByLabel.set(f, { key: f, label: h.text, count: h.count, searchTerms: parseTerms(h.searchTerms), historyKey: h.key })
  }
  for (const g of ghosts) {
    const f = fold(g.label)
    if (!f || openTexts.has(f)) continue
    // 'later' keeps no due/soon tag (it's not near renewal) — instead it flags the
    // quiet "Souvent racheté" group. A tracked recurring item belongs there, not in
    // the plain "Déjà acheté" history rest.
    const later = g.status === 'later'
    // Direct comparison (not `later ? …`) so TS narrows the else branch to 'due'|'soon'.
    const status = g.status === 'later' ? undefined : g.status
    const ex = quickByLabel.get(f)
    if (ex) {
      ex.status = status
      ex.ghostKey = g.key
      if (later) ex.often = true
    } else
      quickByLabel.set(f, { key: f, label: g.label, count: g.count, searchTerms: [], status, ghostKey: g.key, often: later })
  }
  // #27: standing staples take precedence — mark the "Toujours" group. If a staple
  // also shows up via history/ghost, fold them into one (keep the learned synonyms),
  // just flagged `always`; otherwise add it fresh. The server already drops staples
  // already on the open list.
  for (const s of standing) {
    const f = fold(s.label)
    if (!f || openTexts.has(f)) continue
    const ex = quickByLabel.get(f)
    if (ex) {
      ex.always = true
      ex.stapleKey = s.key
    } else quickByLabel.set(f, { key: f, label: s.label, count: 0, searchTerms: [], always: true, stapleKey: s.key })
  }
  const rankStatus = (s?: 'due' | 'soon') => (s === 'due' ? 0 : s === 'soon' ? 1 : 2)
  // Standing staples first (alphabetical), then the usual status/frequency order.
  return [...quickByLabel.values()].sort(
    (a, b) =>
      Number(!!b.always) - Number(!!a.always) ||
      (a.always && b.always ? a.label.localeCompare(b.label) : 0) ||
      rankStatus(a.status) - rankStatus(b.status) ||
      b.count - a.count ||
      a.label.localeCompare(b.label),
  )
}
