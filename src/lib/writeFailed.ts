import { ApiError } from './api'

// Kept a LEAF on purpose: the toast bar (eager, always loaded) registers the notifier, and
// importing it from lib/write dragged that whole module — outbox, tmp-id registry, tour
// counters — into the door's static closure (check-bundle: 141 KB over a 32 KB cap).
// What a fire-and-forget write does with its REJECTION — the one named replacement for
// the anonymous `.catch(() => {})` that used to sit on ~100 write call sites. Those
// swallowed a real server refusal (a 4xx/5xx — the server WAS reachable and said no;
// a transport failure never rejects, writeWith queues it), so the optimistic row
// snapped back on the next refetch with no word said: « I swiped it and it came
// back » is this family, 2026-10-06. Now the user hears ONE calm line (« Pas
// enregistré — réessaie. ») on the same bar as every other notice. A 401 stays quiet
// on purpose — the auth-lost path owns that screen. swallow-rule.test.ts fails the
// build on a new anonymous swallow.
let writeFailedNotifier: (() => void) | null = null
export function setWriteFailedNotifier(fn: (() => void) | null): void {
  writeFailedNotifier = fn
}
export function writeFailed(err: unknown): void {
  if (err instanceof ApiError && err.status !== 401) writeFailedNotifier?.()
}

// For a write whose FOLLOW-UP assumes it landed (a compensating « Annuler », a scene that
// closes): true on success, false after reporting the failure — so the caller returns
// instead of offering to undo something that never happened.
export async function wrote(p: Promise<unknown>): Promise<boolean> {
  try {
    await p
    return true
  } catch (err) {
    writeFailed(err)
    return false
  }
}

// A write whose caller reads null as « it did not happen »: the rejection is reported (one
// calm notice) and the caller still gets null to branch on.
export async function writeOrNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch (err) {
    writeFailed(err)
    return null
  }
}
