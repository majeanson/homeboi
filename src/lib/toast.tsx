import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
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
interface ToastApi {
  schedule: (req: UndoRequest) => void
  record: (req: RecordRequest) => void
}
const ToastContext = createContext<ToastApi>({ schedule: () => {}, record: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT()
  // entriesRef is the source of truth for timer/teardown logic (read inside
  // callbacks); `entries` drives rendering. `apply` keeps them in lockstep and,
  // by living outside render, sidesteps StrictMode's double-invoked updaters.
  const entriesRef = useRef<UndoEntry[]>([])
  const [entries, setEntries] = useState<UndoEntry[]>([])
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

  // Commit a deferred entry's held write and drop it (timer fired). No-op if it
  // was already undone/removed.
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
    },
    [add],
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
    },
    [apply, clearTimer],
  )

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
    <ToastContext.Provider value={{ schedule, record }}>
      {children}
      {newest && (
        <div className={`undo-toast${expanded ? ' undo-toast--stack' : ''}`} role="status">
          {expanded ? (
            <>
              <ul className="undo-toast__list">
                {entries
                  .slice()
                  .reverse()
                  .map((e) => (
                    <li key={e.id} className="undo-toast__row">
                      <span className="undo-toast__msg">{e.message}</span>
                      <button type="button" className="undo-toast__btn" onClick={() => undo(e.id)}>
                        {t.undo.action}
                      </button>
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
              {entries.length > 1 && (
                <button
                  type="button"
                  className="undo-toast__more"
                  aria-expanded={false}
                  onClick={() => setExpanded(true)}
                >
                  <Icon name="caret-up-bold" size={16} />
                  {t.undo.more(entries.length)}
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
