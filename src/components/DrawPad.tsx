import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { useT } from '../i18n'
import { Icon } from './Icon'

// A quick paint pad for a DRAWN fridge note (#14) — scribble a little something
// for the household instead of typing. signature_pad gives smooth finger/stylus
// strokes; a small calm palette + a paper-colour "eraser" (paints back to the
// background, so the exported PNG is always a clean opaque card). Save → PNG blob
// handed up; the caller uploads it to /api/note-media and files a note. Not OCR:
// the drawing IS the note. Full-screen overlay so a finger has room on a tablet.
const PAPER = '#fffdf7'
// Ink + the section "deep" hues, so a drawing reads in the same family as the app.
const COLORS = ['#2b2b2b', '#C2563A', '#D9842A', '#6B8A52', '#5891AC', '#95527A']

export function DrawPad({ open, onCancel, onSave }: { open: boolean; onCancel: () => void; onSave: (png: Blob) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const canvas = canvasRef.current
    const pad = new SignaturePad(canvas, { backgroundColor: PAPER, penColor: COLORS[0] })
    padRef.current = pad
    // Match the bitmap to the displayed size × DPR for crisp strokes; clear()
    // repaints the background at the new size (signature_pad scales by DPR itself).
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)
      pad.clear()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      pad.off()
      padRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (padRef.current) padRef.current.penColor = color
  }, [color])

  if (!open) return null

  const save = () => {
    const pad = padRef.current
    if (!pad || pad.isEmpty()) {
      onCancel()
      return
    }
    setBusy(true)
    canvasRef.current?.toBlob((blob) => {
      setBusy(false)
      if (blob) onSave(blob)
    }, 'image/png')
  }

  return (
    <div className="drawpad" role="dialog" aria-modal="true" aria-label={t.memo.drawTitle}>
      <div className="drawpad__bar">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={'drawpad__swatch' + (color === c ? ' is-on' : '')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={t.memo.pen}
            aria-pressed={color === c}
          />
        ))}
        <button
          type="button"
          className={'drawpad__swatch drawpad__eraser' + (color === PAPER ? ' is-on' : '')}
          style={{ background: PAPER }}
          onClick={() => setColor(PAPER)}
          aria-label={t.memo.eraser}
          aria-pressed={color === PAPER}
        />
        <button type="button" className="drawpad__tool" onClick={() => padRef.current?.clear()} aria-label={t.memo.clear}>
          <Icon name="trash-bold" size={18} />
        </button>
      </div>
      <canvas ref={canvasRef} className="drawpad__canvas" />
      <div className="drawpad__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {t.memo.cancel}
        </button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          <Icon name="check-bold" size={18} /> {t.memo.save}
        </button>
      </div>
    </div>
  )
}
