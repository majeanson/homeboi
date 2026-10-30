import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

// A calm inline pan + zoom surface. Wraps any fit-to-box child (an SVG graph, a
// diagram) and lets a finger pinch / drag — or the +/− / reset buttons (top-right,
// kept clear of the ＋ quick-add FAB that hovers over the bottom-right corner;
// kiosk-friendly, since native pinch is locked app-wide via the viewport guard) —
// scale and pan within a clipped viewport. The child should fill the surface (e.g.
// an <svg width="100%" height="100%"> with a viewBox + preserveAspectRatio) so it
// fits at scale 1 and only the transform grows it. Transform lives in a ref and is
// written straight to the node so a gesture stays smooth (no re-render per move);
// only the zoom level mirrors into state, to enable/disable the buttons. Reuse it
// wherever a graph can outgrow its glance area (the cercle Arbre / Liens).
const MIN = 1
const MAX = 5
const STEP = 0.5
const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s))

export function PanZoom({
  children,
  className,
  ariaLabel,
  initialScale = 1,
  minimap,
}: {
  children: ReactNode
  className?: string
  ariaLabel?: string
  /** Open already zoomed, top-left corner first (a cookbook page at 2× reads on a phone). */
  initialScale?: number
  /** A thumbnail of the WHOLE content, in the child's fit-to-box shape: drawn in the
   *  bottom-right corner with the visible window on it — tap or drag there to jump
   *  (the recipe verify panel's loupe over a page, 2026-10-30). */
  minimap?: ReactNode
}) {
  const t = useT()
  const surfaceRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const tf = useRef({ scale: clampScale(initialScale), tx: 0, ty: 0 })
  const [scale, setScale] = useState(tf.current.scale) // mirrors tf.scale, only to drive the buttons
  // The visible window on the content (0–1) for the minimap, and the surface's shape,
  // so the map is drawn in the same proportions and the window lands where the eye
  // expects it.
  const [win, setWin] = useState({ x: 0, y: 0, w: 1, h: 1 })
  const [box, setBox] = useState({ w: 4, h: 3 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  // Two-finger pinch snapshot (anchored on its starting midpoint).
  const pinch = useRef<{ dist: number; cx: number; cy: number; scale: number; tx: number; ty: number } | null>(null)
  // One-finger pan snapshot (only pans once zoomed past the clean fit).
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  // Keep the content overlapping the surface: centre it on an axis where it's smaller
  // than the surface, otherwise bound the translate so an edge can't drift inside.
  const clampPan = () => {
    const s = surfaceRef.current
    const c = contentRef.current
    if (!s || !c) return
    const sw = s.clientWidth
    const sh = s.clientHeight
    const cw = c.offsetWidth * tf.current.scale
    const ch = c.offsetHeight * tf.current.scale
    tf.current.tx = cw <= sw ? (sw - cw) / 2 : Math.min(0, Math.max(sw - cw, tf.current.tx))
    tf.current.ty = ch <= sh ? (sh - ch) / 2 : Math.min(0, Math.max(sh - ch, tf.current.ty))
  }
  const apply = () => {
    clampPan()
    const el = contentRef.current
    if (el) el.style.transform = `translate(${tf.current.tx}px, ${tf.current.ty}px) scale(${tf.current.scale})`
    setScale(tf.current.scale)
    const s = surfaceRef.current
    if (minimap && s && el) {
      const cw = el.offsetWidth * tf.current.scale
      const ch = el.offsetHeight * tf.current.scale
      setWin({ x: Math.max(0, -tf.current.tx / cw), y: Math.max(0, -tf.current.ty / ch), w: Math.min(1, s.clientWidth / cw), h: Math.min(1, s.clientHeight / ch) })
    }
  }
  // The minimap: tap, or drag, to put the window there.
  const mapDown = useRef(false)
  const jump = (e: React.PointerEvent) => {
    const m = mapRef.current
    const s = surfaceRef.current
    const c = contentRef.current
    if (!m || !s || !c) return
    const r = m.getBoundingClientRect()
    tf.current.tx = s.clientWidth / 2 - ((e.clientX - r.left) / r.width) * c.offsetWidth * tf.current.scale
    tf.current.ty = s.clientHeight / 2 - ((e.clientY - r.top) / r.height) * c.offsetHeight * tf.current.scale
    apply()
  }

  // Zoom toward a point (px, py) in surface-local coords so it stays put under the
  // pinch midpoint / cursor / button-implied centre.
  const zoomToward = (next: number, px: number, py: number) => {
    const s0 = tf.current.scale
    const s1 = clampScale(next)
    if (s1 === s0) return
    tf.current.tx = px - (px - tf.current.tx) * (s1 / s0)
    tf.current.ty = py - (py - tf.current.ty) * (s1 / s0)
    tf.current.scale = s1
    apply()
  }
  const centre = () => {
    const s = surfaceRef.current
    return { x: (s?.clientWidth ?? 0) / 2, y: (s?.clientHeight ?? 0) / 2 }
  }
  const zoomIn = () => zoomToward(tf.current.scale + STEP, centre().x, centre().y)
  const zoomOut = () => zoomToward(tf.current.scale - STEP, centre().x, centre().y)
  const reset = () => {
    tf.current = { scale: 1, tx: 0, ty: 0 }
    apply()
  }

  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const r = surfaceRef.current!.getBoundingClientRect()
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx: (a.x + b.x) / 2 - r.left,
        cy: (a.y + b.y) / 2 - r.top,
        scale: tf.current.scale,
        tx: tf.current.tx,
        ty: tf.current.ty,
      }
      pan.current = null
    } else if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, tx: tf.current.tx, ty: tf.current.ty }
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const s1 = clampScale(pinch.current.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist))
      // Scale about the pinch's starting midpoint, THEN follow the midpoint as the two
      // fingers travel — so two fingers also MOVE the content, with or without a
      // spread (Marc, 2026-10-30: « make sure we can two-finger move the picture »).
      const r = surfaceRef.current!.getBoundingClientRect()
      const mx = (a.x + b.x) / 2 - r.left
      const my = (a.y + b.y) / 2 - r.top
      tf.current.tx = pinch.current.cx - (pinch.current.cx - pinch.current.tx) * (s1 / pinch.current.scale) + (mx - pinch.current.cx)
      tf.current.ty = pinch.current.cy - (pinch.current.cy - pinch.current.ty) * (s1 / pinch.current.scale) + (my - pinch.current.cy)
      tf.current.scale = s1
      apply()
    } else if (pointers.current.size === 1 && pan.current && tf.current.scale > 1) {
      tf.current.tx = pan.current.tx + (e.clientX - pan.current.x)
      tf.current.ty = pan.current.ty + (e.clientY - pan.current.y)
      apply()
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) pan.current = null
  }

  // Wheel zoom needs a NON-passive native listener — React's onWheel is passive, so a
  // preventDefault there is ignored and the page scrolls instead of zooming.
  useEffect(() => {
    const s = surfaceRef.current
    if (!s) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = s.getBoundingClientRect()
      zoomToward(tf.current.scale - Math.sign(e.deltaY) * STEP, e.clientX - r.left, e.clientY - r.top)
    }
    s.addEventListener('wheel', onWheel, { passive: false })
    return () => s.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Paint the initial scale — the TOP of the content, centred across (a portrait page
  // in a landscape box sits between two blank bands; top-left would open on a band) —
  // and keep the minimap's shape and window right through a resize (a rotation, a
  // desktop pane).
  useEffect(() => {
    const s = surfaceRef.current
    const c = contentRef.current
    if (!s) return
    if (c && tf.current.scale > 1) tf.current.tx = (s.clientWidth - c.offsetWidth * tf.current.scale) / 2
    const ro = new ResizeObserver(() => {
      setBox({ w: s.clientWidth || 4, h: s.clientHeight || 3 })
      apply()
    })
    ro.observe(s)
    apply()
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`panzoom${className ? ` ${className}` : ''}`}>
      <div
        ref={surfaceRef}
        className="panzoom__surface"
        role="application"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={contentRef} className="panzoom__content">
          {children}
        </div>
      </div>
      <div className="panzoom__controls">
        <button type="button" className="btn btn--icon" onClick={zoomOut} disabled={scale <= MIN} aria-label={t.common.zoomOut} title={t.common.zoomOut}>
          <Icon name="minus-bold" size={18} />
        </button>
        <button type="button" className="btn btn--icon" onClick={reset} disabled={scale === MIN} aria-label={t.common.zoomReset} title={t.common.zoomReset}>
          <Icon name="crosshair-bold" size={18} />
        </button>
        <button type="button" className="btn btn--icon" onClick={zoomIn} disabled={scale >= MAX} aria-label={t.common.zoomIn} title={t.common.zoomIn}>
          <Icon name="plus-bold" size={18} />
        </button>
      </div>
      {minimap && (
        <div
          ref={mapRef}
          className="panzoom__map"
          aria-hidden="true"
          style={{ aspectRatio: `${box.w} / ${box.h}` }}
          onPointerDown={(e) => {
            mapDown.current = true
            ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
            jump(e)
          }}
          onPointerMove={(e) => {
            if (mapDown.current) jump(e)
          }}
          onPointerUp={() => {
            mapDown.current = false
          }}
          onPointerCancel={() => {
            mapDown.current = false
          }}
        >
          {minimap}
          <div className="panzoom__map-box" style={{ left: `${win.x * 100}%`, top: `${win.y * 100}%`, width: `${win.w * 100}%`, height: `${win.h * 100}%` }} />
        </div>
      )}
    </div>
  )
}
