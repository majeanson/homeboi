import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLang, useT } from '../i18n'
import { useSurface } from './surface'
import { formatAgo } from './format'
import { Icon } from '../components/Icon'
import { findEntry, pushEntry, removeEntry, type UndoEntry } from './undoStack'

// The app's undo surface: a small BOUNDED stack of recent undoable actions —
// newest shown as a pill, the rest reachable behind a "Récents (N)" toggle — so a
// mis-tap is recoverable more than once without an attention-pulling history
// panel (calm by design). Two kinds of action live in the one stack:
//
//   • DEFERRED (schedule) — the calm delete: a caller hides the thing at once and
//     hands us the real write; we hold it for a few seconds. Tap Undo and the
//     write never happens (the caller restores the UI). This is conflict-free —
//     nothing reached the server — so it's the default for every destructive tap.
//   • COMPENSATING (record) — for an action that must show INSTANTLY (e.g. adding
//     to the list): the write already landed, so Undo runs a guarded inverse.
//
// The provider lives at the app root, so timers survive route changes (leaving a
// page still commits its held writes), and a teardown commits anything pending.
const DEFAULT_UNDO_MS = 7000

interface UndoRequest {
  message: string
  onUndo: () => void
  onCommit: () => void
  durationMs?: number
}
interface RecordRequest {
  message: string
  onUndo: () => void
}
// One line in the calm "Récents" session log (#38): what happened + when. Mirrors
// the undo stack but OUTLIVES it — the stack drops an entry once its write commits
// (≤7s), while the log keeps the last few so you can glance back at "what just
// happened" for the session (reachable from the toast and Réglages). Session-only,
// in-memory: it clears on reload (no server audit log — calm tenet, no history DB).
export interface RecentItem {
  id: number
  message: string
  at: number // ms timestamp (Date.now at the moment it was queued)
}
const MAX_RECENTS = 15

