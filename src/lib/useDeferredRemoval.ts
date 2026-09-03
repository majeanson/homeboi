import { useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useUndoToast } from './toast'
import { onOutboxChange, outboxCount } from './outbox'
import { onTmpIdResolved, resolveId } from './tmpIds'

// The ONE bulletproof "calm delete / clear" for a LIVE-POLLED list — codified from
// the pattern La liste and À cocher already used, so every list shares one
// implementation instead of re-spelling it (and re-introducing the bug).
//
// The race it kills: a delete that only mutates the cache optimistically
// (setQueryData) is *overwritten* by the next background poll (these lists run
// `...live` → staleTime 0, ~10 s interval) while the real DELETE is still held
// behind the undo toast. The row flashes back, then disappears again once the
// write finally lands — exactly the "remove it fast and it comes back, then
// vanishes" glitch. A realtime nudge or another write's invalidate triggers the
// same resurrection.
//
// The fix: hold the row's id in a PENDING set and FILTER it out of the rendered
// list (`visible`), so NO refetch — poll, realtime, or invalidate — can resurrect
// it. Hold the real write behind the undo toast; on commit run it and AWAIT a
// refetch before un-hiding, so we only stop hiding once the server frame actually
// reflects the removal (un-hiding earlier flashes the stale cached row back for a
// frame). Undo just un-hides — the write never ran (conflict-free).
//
// CROSS-SURFACE: the pending set is a MODULE-level store, not per-component state,
// so a row shown in two places at once (e.g. a today-pinned todo on both the day
// page and the board's Aujourd'hui glance) hides on BOTH the instant either one
// deletes it — instead of lingering on the other surface for the whole 15 s undo
// window (it isn't deleted server-side until commit, so a poll would keep showing
// it). It's keyed by SCOPE = the query key's resource head (`queryKey[0]`, e.g.
// 'todos'), so every todo list shares one bucket while leftovers/pantry/… stay
// independent; the app's opaque ids are globally unique, so even a shared bucket
// can't hide the wrong row. The store also outlives the originating component, so
// navigating away mid-undo still un-hides correctly when the held write commits
// (the timer lives at the app root in lib/toast).

// scope -> the set of ids currently held out of view. Each mutation REPLACES the
// scope's Set (immutable) so useSyncExternalStore sees a new snapshot; an absent
// scope reads as the shared EMPTY singleton (a stable ref, so no render churn).
const buckets = new Map<string, ReadonlySet<string>>()
const EMPTY: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

