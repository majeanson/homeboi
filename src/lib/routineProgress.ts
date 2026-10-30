// A routine's progress for today, as PURE functions over `doneIdx` — the one place that
// decides what « done », « where are we » and « can I go back » mean, so the player, the
// toddler picker, the board card and the Maison tab can never disagree about it.
//
// Why this exists (the bug that earned it): the player counted `doneIdx.length`, and
// `doneIdx` is a bare array that a fast finger could write TWICE (two → taps landing
// before the first one's optimistic ✓ had reached a render both marked the same step).
// [1, 1] on a 2-card deck reads as `length >= cards` — « finished » with step 0 never
// done. The server stores a Set, so the duplicate only ever lived on the client, and
// only until the next poll quietly repaired it: exactly the « works, then sometimes it
// skips to the end » shape that is miserable to reproduce by hand. And an edit that
// SHRINKS the deck leaves indices past its end in the stored run (`[0,1,2,3]` on a
// three-step deck) which `length` happily counted as three finished steps. So: a step
// is done iff it is a distinct, in-range index. Everything below is that one rule.

// A running/just-finished step timer is { endsAt } (the unix second it reaches zero); a
// paused one is { left } (banked seconds). Remaining is always derived from the clock.
export type RoutineTimer = { endsAt: number } | { left: number }

/** The distinct, in-range done indices (order-preserving). */
export function normalizeDone(total: number, doneIdx: readonly number[] | undefined): number[] {
  const seen = new Set<number>()
  for (const i of doneIdx ?? []) {
    if (Number.isInteger(i) && i >= 0 && i < total) seen.add(i)
  }
  return [...seen]
}

/** How many steps are really done (never more than the deck has). */
export function doneCount(total: number, doneIdx: readonly number[] | undefined): number {
  return normalizeDone(total, doneIdx).length
}

/** Every step done, on a deck that has steps. An empty deck is never « finished ». */
export function isComplete(total: number, doneIdx: readonly number[] | undefined): boolean {
  return total > 0 && doneCount(total, doneIdx) >= total
}

/** The story position: the first not-yet-done step, else the last. -1 on an empty deck. */
export function currentStep(total: number, doneIdx: readonly number[] | undefined): number {
  if (total <= 0) return -1
  const done = new Set(normalizeDone(total, doneIdx))
  for (let i = 0; i < total; i++) if (!done.has(i)) return i
  return total - 1
}

/**
 * The step the ← rewinds to: the last DONE one before where we are. Normally cur - 1, but
 * computed rather than assumed — a deck edit can leave the run sparse (done [1] with step 0
 * undone puts us on 0 with nothing behind it). -1 = nowhere to go back to.
 */
export function previousDone(total: number, doneIdx: readonly number[] | undefined): number {
  const cur = currentStep(total, doneIdx)
  if (cur < 0) return -1
  const done = new Set(normalizeDone(total, doneIdx))
  // At the finish `cur` is the last step and it IS done — rewinding from there goes to it.
  const from = done.has(cur) ? cur : cur - 1
  for (let i = from; i >= 0; i--) if (done.has(i)) return i
  return -1
}

/**
 * Is the current step's countdown running right now? A child brushing teeth for two
 * minutes taps NOTHING for two minutes — the kiosk's « nobody is here » drift back to the
 * face picker must not read that as abandonment (it fired at 60 s, mid-brush).
 */
export function stepTimerRunning(
  total: number,
  doneIdx: readonly number[] | undefined,
  timers: Record<number, RoutineTimer> | undefined,
  nowSec: number,
): boolean {
  const cur = currentStep(total, doneIdx)
  const e = cur >= 0 ? timers?.[cur] : undefined
  return !!e && 'endsAt' in e && e.endsAt > nowSec
}

/** Mark one step done / not done. IDEMPOTENT: marking twice is marking once. */
export function withDone(doneIdx: readonly number[], idx: number, done: boolean): number[] {
  const rest = doneIdx.filter((i) => i !== idx)
  return done ? [...rest, idx] : rest
}

// ── The write side: one op = one PATCH to /api/routines, and `applyOp` is its optimistic
// twin. Pure and idempotent so the writer (lib/routineWrites) can re-apply the whole
// pending list on top of ANY frame a poll delivers mid-write without ever double-counting.
export type RoutineOp =
  | { kind: 'done'; routineId: string; cardIdx: number; done: boolean }
  | { kind: 'reset'; routineId: string }
  | { kind: 'timer'; routineId: string; cardIdx: number; timer: RoutineTimer | null }

interface RunShape {
  id: string
  doneIdx: number[]
  timers?: Record<number, RoutineTimer>
}

export function applyOp<T extends RunShape>(data: { routines: T[] }, op: RoutineOp): { routines: T[] } {
  return {
    ...data,
    routines: data.routines.map((r) => {
      if (r.id !== op.routineId) return r
      switch (op.kind) {
        case 'done':
          return { ...r, doneIdx: withDone(r.doneIdx, op.cardIdx, op.done) }
        case 'reset':
          // « Recommencer » wipes the whole day's run row server-side — ✓s AND timers.
          return { ...r, doneIdx: [], timers: {} }
        case 'timer': {
          const timers = { ...(r.timers ?? {}) }
          if (op.timer === null) delete timers[op.cardIdx]
          else timers[op.cardIdx] = op.timer
          return { ...r, timers }
        }
      }
    }),
  }
}

/** The PATCH body for an op (the wire shape functions/api/routines.ts reads). */
export function opBody(op: RoutineOp): Record<string, unknown> {
  switch (op.kind) {
    case 'done':
      return { routineId: op.routineId, cardIdx: op.cardIdx, done: op.done }
    case 'reset':
      return { routineId: op.routineId, reset: true }
    case 'timer':
      return { routineId: op.routineId, cardIdx: op.cardIdx, timer: op.timer }
  }
}
