import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLang, useT } from '../i18n'
import { useSurface } from './surface'
import { formatAgo } from './format'
import { Icon } from '../components/Icon'
import { findEntry, pushEntry, removeEntry, type UndoEntry } from './undoStack'
import { setReplayRejectedNotifier } from './outbox'

// The app's undo surface: a small BOUNDED stack of recent undoable actions —
// newest shown as a pill, the rest reachable behind a "Récents (N)" toggle — so a
// mis-tap is recoverable more than once without an attention-pulling history
// panel (calm by design). Once the live writes have all committed the pill stays
// only as a quiet "Récents (N)" opener (the `--log` state) so the session history
// — the same quick list Réglages shows — is always one tap away from here too.
// Two kinds of action live in the one stack:
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
//
// The hold window is 15 s on purpose: long enough that several quick destructive
// taps in a row all stay live AT ONCE, so you can take back more than the last one
// (expand "Récents (N)" → each still-live row keeps its "Annuler"). Shorter and the
// earlier deletes commit before you notice you wanted them back.
const DEFAULT_UNDO_MS = 15000
// How long the toast BAR itself stays on screen after the last action. Matches the
// hold window so the toast is visible for exactly as long as anything it shows is
// still undoable; once it fires the bar auto-clears (the session log lives on for
// Réglages ▸ Récents — we just stop parking the bar over the UI / mobile nav).
const TOAST_DISMISS_MS = 15000

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
// (≤15s), while the log keeps the last few so you can glance back at "what just
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
  // Whether the toast BAR is on screen. Each action shows it and (re)arms a single
  // 15 s auto-dismiss; once that fires the bar hides itself even though the session
  // log (history) lives on for Réglages ▸ Récents. It used to linger forever as a
  // quiet "Récents" opener, parking over the UI — now it auto-clears.
  const [visible, setVisible] = useState(false)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // One-time reassurance (A-6, bmad/08): the undo promise is invisible until you
  // dare, so the very FIRST undoable action on this device carries one extra line
  // ("tout se défait"). Per-device localStorage flag; storage broken → no hint,
  // never a crash. It rides the first toast's lifetime, then never shows again.
  const [hintEligible, setHintEligible] = useState(() => {
    try {
      return localStorage.getItem('babillard-undo-hint-seen') !== '1'
    } catch {
      return false
    }
  })
  const hintMarked = useRef(false)

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

  // Show the bar and (re)arm the single auto-dismiss so it clears 15 s after the
  // LAST activity — a fresh action, an undo, or collapsing the expanded log. Hiding
  // the bar never touches `history`: the session log stays for Réglages ▸ Récents.
  const showBar = useCallback(() => {
    setVisible(true)
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(() => {
      dismissTimer.current = null
      setVisible(false)
      setExpanded(false)
      setHintEligible(false) // the first-toast hint retires with its bar
    }, TOAST_DISMISS_MS)
  }, [])

  // Pin the bar open (no auto-dismiss) while the user is reading the expanded log.
  const pinBar = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
    setVisible(true)
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
      // Show the bar and (re)start the 15 s auto-dismiss for this fresh action.
      showBar()
      // First undoable action ever on this device → the hint is now being shown;
      // persist that so it stays a one-time courtesy (write-once via the ref).
      if (!hintMarked.current) {
        hintMarked.current = true
        try {
          localStorage.setItem('babillard-undo-hint-seen', '1')
        } catch {
          /* private mode / storage full — the hint just repeats next session */
        }
      }
    },
    [clearTimer, showBar],
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

  // A message-only line — nothing to undo (kind 'notice', no Annuler). Same bar,
  // same session log, same auto-dismiss as the others; used by the outbox to say
  // a replay run had to drop rejected writes.
  const notice = useCallback(
    (message: string) => {
      const id = ++idRef.current
      add({ id, message, onUndo: () => {}, kind: 'notice' })
      timers.current.set(
        id,
        setTimeout(() => commit(id), DEFAULT_UNDO_MS),
      )
    },
    [add, commit],
  )

  // The offline outbox is a plain module (no React) — hand it this provider's
  // notice() so a replay that dropped 4xx-rejected writes surfaces ONE calm line.
  const noticeRef = useRef(notice)
  noticeRef.current = notice
  const replayFailedMsg = t.offline.replayFailed
  useEffect(() => {
    setReplayRejectedNotifier(() => noticeRef.current(replayFailedMsg))
    return () => setReplayRejectedNotifier(null)
  }, [replayFailedMsg])

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
      // Keep the bar up so you can keep taking back more than one in a row.
      showBar()
    },
    [apply, clearTimer, showBar],
  )

  // Whether an action can still be taken back (its entry is still in the live
  // stack). A 'notice' has nothing to undo, so it never reads as live.
  const isLive = useCallback(
    (id: number) => entriesRef.current.some((e) => e.id === id && e.kind !== 'notice'),
    [],
  )

  // "Tout effacer" from the expanded log: empty the whole session history. Clearing
  // is NOT an undo — any write still held commits (the action stands, like the timer
  // or teardown would finalize it); we just stop showing it. Then collapse.
  const clearAll = useCallback(() => {
    entriesRef.current.forEach((e) => {
      clearTimer(e.id)
      if (e.kind === 'deferred') e.onCommit?.()
    })
    entriesRef.current = []
    setEntries([])
    setHistory([])
    setExpanded(false)
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
    setVisible(false)
  }, [clearTimer])

  // Get the bar OUT OF THE WAY without touching anything it represents: hide it (and
  // collapse the log) and cancel the auto-dismiss timer. Unlike clearAll this finalizes
  // nothing itself — held writes keep their own timers and still commit, and the session
  // log survives for Réglages ▸ Récents. This is the "I need to tap what's underneath"
  // escape: the ✕ button and a double-tap on the bar both call it.
  const dismiss = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
    setExpanded(false)
    setVisible(false)
  }, [])

  // Double-tap the bar to dismiss it. dblclick is unreliable on touch (browsers eat it
  // for zoom), so track taps by hand: two pointerups within 300 ms, ignoring taps that
  // land on a button (those have their own jobs — Annuler, Récents, ✕).
  const lastTap = useRef(0)
  const onBarPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) {
        lastTap.current = 0
        return
      }
      const now = Date.now()
      if (now - lastTap.current < 300) {
        lastTap.current = 0
        dismiss()
      } else {
        lastTap.current = now
      }
    },
    [dismiss],
  )

  // Collapse the expanded panel only when the session log itself is empty — there's
  // nothing left to show. (It used to collapse as soon as the live stack dropped to
  // one entry, but the expanded view shows the full session LOG now, which outlives
  // the live writes, so it stays openable until the log clears on reload.)
  useEffect(() => {
    if (history.length === 0 && expanded) setExpanded(false)
  }, [history.length, expanded])

  // Safety net: if the app tears down with writes still held, commit them rather
  // than silently dropping them.
  useEffect(
    () => () => {
      entriesRef.current.forEach((e) => {
        if (e.kind === 'deferred') e.onCommit?.()
      })
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    },
    [],
  )

  const newest = entries[entries.length - 1]

  return (
    <ToastContext.Provider value={{ schedule, record, history, undo, isLive }}>
      {children}
      {/* The bar shows while `visible` — set on every action and (re)armed to clear
          15 s after the last one (pinned open while you read the expanded log). Once
          it auto-dismisses the session log still lives on in Réglages ▸ Récents; the
          bar just stops parking over the UI / mobile nav. */}
      {visible && (newest || history.length > 0) && (
        <div
          className={`undo-toast${expanded ? ' undo-toast--stack' : ''}${!newest && !expanded ? ' undo-toast--log' : ''}${hintEligible && newest && newest.kind !== 'notice' && !expanded ? ' undo-toast--first' : ''}`}
          data-surface={surface}
          role="status"
          onPointerUp={onBarPointerUp}
        >
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
              <div className="undo-toast__foot">
                <button
                  type="button"
                  className="undo-toast__more"
                  aria-expanded={true}
                  onClick={() => {
                    setExpanded(false)
                    showBar() // collapsed → restart the 15 s auto-dismiss
                  }}
                >
                  <Icon name="caret-down-bold" size={16} />
                  {t.undo.hide}
                </button>
                {/* Empty the whole session log — held writes commit (not undone). */}
                <button type="button" className="undo-toast__clear" onClick={clearAll}>
                  <Icon name="trash-bold" size={15} />
                  {t.undo.clearAll}
                </button>
              </div>
            </>
          ) : newest ? (
            <>
              {history.length > 1 && (
                <button
                  type="button"
                  className="undo-toast__more"
                  aria-expanded={false}
                  onClick={() => {
                    pinBar() // reading the log → don't auto-dismiss out from under them
                    setExpanded(true)
                  }}
                >
                  <Icon name="caret-up-bold" size={16} />
                  {t.undo.more(history.length)}
                </button>
              )}
              <span className="undo-toast__msg">{newest.message}</span>
              {newest.kind !== 'notice' && (
                <button type="button" className="undo-toast__btn" onClick={() => undo(newest.id)}>
                  {t.undo.action}
                </button>
              )}
              {hintEligible && newest.kind !== 'notice' && <span className="undo-toast__hint">{t.undo.firstHint}</span>}
            </>
          ) : (
            // No write is pending, but the session log isn't empty — keep a quiet
            // opener so the history (and any late-undo) is one tap away from here.
            <button
              type="button"
              className="undo-toast__more"
              aria-expanded={false}
              onClick={() => {
                pinBar()
                setExpanded(true)
              }}
            >
              <Icon name="clock-bold" size={16} />
              {t.undo.more(history.length)}
            </button>
          )}
          {/* Compact states park over the UI — offer an explicit way out. The expanded
              stack already has « Masquer » (collapse) + « Tout effacer », so no ✕ there. */}
          {!expanded && (
            <button
              type="button"
              className="undo-toast__dismiss"
              onClick={dismiss}
              aria-label={t.undo.dismiss}
              title={t.undo.dismiss}
            >
              <Icon name="x-bold" size={15} />
            </button>
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