interface ToastApi {
  schedule: (req: UndoRequest) => void
  record: (req: RecordRequest) => void
  // The session log + its late-undo: history is newest-LAST; undo cancels/reverses
  // an entry still in its hold window; isLive says whether that's still possible.
  history: RecentItem[]
  undo: (id: number) => void
  isLive: (id: number) => boolean
}
const ToastContext = createContext<ToastApi>({
  schedule: () => {},
  record: () => {},
  history: [],
  undo: () => {},
  isLive: () => false,
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const { lang } = useLang()
  // The mobile shell has a fixed bottom tab bar; the toast must ride ABOVE it (CSS
  // lifts it by surface) or it covers the centre tabs and eats their taps.
  const { surface } = useSurface()
  // entriesRef is the source of truth for timer/teardown logic (read inside
  // callbacks); `entries` drives rendering. `apply` keeps them in lockstep and,
  // by living outside render, sidesteps StrictMode's double-invoked updaters.
  const entriesRef = useRef<UndoEntry[]>([])
  const [entries, setEntries] = useState<UndoEntry[]>([])
  // The session log (#38): newest-last, capped. Separate from the live undo stack —
  // it keeps committed actions too, so the "Récents" review can show "what happened"
  // after the held write has already landed.
  const [history, setHistory] = useState<RecentItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const idRef = useRef(0)
  const [expanded, setExpanded] = useState(false)

  const apply = useCallback((producer: (cur: UndoEntry[]) => UndoEntry[]) => {
    const next = producer(entriesRef.current)
    entriesRef.current = next
    setEntries(next)
  }, [])

  const clearTimer = useCallback((id: number) => {
    const tm = timers.current.get(id)
    if (tm) {
      clearTimeout(tm)
      timers.current.delete(id)
    }
  }, [])

  // Finalize an entry when its timer fires: drop it from the stack and, for a
  // deferred entry, run its held write (a compensating entry has none — it just
  // dismisses). No-op if it was already undone/removed.
  const commit = useCallback(
    (id: number) => {
      const e = findEntry(entriesRef.current, id)
      clearTimer(id)
      if (!e) return
      apply((cur) => removeEntry(cur, id))
      e.onCommit?.()
    },
    [apply, clearTimer],
  )

  // Shared push for both kinds: add the entry and, if that overflows the cap,
  // commit the held writes of any deferred entries that rolled off the bottom.
  const add = useCallback(
    (entry: UndoEntry) => {
      const { entries: next, committed } = pushEntry(entriesRef.current, entry)
      committed.forEach((e) => {
        clearTimer(e.id)
        e.onCommit?.()
      })
      entriesRef.current = next
      setEntries(next)
      // Mirror into the session log (keeps committed ones the live stack drops).
      setHistory((h) => [...h, { id: entry.id, message: entry.message, at: Date.now() }].slice(-MAX_RECENTS))
    },
    [clearTimer],
  )

  const schedule = useCallback(
    (req: UndoRequest) => {
      const id = ++idRef.current
      add({ id, message: req.message, onUndo: req.onUndo, onCommit: req.onCommit, kind: 'deferred' })
      timers.current.set(
        id,
        setTimeout(() => commit(id), req.durationMs ?? DEFAULT_UNDO_MS),
      )
    },
    [add, commit],
  )

  const record = useCallback(
    (req: RecordRequest) => {
      const id = ++idRef.current
      add({ id, message: req.message, onUndo: req.onUndo, kind: 'compensating' })
      // Same lifetime as a deferred toast: auto-dismiss after the window. There's
      // no held write to commit (the action already landed) — commit() just drops
      // the entry. Without this the pill would linger until 6 more actions evict
      // it, parking over the UI (and the mobile nav) indefinitely.
      timers.current.set(
        id,
        setTimeout(() => commit(id), DEFAULT_UNDO_MS),
      )
    },
    [add, commit],
  )

  // Undo one entry: cancel its timer (so a deferred write never fires) and run
  // onUndo — which restores the UI for a deferred entry, or runs the inverse for
  // a compensating one.
  const undo = useCallback(
    (id: number) => {
      const e = findEntry(entriesRef.current, id)
      if (!e) return
      clearTimer(id)
      apply((cur) => removeEntry(cur, id))
      e.onUndo()
      // It was reversed → drop it from the session log (it didn't ultimately happen).
      setHistory((h) => h.filter((r) => r.id !== id))
    },
    [apply, clearTimer],
  )

  // Whether an action can still be taken back (its entry is still in the live stack).
  const isLive = useCallback((id: number) => entriesRef.current.some((e) => e.id === id), [])

  // Nothing left to expand once we're down to a single pill.
  useEffect(() => {
    if (entries.length <= 1 && expanded) setExpanded(false)
  }, [entries.length, expanded])

  // Safety net: if the app tears down with writes still held, commit them rather
  // than silently dropping them.
  useEffect(
    () => () => {
      entriesRef.current.forEach((e) => {
        if (e.kind === 'deferred') e.onCommit?.()
      })
    },
    [],
  )

  const newest = entries[entries.length - 1]

  return (
    <ToastContext.Provider value={{ schedule, record, history, undo, isLive }}>
      {children}
      {newest && (
        <div className={`undo-toast${expanded ? ' undo-toast--stack' : ''}`} data-surface={surface} role="status">
          {expanded ? (
            <>
              {/* The session log (#38): newest first, with a calm relative time.
                  Still-undoable rows keep "Annuler"; committed ones are a quiet
                  record of what happened. */}
              <ul className="undo-toast__list">
                {history
                  .slice()
                  .reverse()
                  .map((e) => (
                    <li key={e.id} className="undo-toast__row">
                      <span className="undo-toast__msg">{e.message}</span>
                      <span className="undo-toast__ago mono">{formatAgo(e.at, lang)}</span>
                      {isLive(e.id) && (
                        <button type="button" className="undo-toast__btn" onClick={() => undo(e.id)}>
                          {t.undo.action}
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                className="undo-toast__more"
                aria-expanded={true}
                onClick={() => setExpanded(false)}
              >
                <Icon name="caret-down-bold" size={16} />
                {t.undo.hide}
              </button>
            </>
          ) : (
            <>
              {history.length > 1 && (
                <button
                  type="button"
                  className="undo-toast__more"
                  aria-expanded={false}
                  onClick={() => setExpanded(true)}
                >
                  <Icon name="caret-up-bold" size={16} />
                  {t.undo.more(history.length)}
                </button>
              )}
              <span className="undo-toast__msg">{newest.message}</span>
              <button type="button" className="undo-toast__btn" onClick={() => undo(newest.id)}>
                {t.undo.action}
              </button>
            </>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}

// Schedule a DEFERRED undoable action (write held a few seconds). Reads as
// `undo({ message, onUndo, onCommit })` at the call site.
export const useUndoToast = () => useContext(ToastContext).schedule

// Record a COMPENSATING undoable action (write already applied; onUndo is the
// guarded inverse). For changes that must appear instantly, like adding to the list.
export const useRecordUndo = () => useContext(ToastContext).record

// The calm "Récents" session log (#38): the last few actions this session, with a
// late-undo for any still in their hold window. Read by the toast's expanded view
// and the Réglages "Récents" review (RecentsPanel). Session-only, no server log.
export const useRecents = () => {
  const { history, undo, isLive } = useContext(ToastContext)
  return { history, undo, isLive }
}
