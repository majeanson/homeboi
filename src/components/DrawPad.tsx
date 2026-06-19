import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import type { PointGroup } from 'signature_pad'
import { useT } from '../i18n'
import { useModal } from '../lib/useModal'
import { Icon } from './Icon'

// A quick paint pad for a DRAWN fridge note (#14) — scribble a little something
// for the household instead of typing. Three play modes so a family doodle stays
// fun: a freehand PEN (signature_pad smooth strokes), tap-to-stamp STICKERS, and a
// chunky PIXEL grid. A family rainbow + brush sizes + undo + a paper-colour
// "eraser" round it out; the exported PNG is always a clean opaque card. Save →
// PNG blob handed up; the caller uploads it to /api/note-media and files a note.
// Not OCR: the drawing IS the note. Full-screen overlay so a finger has room on a
// tablet; `useModal` locks the page scroll + traps focus so a stroke never swipes
// the board behind it.
//
// Family / shared: pass `initial` (an existing drawing's image URL) to RE-OPEN a
// drawing and draw on top of it — anyone can add to what someone else started
// (Notes.tsx wires the ✏️ on a drawing card). Undo/clear keep that base image
// intact; only the additions made this session come and go.
//
// Composition: the canvas is re-rendered bottom-up — paper → base image → pixels →
// pen strokes → stickers — so stickers always sit on top and undo can peel back
// the last thing added regardless of which tool made it (see `history`).
const PAPER = '#fffdf7'
// Ink + a friendly full spectrum so a kid has real colours, while the section
// "deep" hues keep a drawing in the same family as the rest of the app.
const COLORS = [
  '#2b2b2b', // ink
  '#C2563A', // terracotta (board)
  '#E8632E', // orange
  '#D9842A', // marigold (kitchen)
  '#F2B705', // sunshine
  '#6B8A52', // sage (routines)
  '#3FA796', // teal
  '#5891AC', // sky (events)
  '#3D6BB5', // blue
  '#7E5BB0', // violet
  '#95527A', // plum (liste)
  '#E4739B', // pink
]
// One size index drives all three tools: pen min/max + dot, pixel cell, sticker
// font — so "bigger" means bigger whatever you're holding. Fat-ish by default so a
// toddler finger leaves a satisfying mark.
const SIZES = [
  { key: 's', min: 1, max: 2.5, dot: 1.6, ui: 8, cell: 16, font: 30 },
  { key: 'm', min: 2.5, max: 5, dot: 3.5, ui: 13, cell: 26, font: 48 },
  { key: 'l', min: 6, max: 11, dot: 8, ui: 19, cell: 40, font: 72 },
] as const
// Friendly stamps — content pictos, so emoji (not the control-icon set) per house
// convention. Family-flavoured: hearts, faces, pets, weather, treats.
const STICKERS = ['❤️', '⭐', '😀', '🐱', '🐶', '🌈', '🌸', '☀️', '🚗', '⚽', '🍎', '🎈']

type Mode = 'pen' | 'sticker' | 'pixel'
type Stamp = { x: number; y: number; emoji: string; font: number }
type PixelChange = { key: string; prev: string | undefined }
// One entry per discrete action, in the order performed, so undo is last-in-first-out
// across all three tools.
type Op = { kind: 'stroke' } | { kind: 'stamp' } | { kind: 'pixel'; changes: PixelChange[] }

