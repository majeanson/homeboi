import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'
import { Icon } from './Icon'

// Tap an image to open it full-screen (zoom-in); tap the backdrop, the ✕, or
// press Esc to close. Used for flyer/deal images, recipe photos, and the cercle
// photo gallery so a price, a product photo, or an ID card is readable from the
// couch. The full-screen view supports PINCH-ZOOM + pan + double-tap on top of the
// initial fit — native browser pinch is locked app-wide (viewport user-scalable=no
// + the gesture guards in viewportVars.ts), so the overlay does it itself with
// pointer events and a CSS transform.
export function ZoomableImg({
  src,
  alt = '',
  className,
  onError,
}: {
  src: string
  alt?: string
  className?: string
  // Forwarded to the thumbnail — lets a caller detect a blob that won't render as an
  // image (e.g. an extension-less PDF key) and swap in a different affordance.
  onError?: React.ReactEventHandler<HTMLImageElement>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <img src={src} alt={alt} className={className} onClick={() => setOpen(true)} onError={onError} style={{ cursor: 'zoom-in' }} />
      {open && <ZoomOverlay src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

const MAX_SCALE = 6
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(1, s))

// The full-screen layer with the gesture handling. Transform state lives in refs
// and is written straight to the <img> style so a pinch/pan stays smooth (no
// re-render per pointer move).
function ZoomOverlay({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  // Esc-to-close + background scroll lock + focus trap, shared with every dialog.
  useModal(overlayRef, onClose, { open: true })

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const tf = useRef({ scale: 1, tx: 0, ty: 0 })
  // Snapshot of the two-finger pinch at its start, to anchor the gesture.
  const pinch = useRef<{ dist: number; midX: number; midY: number; scale: number; tx: number; ty: number } | null>(null)
  // Single-finger pan snapshot (only pans once zoomed in).
  const pan = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)

  const apply = () => {
    const el = imgRef.current
    if (el) el.style.transform = `translate(${tf.current.tx}px, ${tf.current.ty}px) scale(${tf.current.scale})`
  }
  const reset = () => {
    tf.current = { scale: 1, tx: 0, ty: 0 }
    apply()
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        scale: tf.current.scale,
        tx: tf.current.tx,
        ty: tf.current.ty,
      }
      pan.current = null
    } else if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, tx: tf.current.tx, ty: tf.current.ty, moved: false }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      tf.current.scale = clampScale(pinch.current.scale * (dist / pinch.current.dist))
      // Track the moving midpoint so the picture follows the two fingers.
      tf.current.tx = pinch.current.tx + (midX - pinch.current.midX)
      tf.current.ty = pinch.current.ty + (midY - pinch.current.midY)
      apply()
    } else if (pointers.current.size === 1 && pan.current && tf.current.scale > 1) {
      const dx = e.clientX - pan.current.x
      const dy = e.clientY - pan.current.y
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) pan.current.moved = true
      tf.current.tx = pan.current.tx + dx
      tf.current.ty = pan.current.ty + dy
      apply()
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      // Pinched back to (or below) the clean fit → snap exactly to it.
      if (tf.current.scale <= 1.01) reset()
      pan.current = null
    }
    // Tap-to-close is intentionally NOT on the image (it would fire on the first
    // tap of a double-tap-to-zoom). Close via the backdrop, the ✕, or Esc.
  }

  // Double-tap / double-click toggles between fit and a 2.5× look.
  function onDoubleClick() {
    if (tf.current.scale > 1) reset()
    else {
      tf.current.scale = 2.5
      apply()
    }
  }

  // Portal to <body>: the overlay is `position: fixed; inset: 0`, but it's rendered
  // inline next to the thumbnail, and a launcher like a fridge-note card is
  // `transform: rotate(...)` (the torn-paper look) — a transformed ancestor is a
  // containing block for fixed descendants, so inline the overlay would be trapped
  // inside the little rotated card instead of covering the screen (the ✕/backdrop
  // then sit over the trigger image and a close-tap reopens it). Portalling escapes
  // any transformed ancestor so it's always a true full-page viewer.
  return createPortal(
    <div
      ref={overlayRef}
      className="zoom-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose() // backdrop tap closes
      }}
    >
      <img
        ref={imgRef}
        className="zoom-overlay__img"
        src={src}
        alt={alt}
        draggable={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      <button type="button" className="zoom-overlay__close" aria-label="Fermer / Close" onClick={onClose}>
        <Icon name="x-bold" size={20} />
      </button>
    </div>,
    document.body,
  )
}