const scopeOf = (queryKey: QueryKey): string => String(Array.isArray(queryKey) ? queryKey[0] : queryKey)
const emit = () => listeners.forEach((l) => l())
const snapshot = (scope: string): ReadonlySet<string> => buckets.get(scope) ?? EMPTY

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Hide/unhide track BOTH spellings of an id (the optimistic `tmp-…` one and its
// resolved server id, lib/tmpIds): a delete gestured on a tmp row must keep hiding
// the row after the refetch swaps in its real-id twin — otherwise the "deleted"
// item visibly comes back mid-undo, and worse, unhide can't find what hide added.
function hideIds(scope: string, ids: string[]): void {
  const next = new Set(buckets.get(scope) ?? EMPTY)
  ids.forEach((id) => {
    next.add(id)
    next.add(resolveId(id))
  })
  buckets.set(scope, next)
  emit()
}

function unhideIds(scope: string, ids: string[]): void {
  const cur = buckets.get(scope)
  if (!cur) return
  const next = new Set(cur)
  ids.forEach((id) => {
    next.delete(id)
    next.delete(resolveId(id))
  })
  if (next.size) buckets.set(scope, next)
  else buckets.delete(scope)
  emit()
}

// A tmp id hidden BEFORE its create resolved: add the freshly-learned real id
// beside it in every bucket (keeping the tmp spelling, which cached frames may
// still render), so the row stays hidden across the tmp→real swap.
onTmpIdResolved((tmpId, realId) => {
  let changed = false
  for (const [scope, set] of buckets) {
    if (!set.has(tmpId) || set.has(realId)) continue
    const next = new Set(set)
    next.add(realId)
    buckets.set(scope, next)
    changed = true
  }
  if (changed) emit()
})

// Un-hide `ids` only once a FRESH frame has actually arrived for the scope — not
// merely once a refetch has SETTLED. `refetchQueries` resolves even when the fetch
// ERRORED (Query keeps the last good frame), so un-hiding on settle alone repaints
// the deleted row from the pre-delete frame on a flaky connection: the exact loop
// behind « Pomme » being deleted three times while « Hors ligne » flickered
// (2026-08-27) — the row was gone server-side after the first delete, but every
// failed refetch un-hid it back out of stale cache. Freshness = every active query
// under the scope has a successful dataUpdatedAt AFTER the commit; until then the
// ids stay hidden and the ~10 s poll converges us.
//
// `confirmed` = the held write RESOLVED (the server accepted the delete, or it is
// safely queued in the outbox). This used to carry a 90 s cap that un-hid REGARDLESS,
// "so a row can never be hidden forever". That cap was the bug (Marc, 2026-09-02):
// on a phone whose reads were failing, six list rows whose DELETE had demonstrably
// landed — verified absent from production D1 — came back on screen, because the cap
// un-hid them against the stale pre-delete frame that Query was still holding. A
// delete we KNOW succeeded must never be undone by a frame that predates it.
//
// So there is no cap on the confirmed path: we wait for a successful frame however
// long it takes. Nothing is hidden "forever" — the pending set is session-only module
// state, so a reload clears it, and the row is gone server-side anyway, which means
// the very next successful frame simply doesn't contain it. If the write FAILED, the
// row genuinely still exists, so we un-hide at once rather than lie about it.
function unhideWhenFresh(qc: QueryClient, scope: string, ids: string[], t0: number, confirmed = true): void {
  if (!confirmed) {
    unhideIds(scope, ids)
    return
  }
  const cache = qc.getQueryCache()
  // `[].every(...)` is vacuously true — if nothing is currently watching this scope
  // (the list page was navigated away from before the undo timer fired), `findAll`
  // returns [] and the id used to un-hide on the spot with NO fresh frame ever
  // confirmed. The stale pre-delete cache was left untouched; the next time a query
  // for this scope mounted, Query painted that stale frame first — the deleted row
  // flashed back until its own fetch resolved. Require at least one active query so
  // an empty match means "not fresh yet", not "fresh": we then fall through to the
  // subscribe below, which catches the moment a query mounts again and only unhides
  // once ITS fetch actually lands past t0.
  const fresh = () => {
    const queries = cache.findAll({ queryKey: [scope], type: 'active' })
    return queries.length > 0 && queries.every((q) => q.state.dataUpdatedAt >= t0)
  }
  if (fresh()) {
    unhideIds(scope, ids)
    return
  }
  let done = false
  let giveUpTimer: ReturnType<typeof setTimeout>
  const stop = cache.subscribe(() => {
    if (done || !fresh()) return
    done = true
    clearTimeout(giveUpTimer)
    stop()
    unhideIds(scope, ids)
  })
  // Bound the LISTENER's lifetime, never the hide itself — un-hiding on a timeout
  // is exactly the 90 s-cap bug this function's own history warns about above. If
  // no fresh frame arrives for this long (the scope's page is never revisited for
  // the rest of the session — plausible on an always-on kiosk that can run for
  // weeks), stop WATCHING: the id stays hidden either way (harmless — session-only
  // state, and the row really is gone server-side), we just stop paying a
  // cache-subscribe callback, on every write anywhere in the app, for a scope
  // nobody's looking at anymore. Each orphaned delete would otherwise leak one
  // listener for the rest of the session.
  giveUpTimer = setTimeout(
    () => {
      if (done) return
      done = true
      stop()
    },
    10 * 60 * 1000,
  )
}

// Keep `ids` hidden until the offline outbox has fully drained (every queued write
// replayed on reconnect), then refetch + un-hide. On a poor/no connection a deferred
// delete is QUEUED, not yet on the server — un-hiding right away lets the next poll
// (or the stale offline frame) flash the row back, the exact "delete it and it comes
// back" glitch on a weak signal. Holding the un-hide until the write has actually
// synced keeps a deleted row gone. Idempotent + self-unsubscribing.
function unhideWhenSynced(qc: QueryClient, scope: string, ids: string[], refetch: () => Promise<unknown>): void {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    off()
    const t0 = Date.now()
    void refetch()
      .catch(() => {})
      .then(() => unhideWhenFresh(qc, scope, ids, t0))
  }
  const off = onOutboxChange(() => void outboxCount().then((n) => n === 0 && finish()))
  // It may already be drained (a replay beat us here) — check once now.
  void outboxCount().then((n) => n === 0 && finish())
}

