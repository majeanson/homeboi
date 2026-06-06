import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'

// A single "undo" toast with a DEFERRED commit — the calm version of an
// optimistic action. A caller removes the thing from the UI at once, then asks
// us to hold the real write for a few seconds: tap Undo and the write never
// happens (the caller restores the UI); ignore it and we commit. This way a
// mis-tap costs nothing and there's no compensating round-trip.
//
// One toast at a time: scheduling a new action commits any still-pending one
// immediately (you've moved on). The provider lives at the app root, so its
// timer survives route changes — leaving the page still commits the write.
interface UndoRequest {
  message: string
  onUndo: () => void
  onCommit: () => void
  durationMs?: number
}
interface ToastApi {
  schedule: (req: UndoRequest) => void
}
const ToastContext = createContext<ToastApi>({ schedule: () => {} })

interface Active extends UndoRequest {
  id: number
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const pending = useRef<Active | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)
  // `pending` drives logic; this drives rendering. Kept in sync.
  const [shown, setShown] = useState<Active | null>(null)

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const schedule = useCallback((req: UndoRequest) => {
    clearTimer()
    // Supersede: commit whatever was waiting before showing the new toast.
    const old = pending.current
    if (old) old.onCommit()
    const a: Active = { ...req, id: ++idRef.current }
    pending.current = a
    setShown(a)
    timer.current = setTimeout(() => {
      if (pending.current?.id === a.id) {
        pending.current = null
        setShown(null)
        a.onCommit()
      }
    }, req.durationMs ?? 5000)
  }, [])

  const undo = useCallback(() => {
    clearTimer()
    const p = pending.current
    pending.current = null
    setShown(null)
    if (p) p.onUndo()
  }, [])

  // Safety net: if the app ever tears down with a write still pending, commit it
  // rather than silently dropping it.
  useEffect(() => () => {
    const p = pending.current
    if (p) p.onCommit()
  }, [])

  return (
    <ToastContext.Provider value={{ schedule }}>
      {children}
      {shown && (
        <div className="undo-toast" role="status">
          <span className="undo-toast__msg">{shown.message}</span>
          <button type="button" className="undo-toast__btn" onClick={undo}>
            {t.undo.action}
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}

// Schedule an undoable action. Returns the bare scheduler so call sites read as
// `undo({ message, onUndo, onCommit })`.
export const useUndoToast = () => useContext(ToastContext).schedule
