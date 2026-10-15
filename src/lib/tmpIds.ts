// E-41's missing half: the session-wide tmp→real id registry.
//
// An optimistic create renders a `tmp-…` row immediately; the server answers with
// the real id. The outbox already rewrites tmp ids — but only for ops ALREADY
// QUEUED when the create replays. Anything that captures a tmp id and acts on it
// LATER falls through the crack, and the flagship case lost data: swipe-delete a
// row while its create is still reconciling → the deferred delete fires 15 s
// later with `{id: 'tmp-…'}` → `DELETE /api/list` matches zero rows and answers
// 200 → the real row survives forever ("I delete items and they come back").
//
// So: whoever learns a tmp id's real id records it here (undoCreate's online
// create, the outbox's replay), and the write chokepoint (lib/write) + the
// deferred-removal store resolve through it at ACT time. In-memory, session-only
// on purpose: a mapping learned before a reload only matters to closures from the
// same session, and cross-reload queued ops are the outbox rewrite's job.

const map = new Map<string, string>()
type Listener = (tmpId: string, realId: string) => void
const listeners = new Set<Listener>()

export const isTmpId = (id: string): boolean => id.startsWith('tmp-')

// The one spelling of an optimistic row id (Liste + TodoSection used to mint the
// same shape by hand). Only `tmp-[a-z0-9-]` — no JSON-special characters — so the
// registry's and the outbox's string-level rewrites stay exact.
export const mintTmpId = (): string => `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`

// Record that `tmpId` stood in for the server row `realId`, and tell subscribers
// (the deferred-removal store migrates its hidden ids so a mid-undo row stays
// hidden when the refetch swaps the tmp row for the real one).
export function recordTmpId(tmpId: string, realId: string): void {
  if (!isTmpId(tmpId) || isTmpId(realId) || tmpId === realId) return
  map.set(tmpId, realId)
  listeners.forEach((l) => l(tmpId, realId))
}

// The real id for `id`, or `id` itself when it never was (or isn't yet) a known tmp id.
export function resolveId(id: string): string {
  return map.get(id) ?? id
}

export function onTmpIdResolved(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// Substitute every KNOWN tmp id inside a serialized path/body. Tmp ids are
// `tmp-[a-z0-9-]+` — no JSON-special characters — so a string-level replace is
// exact (the same reasoning as the outbox's rewriteTmpId).
export function resolveTmpIdsIn(text: string): string {
  if (!text.includes('tmp-')) return text
  let out = text
  for (const [tmpId, realId] of map) if (out.includes(tmpId)) out = out.split(tmpId).join(realId)
  return out
}

// Blob-safe body variant: a JSON body round-trips through the string replace only
// when it actually references a known tmp id; a Blob (media upload) passes through.
export function resolveTmpIdsInBody(body: unknown): unknown {
  if (body === undefined || body === null || body instanceof Blob) return body
  const s = JSON.stringify(body)
  const r = resolveTmpIdsIn(s)
  return r === s ? body : (JSON.parse(r) as unknown)
}

// A `tmp-…` row only means something while its create is still alive: in flight this
// session, or queued in the outbox (which carries `tmpId`). Persisted to the offline
// snapshot with neither, it is a phantom the next boot paints as a real line — and a
// swipe on it DELETEs an id the server never had (« the items always come back »,
// 2026-10-06). So the snapshot is written WITHOUT every array element shaped
// `{id: 'tmp-…'}` whose id is not in `keep` (the outbox's pending tmp ids). Pure; walks
// plain JSON (a dehydrated query state) and returns the input untouched when nothing
// matched, so an ordinary snapshot costs one pass and no copies.
export function stripOrphanTmpRows<T>(value: T, keep: ReadonlySet<string>): T {
  if (Array.isArray(value)) {
    let changed = false
    const out: unknown[] = []
    for (const el of value) {
      const id = el && typeof el === 'object' ? (el as { id?: unknown }).id : undefined
      if (typeof id === 'string' && isTmpId(id) && !keep.has(id)) {
        changed = true
        continue
      }
      const next = stripOrphanTmpRows(el, keep)
      if (next !== el) changed = true
      out.push(next)
    }
    return (changed ? out : value) as T
  }
  if (value && typeof value === 'object') {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = stripOrphanTmpRows(v, keep)
      if (next !== v) changed = true
      out[k] = next
    }
    return (changed ? out : value) as T
  }
  return value
}

// Unit-test door: the registry is module-level state, so tests reset it between cases.
export function _resetTmpIds(): void {
  map.clear()
}