// One displayed list (pass its query key); call `remove` for both single-row
// deletes and batch "clear checked", filter the rows with `visible`. Every list
// keying off the same resource head shares the pending set, so a delete on one
// surface hides the row on every surface showing it.
export function useDeferredRemoval(queryKey: QueryKey) {
  const qc = useQueryClient()
  const undo = useUndoToast()
  const scope = scopeOf(queryKey)
  const pending = useSyncExternalStore(subscribe, () => snapshot(scope), () => snapshot(scope))

  // Hide `ids` now (on every surface in this scope) and hold `commit` (the real
  // write) behind the undo toast. Undo un-hides them (the write never fires); the
  // timer's commit runs the write, then awaits the list refetch before un-hiding
  // so the row can't flash back.
  function remove(ids: string[], message: string, commit: () => Promise<unknown> | void) {
    if (ids.length === 0) return
    hideIds(scope, ids)
    undo({
      message,
      onUndo: () => unhideIds(scope, ids),
      onCommit: async () => {
        // Whether the held write actually LANDED decides what a missing frame means.
        // The call sites used to swallow this (`.catch(() => {})`), so the hook could
        // not tell "deleted, but the refetch failed" (keep hiding) from "the delete
        // itself failed" (show it again) — and defaulted to showing the row, which
        // resurrected rows that were already gone from the server.
        let confirmed = true
        try {
          await commit()
        } catch {
          confirmed = false
        }
        // Freshness fence: only a scope frame fetched AFTER this instant proves the
        // deletion reached the render data. (Captured after `commit`, so a fetch the
        // write's own invalidate races in just misses the fence — the row then stays
        // hidden one extra poll, which is harmless: it IS deleted.)
        const t0 = Date.now()
        // Refetch EVERY mounted surface in this scope (the prefix [scope] matches both
        // the board glance ['todos'] and any day page ['todos', <day>]).
        const refetch = () => qc.refetchQueries({ queryKey: [scope], type: 'active' })
        // On a poor/no connection `commit` QUEUED the write to the offline outbox
        // instead of reaching the server, so a refetch can't reflect the deletion yet —
        // un-hiding now would flash the row back on the next poll. If anything is still
        // queued, hold the un-hide until the outbox drains and re-confirm. Online (empty
        // outbox) we refetch now — and un-hide only once a FRESH frame landed (a
        // refetch that ERRORED kept the pre-delete frame; see unhideWhenFresh).
        if (!confirmed) {
          // The server refused (or the write blew up): the row is still there, so
          // stop hiding it — the list must not claim a delete that didn't happen.
          unhideIds(scope, ids)
        } else if ((await outboxCount()) > 0) {
          unhideWhenSynced(qc, scope, ids, refetch)
        } else {
          await refetch().catch(() => {})
          unhideWhenFresh(qc, scope, ids, t0)
        }
      },
    })
  }

  return {
    remove,
    isPending: (id: string) => pending.has(id),
    // Drop the rows whose removal is still settling — call on the rendered array.
    visible: <T extends { id: string }>(rows: T[]): T[] => rows.filter((r) => !pending.has(r.id)),
  }
}

// The ids currently held out of view for a scope, readable OUTSIDE React — for
// code that matches against a raw query cache (lib/picks' deal↔item matcher): a
// row mid-undo is still in the cache AND still on the server, but riding a deal
// on it loses the deal the moment the held delete commits. Match against
// `visible`-equivalent data, not the raw frame.
export function heldIds(queryKey: QueryKey): ReadonlySet<string> {
  return snapshot(scopeOf(queryKey))
}

// Exported for unit tests — the pure store plus the freshness fence, exercised
// without React. `unhideWhenFresh` carries the rule that a CONFIRMED delete is
// never undone by a stale frame, so it needs a door of its own to be guarded.
export const _deferredRemovalStore = { hideIds, unhideIds, snapshot, scopeOf, EMPTY, unhideWhenFresh }
