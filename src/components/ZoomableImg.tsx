import { useRef, useState } from 'react'
import { useModal } from '../lib/useModal'

// Tap an image to open it full-screen (zoom-in); tap the backdrop, the ✕, or
// press Esc to close. Used for flyer/deal images so a price or product photo is
// readable on the wall and from the couch.
export function ZoomableImg({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false)

  // Esc-to-close + background scroll lock + focus trap, shared with every dialog.
  const overlayRef = useRef<HTMLDivElement>(null)
  useModal(overlayRef, () => setOpen(false), { open })

  return (
    <>
      <img src={src} alt={alt} className={className} onClick={() => setOpen(true)} style={{ cursor: 'zoom-in' }} />
      {open && (
        <div ref={overlayRef} className="zoom-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <img className="zoom-overlay__img" src={src} alt={alt} />
          <button type="button" className="zoom-overlay__close" aria-label="✕" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
      )}
    </>
  )
}
