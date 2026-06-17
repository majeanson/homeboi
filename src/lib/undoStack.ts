// The pure, timer-free heart of the undo stack (the provider in lib/toast.tsx
// owns the React state + setTimeout; this owns the bookkeeping so it's unit
// testable). The stack holds the last few undoable actions — newest LAST — so
// you can step back more than once, while staying bounded and calm (no infinite
// history, no server-side audit log). Two entry KINDS share the one stack:
//
//   • deferred     — the write hasn't happened yet; it's held behind a timer.
//                    Undo cancels it (free, no inverse, can't conflict). When the
//                    timer fires OR the entry is evicted past the cap, onCommit
//                    runs and the entry drops off.
//   • compensating — the write already applied; onUndo runs a guarded INVERSE.
//                    No timer: it lives until the cap pushes it off (or undo).
//
// Keeping eviction pure (it just REPORTS which deferred entries must commit) lets
// the provider fire the side effects, so StrictMode's double-invoked reducers
// can't double-commit a write.

type UndoKind = 'deferred' | 'compensating'

export interface UndoEntry {
  id: number
  message: string
  // Restore the visible/data effect: cancel a held write (deferred) or run the
  // inverse API call (compensating). Always also un-does the optimistic UI.
  onUndo: () => void
  // deferred only — the real write, run on commit (timer fired or cap-evicted).
  onCommit?: () => void
  kind: UndoKind
}

// How many actions stay undoable at once. Small on purpose: a household tablet
// glances, it doesn't audit. Past this the oldest deferred write just commits.
export const MAX_UNDO_ENTRIES = 6

// Append an entry. If that overflows the cap, drop the OLDEST entries and report
// any deferred ones among them so the caller can commit their held writes now
// (a compensating entry that rolls off is simply forgotten — its write already
// landed and it's too old to take back).
export function pushEntry(
  entries: UndoEntry[],
  entry: UndoEntry,
): { entries: UndoEntry[]; committed: UndoEntry[] } {
  const next = [...entries, entry]
  const committed: UndoEntry[] = []
  while (next.length > MAX_UNDO_ENTRIES) {
    const evicted = next.shift()
    if (evicted && evicted.kind === 'deferred') committed.push(evicted)
  }
  return { entries: next, committed }
}

export function removeEntry(entries: UndoEntry[], id: number): UndoEntry[] {
  return entries.filter((e) => e.id !== id)
}

export function findEntry(entries: UndoEntry[], id: number): UndoEntry | undefined {
  return entries.find((e) => e.id === id)
}
