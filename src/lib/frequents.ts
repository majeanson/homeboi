// Frequents-first ranking for EntityCombobox (C-20, bmad/08). A tiny per-DEVICE
// pick counter so the things this household actually picks (the same four
// people, the usual suppers) rise to the top of a combobox's RESTING list —
// the order before any typing; the type-to-filter order is untouched.
//
// Calm + privacy by construction: localStorage only (never synced, never sent),
// never rendered as a number — it is an ordering, not a metric. Storage broken
// (private mode) → ranking stays neutral, nothing throws.

const LS_KEY = 'babillard-frequents'
// Per-scope cap: enough for a household's real vocabulary, small enough that
// the JSON stays trivial. Beyond it the stalest entries fall off.
const MAX_PER_SCOPE = 80
// Recency half-life: a pick's weight halves every 30 days, so "often, lately"
// beats "ten times, last winter" without ever hard-expiring anything.
const HALF_LIFE_MS = 30 * 86_400_000

interface Entry {
  n: number // times picked
  at: number // last picked (ms epoch)
}
type Store = Record<string, Record<string, Entry>>

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

/** Record one pick of option `id` within `scope` (e.g. 'meal', 'event-who'). */
export function bumpFrequent(scope: string, id: string): void {
  try {
    const store = load()
    const map = (store[scope] ??= {})
    const entry = (map[id] ??= { n: 0, at: 0 })
    entry.n += 1
    entry.at = Date.now()
    const ids = Object.keys(map)
    if (ids.length > MAX_PER_SCOPE) {
      ids.sort((a, b) => map[a].at - map[b].at)
      for (const stale of ids.slice(0, ids.length - MAX_PER_SCOPE)) delete map[stale]
    }
    localStorage.setItem(LS_KEY, JSON.stringify(store))
  } catch {
    /* private mode / storage full — the ranking just stays neutral */
  }
}

/** Decayed score per option id for `scope`; {} when nothing was ever picked. */
export function frequentScores(scope: string): Record<string, number> {
  try {
    const map = load()[scope]
    if (!map) return {}
    const now = Date.now()
    const out: Record<string, number> = {}
    for (const [id, e] of Object.entries(map)) {
      out[id] = e.n * Math.pow(0.5, (now - e.at) / HALF_LIFE_MS)
    }
    return out
  } catch {
    return {}
  }
}
