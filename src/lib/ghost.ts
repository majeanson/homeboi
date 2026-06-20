// Client view of the ghost list (predictive grocery suggestions). Thin wrappers
// over the one /api/ghost endpoint — the server does all the ranking/learning
// (see functions/_lib/ghost). Language is sent automatically via the X-Lang
// header in api(), so nothing to pass here.
import { api } from './api'

// A suggestion for the list strip: something near its renewal point ('due' /
// 'soon'), or a tracked item that's simply off the list right now ('later' —
// shown quietly so the whole ghost set stays one tap away).
export interface Ghost {
  key: string
  label: string
  status: 'due' | 'soon' | 'later'
  cadenceDays: number
  lastAt: number | null
  count: number
}

// A row in the Settings manage view: a staple or a consciously added item —
// nothing enters this set just by being bought.
export interface GhostManageItem {
  key: string
  label: string
  cadenceDays: number | null
  source: 'staple' | 'manual'
  muted: boolean
  standing: boolean // #27: pinned as an always-on list staple
  count: number
  lastAt: number | null
}

// #27: a standing list staple — pinned as always wanted, surfaced in the
// Quick-add "Toujours" group for a one-tap restock (deterministic, never
// auto-added). Just the key + label; synonyms come from purchase history if any.
export interface Staple {
  key: string
  label: string
}

// A frequent untracked buy, offered in Settings as a one-tap "track it?" —
// the deliberate opt-in that replaces the old auto-learning.
export interface GhostCandidate {
  key: string
  label: string
  count: number
  cadenceDays: number
}

export interface GhostPatch {
  key?: string
  label?: string
  cadenceDays?: number | null
  muted?: boolean
  standing?: boolean // #27
}

// The list strip read now also carries the household's standing staples (#27) for
// the Quick-add "Toujours" group. Default both to [] so a thin/failed response
// never breaks the caller.
export const fetchGhosts = () =>
  api<{ ghosts: Ghost[]; staples?: Staple[] }>('ghost').then((r) => ({ ghosts: r.ghosts, staples: r.staples ?? [] }))

export const fetchGhostManage = () =>
  api<{ items: GhostManageItem[]; candidates?: GhostCandidate[] }>('ghost?view=manage').then((r) => ({
    items: r.items,
    candidates: r.candidates ?? [],
  }))

export const patchGhost = (body: GhostPatch) => api('ghost', { method: 'PATCH', body })

export const deleteGhost = (key: string) => api('ghost', { method: 'DELETE', body: { key } })
