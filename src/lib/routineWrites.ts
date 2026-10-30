import { partialMatchKey, type QueryClient } from '@tanstack/react-query'
import { isGuest } from './device'
import { onOutboxChange, outboxCount } from './outbox'
import { ROUTINES_KEY } from './queryKeys'
import { applyOp, opBody, type RoutineOp, type RoutineTimer } from './routineProgress'
import { writeWith } from './write'
import { writeFailed } from './writeFailed'

// Every write the routine player makes (tick a step, rewind, « Recommencer », a step's
// countdown) goes through HERE, because a three-year-old on a cheap tablet is the
// harshest client this app has and the player was built on the gentlest assumptions:
//
//   · taps arrive faster than a render. The old path painted the ✓ after an `await`, so
//     two taps landing in one task both read the SAME current step. Now the cache is
//     painted SYNCHRONOUSLY inside the tap, so the next tap — however soon — reads where
//     the story really is (`useRoutineWrites().current`).
//   · a poll can beat the write to the server. It answers with yesterday's picture and
//     the ✓ flips back on screen (and, worse, the story steps backwards under the finger
//     that is about to tap →). While any op is in flight we re-apply every pending op on
//     top of whatever frame lands. Ops are idempotent (routineProgress.applyOp), so
//     re-applying can't double-count.
//   · PATCHes can overtake each other on the wire, and ✓/un-✓ of the SAME step reordered is
//     a different final state. One chain, in tap order.
//   · a write queued offline hasn't reached the server yet; the next poll would repaint
//     the old state over it. Hold the op until the outbox has drained.
//
// Module-level on purpose: the chain and the pending list outlive a component. A child who
// taps ✕ mid-write unmounts the player, and the write still has to land in order.

const HOLD_QUEUED_MAX_MS = 120_000

const pending: RoutineOp[] = []
let tail: Promise<unknown> = Promise.resolve()
let stopWatching: (() => void) | null = null

interface RoutinesFrame {
  routines: Array<{ id: string; doneIdx: number[]; timers?: Record<number, RoutineTimer> }>
}

function paint(qc: QueryClient) {
  qc.setQueryData<RoutinesFrame>(ROUTINES_KEY, (old) =>
    old ? pending.reduce<RoutinesFrame>((d, op) => applyOp(d, op), old) : old,
  )
}

// While anything is pending, repaint it over every FETCHED frame for the routines key.
function watch(qc: QueryClient) {
  if (stopWatching) return
  stopWatching = qc.getQueryCache().subscribe((ev) => {
    // A fetched frame only: setQueryData dispatches 'success' too (manual) and
    // repainting on our own paint would recurse forever.
    if (ev.type !== 'updated' || ev.action.type !== 'success' || ev.action.manual) return
    if (!partialMatchKey(ev.query.queryKey, ROUTINES_KEY)) return
    paint(qc)
  })
}

function release(op: RoutineOp) {
  const at = pending.indexOf(op)
  if (at >= 0) pending.splice(at, 1)
  if (pending.length === 0) {
    stopWatching?.()
    stopWatching = null
  }
}

// A queued (offline) write is not on the server yet: keep painting it until the outbox
// is empty — or give up after a while so a write the server keeps refusing can't pin a
// picture the household will never see.
function releaseWhenDrained(op: RoutineOp) {
  let off: (() => void) | null = null
  const done = () => {
    off?.()
    clearTimeout(cap)
    release(op)
  }
  const cap = setTimeout(done, HOLD_QUEUED_MAX_MS)
  off = onOutboxChange(() => {
    void outboxCount().then((n) => {
      if (n === 0) done()
    })
  })
}

/** Paint `op` into the cache NOW, then send it — in order, retried by the outbox offline. */
export function sendRoutineOp(qc: QueryClient, op: RoutineOp): void {
  // A read-only guest never commits progress: no paint, no write (writeWith refuses too).
  if (isGuest()) return
  pending.push(op)
  watch(qc)
  paint(qc)
  tail = tail
    .then(() => writeWith(qc, 'routines', { method: 'PATCH', body: opBody(op), affectedKeys: [ROUTINES_KEY] }))
    .then(
      (res) => {
        if (res.queued) releaseWhenDrained(op)
        else release(op)
      },
      (err) => {
        // The server said no: stop painting it. writeWith already asked the key to
        // refetch, which puts the truth back on screen; say so once, calmly.
        release(op)
        writeFailed(err)
      },
    )
}

/** Where a routine's done list stands RIGHT NOW (cache, painted synchronously), else `fallback`. */
export function currentDone(qc: QueryClient, routineId: string, fallback: number[]): number[] {
  const frame = qc.getQueryData<RoutinesFrame>(ROUTINES_KEY)
  return frame?.routines.find((r) => r.id === routineId)?.doneIdx ?? fallback
}

/** Test seam: forget everything in flight. */
export function resetRoutineWritesForTest(): void {
  pending.length = 0
  tail = Promise.resolve()
  stopWatching?.()
  stopWatching = null
}
