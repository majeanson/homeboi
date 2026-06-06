import { useEffect, useState } from 'react'

// Tap an image to open it full-screen (zoom-in); tap the backdrop, the ✕, or
// press Esc to close. Used for flyer/deal images so a price or product photo is
// readable on the wall and from the couch.
export function ZoomableImg({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <img src={src} alt={alt} className={className} onClick={() => setOpen(true)} style={{ cursor: 'zoom-in' }} />
      {open && (
        <div className="zoom-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <img className="zoom-overlay__img" src={src} alt={alt} />
          <button type="button" className="zoom-overlay__close" aria-label="✕" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
      )}
    </>
  )
}
