import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

// Pointer-based drag-and-drop that works on TOUCH (kiosk + phone) where native
// HTML5 drag events never fire. A drag carries a string id; drop targets are any
// element marked `data-dnd-zone="<key>"` under the pointer at release. The caller
// decides what a drop means — reschedule a meal to a day/slot, reorder a list…
//
// Design choices that make it feel right on a finger:
//  • a movement THRESHOLD before the drag visually engages, so a tap still works
//    and a tiny wobble doesn't start a drag;
//  • the caller puts `touch-action: none` on the drag handle (see .dnd-grip /
//    .dnd-source-grab) so the browser doesn't steal the gesture to scroll;
//  • while a drag is live we preventDefault on pointermove (non-passive) so the
//    page never scrolls out from under the drop;
//  • a floating ghost label follows the finger, because the finger itself covers
//    the row being dragged.
//
// One household tenet shows up here too: the hit-test walks UP from the pointer to
// the nearest zone, so a zone can hold rows that are themselves zones (drop "on a
// meal" reads as "into that meal's slot").

export interface DragGhostState {
  label: string
  x: number
  y: number
}

export function usePointerDnd(opts: {
  onDrop: (id: string, zone: string) => void
  // Reject a drop (e.g. onto its own day/slot) — also greys the zone out so it
  // never shows a drop cue it won't honour.
  canDrop?: (id: string, zone: string) => boolean
}) {
  // The session (id + label) is set once at start; position ticks on every move.
  // Splitting them keeps the window listeners bound once per drag, not per pixel.
  const [session, setSession] = useState<{ id: string; label: string } | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [started, setStarted] = useState(false)
  const [over, setOver] = useState<string | null>(null)
  const originRef = useRef<{ started: boolean; sx: number; sy: number } | null>(null)
  // Latest callbacks without re-binding the listeners.
  const cb = useRef(opts)
  cb.current = opts

  const zoneAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const zone = el?.closest('[data-dnd-zone]') as HTMLElement | null
    return zone?.dataset.dndZone ?? null
  }

  useEffect(() => {
    if (!session) return
    const move = (e: PointerEvent) => {
      const o = originRef.current
      if (!o) return
      if (!o.started) {
        if (Math.abs(e.clientX - o.sx) < 6 && Math.abs(e.clientY - o.sy) < 6) return
        o.started = true
        setStarted(true)
      }
      e.preventDefault()
      setPos({ x: e.clientX, y: e.clientY })
      const z = zoneAt(e.clientX, e.clientY)
      const ok = z != null && (!cb.current.canDrop || cb.current.canDrop(session.id, z))
      setOver(ok ? z : null)
    }
    const finish = (e: PointerEvent, commit: boolean) => {
      const o = originRef.current
      if (commit && o?.started) {
        const z = zoneAt(e.clientX, e.clientY)
        if (z != null && (!cb.current.canDrop || cb.current.canDrop(session.id, z))) cb.current.onDrop(session.id, z)
      }
      originRef.current = null
      setSession(null)
      setStarted(false)
      setOver(null)
    }
    const up = (e: PointerEvent) => finish(e, true)
    const cancel = (e: PointerEvent) => finish(e, false)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [session])

  const start = useCallback((id: string, label: string, e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    originRef.current = { started: false, sx: e.clientX, sy: e.clientY }
    setSession({ id, label })
    setPos({ x: e.clientX, y: e.clientY })
    setStarted(false)
  }, [])

  return {
    start,
    // The dragged id, but only after the threshold — so source styling and the
    // ghost don't flash on a plain tap.
    activeId: started && session ? session.id : null,
    over,
    ghost: started && session ? { label: session.label, x: pos.x, y: pos.y } : null,
  }
}

// The floating label that trails the finger. Render once per page using the hook.
// Portalled to <body> so `position: fixed` stays viewport-relative even when an
// ancestor is transformed (the day sheet animates with translateY — a fixed child
// inside it would otherwise anchor to the sheet, not the screen).
export function DragGhost({ ghost }: { ghost: DragGhostState | null }) {
  if (!ghost) return null
  return createPortal(
    <div className="dnd-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
      {ghost.label}
    </div>,
    document.body,
  )
}