export function DrawPad({
  open,
  onCancel,
  onSave,
  initial,
}: {
  open: boolean
  onCancel: () => void
  onSave: (png: Blob) => void
  // An existing drawing to load and draw on top of (edit / add-to). Same-origin
  // (/api/img/…) so the canvas stays untainted and `toBlob` works.
  initial?: string
}) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  // Tool layers we own (signature_pad owns only the pen strokes). Kept in refs so
  // the once-attached pointer handlers always read the live values.
  const pixelsRef = useRef<Map<string, string>>(new Map())
  const stampsRef = useRef<Stamp[]>([])
  const historyRef = useRef<Op[]>([])
  // Live tool settings mirrored to refs for the pointer handlers.
  const modeRef = useRef<Mode>('pen')
  const colorRef = useRef<string>(COLORS[0])
  const sizeRef = useRef<number>(1)
  const stickerRef = useRef<string>(STICKERS[0])
  const dragRef = useRef<{ active: boolean; changes: PixelChange[] }>({ active: false, changes: [] })

  const [mode, setMode] = useState<Mode>('pen')
  const [color, setColor] = useState<string>(COLORS[0])
  const [size, setSize] = useState<number>(1) // index into SIZES (medium)
  const [sticker, setSticker] = useState<string>(STICKERS[0])
  const [busy, setBusy] = useState(false)

  useEffect(() => void (modeRef.current = mode), [mode])
  useEffect(() => void (colorRef.current = color), [color])
  useEffect(() => void (sizeRef.current = size), [size])
  useEffect(() => void (stickerRef.current = sticker), [sticker])

  // Page scroll-lock + Escape + focus trap (the shared dialog behaviour). With the
  // CSS `touch-action/overscroll: none` on the overlay this means a drawing gesture
  // can never scroll, bounce, or pull-to-refresh the board underneath.
  useModal(rootRef, onCancel, { open })

  // Repaint the canvas from scratch, bottom-up, so every layer keeps its place and
  // undo can drop any single action. `strokes` becomes signature_pad's data.
  function render(strokes: PointGroup[]) {
    const pad = padRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!pad || !canvas || !ctx) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const w = canvas.width / ratio
    const h = canvas.height / ratio
    ctx.save()
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, w, h)
    const img = baseImgRef.current
    if (img && img.width && img.height) {
      const scale = Math.min(w / img.width, h / img.height) // contain, centred
      ctx.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale)
    }
    for (const [key, col] of pixelsRef.current) {
      const [coords, cellStr] = key.split(':') // key === "cx,cy:cell"
      const [cx, cy] = coords.split(',').map(Number)
      const cell = Number(cellStr)
      ctx.fillStyle = col
      ctx.fillRect(cx * cell, cy * cell, cell, cell)
    }
    ctx.restore()
    pad.fromData(strokes, { clear: false }) // strokes over pixels
    const ctx2 = canvas.getContext('2d')
    if (ctx2) {
      ctx2.save()
      ctx2.textAlign = 'center'
      ctx2.textBaseline = 'middle'
      for (const s of stampsRef.current) {
        ctx2.font = `${s.font}px sans-serif`
        ctx2.fillText(s.emoji, s.x, s.y) // stickers on top
      }
      ctx2.restore()
    }
  }

  // Canvas-space coords (CSS px; the context is pre-scaled by DPR).
  function pointAt(e: PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function stampAt(x: number, y: number) {
    stampsRef.current.push({ x, y, emoji: stickerRef.current, font: SIZES[sizeRef.current].font })
    historyRef.current.push({ kind: 'stamp' })
    render(padRef.current?.toData() ?? [])
  }

  // Paint the grid cell under (x,y), recording the previous value once per cell so
  // the whole drag undoes as one step. Eraser (paper colour) frees the cell.
  function paintPixel(x: number, y: number) {
    const cell = SIZES[sizeRef.current].cell
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    const key = `${cx},${cy}:${cell}`
    const map = pixelsRef.current
    if (!dragRef.current.changes.some((c) => c.key === key))
      dragRef.current.changes.push({ key, prev: map.get(key) })
    if (colorRef.current === PAPER) map.delete(key)
    else map.set(key, colorRef.current)
    render(padRef.current?.toData() ?? [])
  }

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const canvas = canvasRef.current
    const s = SIZES[sizeRef.current]
    const pad = new SignaturePad(canvas, {
      backgroundColor: PAPER,
      penColor: colorRef.current,
      minWidth: s.min,
      maxWidth: s.max,
      dotSize: s.dot,
    })
    padRef.current = pad
    // A finished pen stroke is one undo step; re-render so it sits under stickers.
    const onEnd = () => {
      historyRef.current.push({ kind: 'stroke' })
      render(pad.toData())
    }
    pad.addEventListener('endStroke', onEnd)

    // Our pointer handlers drive sticker + pixel modes; pen mode is left to
    // signature_pad (which we toggle off in those modes via the `mode` effect).
    const onDown = (e: PointerEvent) => {
      if (modeRef.current === 'pen') return
      canvas.setPointerCapture?.(e.pointerId)
      const { x, y } = pointAt(e)
      if (modeRef.current === 'sticker') {
        stampAt(x, y)
        return
      }
      dragRef.current = { active: true, changes: [] }
      paintPixel(x, y)
    }
    const onMove = (e: PointerEvent) => {
      if (modeRef.current !== 'pixel' || !dragRef.current.active) return
      const { x, y } = pointAt(e)
      paintPixel(x, y)
    }
    const onUp = () => {
      if (modeRef.current !== 'pixel' || !dragRef.current.active) return
      const { changes } = dragRef.current
      dragRef.current = { active: false, changes: [] }
      if (changes.length) historyRef.current.push({ kind: 'pixel', changes })
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // Crisp bitmap at the displayed size × DPR; repaint every layer on resize so a
    // rotate doesn't drop the drawing (clear() alone would wipe base/pixels/stamps).
    const resize = () => {
      const data = pad.toData()
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)
      render(data)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      pad.removeEventListener('endStroke', onEnd)
      pad.off()
      padRef.current = null
      baseImgRef.current = null
      pixelsRef.current = new Map()
      stampsRef.current = []
      historyRef.current = []
    }
    // Handlers read live settings from refs; build the pad once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Load the base image when (re)opening on an existing drawing, then paint it.
  useEffect(() => {
    baseImgRef.current = null
    if (!open || !initial) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      baseImgRef.current = img
      render(padRef.current?.toData() ?? [])
    }
    img.src = initial
    // render is stable for the open lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  // Pen draws only in pen mode; in sticker/pixel modes signature_pad is off so our
  // pointer handlers own the canvas. off() first (idempotent) guards against the
  // constructor's own on() doubling the stroke listeners.
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    pad.off()
    if (mode === 'pen') pad.on()
  }, [mode])

  useEffect(() => {
    if (padRef.current) padRef.current.penColor = color
  }, [color])

  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const s = SIZES[size]
    pad.minWidth = s.min
    pad.maxWidth = s.max
    pad.dotSize = s.dot
  }, [size])

  if (!open) return null

  const undo = () => {
    const op = historyRef.current.pop()
    if (!op) return
    if (op.kind === 'stroke') {
      const data = padRef.current?.toData() ?? []
      data.pop()
      render(data)
    } else if (op.kind === 'stamp') {
      stampsRef.current.pop()
      render(padRef.current?.toData() ?? [])
    } else {
      const map = pixelsRef.current
      for (const c of op.changes) {
        if (c.prev === undefined) map.delete(c.key)
        else map.set(c.key, c.prev)
      }
      render(padRef.current?.toData() ?? [])
    }
  }

  // Clear = drop everything added this session; on an existing drawing that leaves
  // the original base, otherwise a blank sheet.
  const clear = () => {
    pixelsRef.current.clear()
    stampsRef.current = []
    historyRef.current = []
    render([])
  }

  const save = () => {
    const pad = padRef.current
    const empty =
      (!pad || pad.isEmpty()) && !stampsRef.current.length && !pixelsRef.current.size && !baseImgRef.current
    if (empty) {
      onCancel()
      return
    }
    setBusy(true)
    canvasRef.current?.toBlob((blob) => {
      setBusy(false)
      if (blob) onSave(blob)
    }, 'image/png')
  }

  const MODES: Array<{ key: Mode; icon: Parameters<typeof Icon>[0]['name']; label: string }> = [
    { key: 'pen', icon: 'paint-brush-bold', label: t.memo.drawPen },
    { key: 'sticker', icon: 'smiley-bold', label: t.memo.drawSticker },
    { key: 'pixel', icon: 'square-bold', label: t.memo.drawPixel },
  ]

  return (
    <div ref={rootRef} className="drawpad" role="dialog" aria-modal="true" aria-label={initial ? t.memo.editTitle : t.memo.drawTitle}>
      <div className="drawpad__bar">
        <div className="drawpad__modes" role="group" aria-label={t.memo.tool}>
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={'drawpad__mode' + (mode === m.key ? ' is-on' : '')}
              onClick={() => setMode(m.key)}
              aria-label={m.label}
              aria-pressed={mode === m.key}
            >
              <Icon name={m.icon} size={18} />
            </button>
          ))}
        </div>
        {mode !== 'sticker' && (
          <div className="drawpad__colors">
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
          </div>
        )}
        {mode === 'sticker' && (
          <div className="drawpad__stickers" role="group" aria-label={t.memo.drawSticker}>
            {STICKERS.map((e) => (
              <button
                key={e}
                type="button"
                className={'drawpad__sticker' + (sticker === e ? ' is-on' : '')}
                onClick={() => setSticker(e)}
                aria-label={e}
                aria-pressed={sticker === e}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="drawpad__sizes" role="group" aria-label={t.memo.size}>
          {SIZES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={'drawpad__size' + (size === i ? ' is-on' : '')}
              onClick={() => setSize(i)}
              aria-label={t.memo.size}
              aria-pressed={size === i}
            >
              <span className="drawpad__dot" style={{ width: s.ui, height: s.ui }} />
            </button>
          ))}
        </div>
        <div className="drawpad__tools">
          <button type="button" className="drawpad__tool" onClick={undo} aria-label={t.memo.undo}>
            <Icon name="arrow-counter-clockwise-bold" size={18} />
          </button>
          <button type="button" className="drawpad__tool" onClick={clear} aria-label={t.memo.clear}>
            <Icon name="trash-bold" size={18} />
          </button>
        </div>
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
