// Client view of the ghost list (predictive grocery suggestions). Thin wrappers
// over the one /api/ghost endpoint — the server does all the ranking/learning
// (see functions/_lib/ghost). Language is sent automatically via the X-Lang
// header in api(), so nothing to pass here.
import { api } from './api'

// A suggestion for the list strip: something near its renewal point.
export interface Ghost {
  key: string
  label: string
  status: 'due' | 'soon'
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
  count: number
  lastAt: number | null
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
}

export const fetchGhosts = () => api<{ ghosts: Ghost[] }>('ghost').then((r) => r.ghosts)

export const fetchGhostManage = () =>
  api<{ items: GhostManageItem[]; candidates?: GhostCandidate[] }>('ghost?view=manage').then((r) => ({
    items: r.items,
    candidates: r.candidates ?? [],
  }))

export const patchGhost = (body: GhostPatch) => api('ghost', { method: 'PATCH', body })

export const deleteGhost = (key: string) => api('ghost', { method: 'DELETE', body: { key } })
