import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import type { PointGroup } from 'signature_pad'
import { useT } from '../i18n'
import { useModal } from '../lib/useModal'
import { Icon } from './Icon'

// The family draw pad for a fridge note (#14) — a little canvas the household, and
// ESPECIALLY the kids, actually want to open. Built useful-at-home first: it doubles
// as an EDUCATIONAL surface (handwriting lines, letter/number tracing, colour-in
// pages) and a creative one (mirror/kaleidoscope, stickers, pixel art).
//
// Tools (modes): freehand PEN (signature_pad), tap-to-stamp STICKER packs, chunky
// PIXEL grid, and a TEXT stamp (type a word — practise names + spelling). Across all
// of them: a family rainbow + custom/recent colours, three sizes, a
// MIRROR toggle (everything you draw is echoed across the middle), full UNDO/REDO,
// and a paper-colour eraser. A TEMPLATE layer can sit under the drawing — ruled
// handwriting lines, a big letter/number to trace, dot/graph paper, or a colour-in
// outline.
//
// Composition (render(), bottom-up): paper → template → base image → pixels → pen
// strokes → stickers/text. The base image is the EXISTING drawing when re-opened
// (prop `initial`) — anyone can add to what someone else started; undo/redo only
// touch this session's additions, the original underneath is redrawn intact.
//
// Export is size-capped (MAX_EDGE) so a drawing can never bloat to multi-MB and jank
// the board. `useModal` + CSS lock the page so a stroke can't scroll/select behind it.
//
// `toddler` trims the toolbar to the big, safe, fun controls (no text/custom-colour/
// share/routine) so a pre-reader can draw without getting lost.
const PAPER = '#fffdf7'
const COLORS = [
  '#2b2b2b', '#C2563A', '#E8632E', '#D9842A', '#F2B705', '#6B8A52',
  '#3FA796', '#5891AC', '#3D6BB5', '#7E5BB0', '#95527A', '#E4739B',
]
const SIZES = [
  { key: 's', min: 1, max: 2.5, dot: 1.6, ui: 8, cell: 16, font: 30 },
  { key: 'm', min: 2.5, max: 5, dot: 3.5, ui: 13, cell: 26, font: 48 },
  { key: 'l', min: 6, max: 11, dot: 8, ui: 19, cell: 40, font: 72 },
] as const

// Sticker packs — content pictos, so emoji (not the control-icon set). Family +
// seasonal + a learning pack of letters/numbers to stamp.
const PACKS: { key: string; icon: string; items: string[] }[] = [
  { key: 'faces', icon: '😀', items: ['😀', '😄', '😍', '🤩', '😎', '😇', '🥳', '😴', '🤗', '😜'] },
  { key: 'animals', icon: '🐱', items: ['🐱', '🐶', '🐰', '🐻', '🦊', '🐸', '🐥', '🦄', '🐝', '🐢'] },
  { key: 'nature', icon: '🌈', items: ['🌈', '🌸', '🌻', '🌳', '⭐', '🌙', '☀️', '❄️', '⚡', '🍄'] },
  { key: 'seasons', icon: '🎃', items: ['🎃', '🎄', '🎁', '🍁', '🌷', '⛄', '🍀', '🎆', '🦃', '💝'] },
  { key: 'things', icon: '🚗', items: ['🚗', '⚽', '🏠', '🎈', '🍎', '🍦', '🎨', '📚', '🚀', '🎵'] },
  { key: 'abc', icon: '🔤', items: ['A', 'B', 'C', '1', '2', '3', '❤', '★', '✓', '?'] },
]
const TRACE_CHARS = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789').split('')
type TemplateKind = 'none' | 'lines' | 'trace' | 'dots' | 'coloring'
const COLORING = ['star', 'heart', 'flower', 'house', 'fish', 'sun'] as const
type ColoringShape = (typeof COLORING)[number]

type Mode = 'pen' | 'sticker' | 'pixel' | 'text'
type Stamp = { x: number; y: number; text: string; font: number }
type PixelChange = { key: string; prev: string | undefined }
// Undo entries (in order). Stroke/stamp track HOW MANY canvas items the action
// added (1, or 2 with mirror) so undo peels the whole action.
type Op = { kind: 'stroke'; n: number } | { kind: 'stamp'; n: number } | { kind: 'pixel'; changes: PixelChange[] }
// Redo entries carry the payload to re-apply.
type Redo =
  | { kind: 'stroke'; strokes: PointGroup[] }
  | { kind: 'stamp'; stamps: Stamp[] }
  | { kind: 'pixel'; changes: { key: string; prev: string | undefined; next: string | undefined }[] }

// ── Template painters (faint, drawn under the drawing; baked into the PNG so the
// finished worksheet shows what was practised). CSS-px space (ctx pre-scaled). ──
function tplLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const band = Math.max(64, h / 8)
  ctx.lineWidth = 1.5
  for (let y = band; y < h; y += band) {
    ctx.strokeStyle = 'rgba(72,120,180,0.45)'
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    ctx.strokeStyle = 'rgba(72,120,180,0.28)'
    ctx.setLineDash([7, 7])
    ctx.beginPath(); ctx.moveTo(0, y - band / 2); ctx.lineTo(w, y - band / 2); ctx.stroke()
  }
  ctx.setLineDash([])
}
function tplDots(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  const g = 32
  for (let y = g; y < h; y += g) for (let x = g; x < w; x += g) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill() }
}
function tplTrace(ctx: CanvasRenderingContext2D, w: number, h: number, ch: string) {
  tplLines(ctx, w, h)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.min(w, h) * 0.72}px Georgia, "Times New Roman", serif`
  ctx.fillStyle = 'rgba(40,40,40,0.10)'
  ctx.fillText(ch, w / 2, h / 2)
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(40,40,40,0.22)'
  ctx.strokeText(ch, w / 2, h / 2)
  ctx.restore()
}
function shapePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, shape: ColoringShape) {
  ctx.beginPath()
  if (shape === 'heart') {
    for (let t = 0; t <= Math.PI * 2 + 0.05; t += 0.04) {
      const hx = 16 * Math.sin(t) ** 3
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      const x = cx + (hx / 16) * r, y = cy - (hy / 16) * r
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
  } else if (shape === 'star' || shape === 'flower' || shape === 'sun') {
    const pts = shape === 'flower' ? 8 : shape === 'sun' ? 12 : 5
    const inner = shape === 'flower' ? 0.55 : shape === 'sun' ? 0.78 : 0.45
    for (let i = 0; i <= pts * 2; i++) {
      const ang = (i * Math.PI) / pts - Math.PI / 2
      const rad = i % 2 === 0 ? r : r * inner
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    if (shape !== 'star') { ctx.closePath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2) }
  } else if (shape === 'house') {
    const s = r * 0.85
    ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx - s, cy - s * 0.2); ctx.lineTo(cx, cy - s)
    ctx.lineTo(cx + s, cy - s * 0.2); ctx.lineTo(cx + s, cy + s); ctx.closePath()
    ctx.moveTo(cx - s * 0.3, cy + s); ctx.lineTo(cx - s * 0.3, cy + s * 0.2); ctx.lineTo(cx + s * 0.3, cy + s * 0.2); ctx.lineTo(cx + s * 0.3, cy + s)
  } else {
    // fish: body ellipse + tail
    ctx.ellipse(cx - r * 0.15, cy, r, r * 0.6, 0, 0, Math.PI * 2)
    ctx.moveTo(cx + r * 0.8, cy); ctx.lineTo(cx + r * 1.3, cy - r * 0.4); ctx.lineTo(cx + r * 1.3, cy + r * 0.4); ctx.closePath()
  }
  ctx.stroke()
}
function tplColoring(ctx: CanvasRenderingContext2D, w: number, h: number, shape: ColoringShape) {
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(40,40,40,0.30)'
  shapePath(ctx, w / 2, h / 2, Math.min(w, h) * 0.34, shape)
  ctx.restore()
}

export function DrawPad({
  open,
  onCancel,
  onSave,
  onMakeRoutine,
  initial,
  toddler,
}: {
  open: boolean
  onCancel: () => void
  onSave: (png: Blob) => void
  onMakeRoutine?: (png: Blob) => void
  initial?: string
  toddler?: boolean
}) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  const pixelsRef = useRef<Map<string, string>>(new Map())
  const stampsRef = useRef<Stamp[]>([])
  const historyRef = useRef<Op[]>([])
  const redoRef = useRef<Redo[]>([])
  // Live tool settings the once-attached pointer handlers read.
  const modeRef = useRef<Mode>('pen')
  const colorRef = useRef<string>(COLORS[0])
  const sizeRef = useRef<number>(1)
  const stickerRef = useRef<string>(PACKS[0].items[0])
  const textRef = useRef<string>('')
  const symmetryRef = useRef<boolean>(false)
  const tplRef = useRef<{ kind: TemplateKind; ch: string; shape: ColoringShape }>({ kind: 'none', ch: 'A', shape: 'star' })
  const dragRef = useRef<{ active: boolean; changes: PixelChange[] }>({ active: false, changes: [] })

  const [mode, setMode] = useState<Mode>('pen')
  const [color, setColor] = useState<string>(COLORS[0])
  const [recent, setRecent] = useState<string[]>([])
  const [size, setSize] = useState(1)
  const [pack, setPack] = useState(0)
  const [sticker, setSticker] = useState(PACKS[0].items[0])
  const [text, setText] = useState('')
  const [symmetry, setSymmetry] = useState(false)
  const [tpl, setTpl] = useState<TemplateKind>('none')
  const [traceCh, setTraceCh] = useState('A')
  const [shape, setShape] = useState<ColoringShape>('star')
  const [busy, setBusy] = useState(false)

  useEffect(() => void (modeRef.current = mode), [mode])
  useEffect(() => void (colorRef.current = color), [color])
  useEffect(() => void (sizeRef.current = size), [size])
  useEffect(() => void (stickerRef.current = sticker), [sticker])
  useEffect(() => void (textRef.current = text), [text])
  useEffect(() => void (symmetryRef.current = symmetry), [symmetry])
  useEffect(() => {
    tplRef.current = { kind: tpl, ch: traceCh, shape }
    render(padRef.current?.toData() ?? [])
    // render is stable for the open lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, traceCh, shape])

  useModal(rootRef, onCancel, { open })

  const ratio = () => Math.max(window.devicePixelRatio || 1, 1)
  const cssW = () => (canvasRef.current ? canvasRef.current.width / ratio() : 0)

  function render(strokes: PointGroup[]) {
    const pad = padRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!pad || !canvas || !ctx) return
    const w = canvas.width / ratio()
    const h = canvas.height / ratio()
    ctx.save()
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, w, h)
    const tp = tplRef.current
    if (tp.kind === 'lines') tplLines(ctx, w, h)
    else if (tp.kind === 'dots') tplDots(ctx, w, h)
    else if (tp.kind === 'trace') tplTrace(ctx, w, h, tp.ch)
    else if (tp.kind === 'coloring') tplColoring(ctx, w, h, tp.shape)
    const img = baseImgRef.current
    if (img && img.width && img.height) {
      const s = Math.min(w / img.width, h / img.height)
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s)
    }
    for (const [key, col] of pixelsRef.current) {
      const [coords, cellStr] = key.split(':') // "cx,cy:cell"
      const [cx, cy] = coords.split(',').map(Number)
      const cell = Number(cellStr)
      ctx.fillStyle = col
      ctx.fillRect(cx * cell, cy * cell, cell, cell)
    }
    ctx.restore()
    pad.fromData(strokes, { clear: false })
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const st of stampsRef.current) {
      ctx.font = `${st.font}px sans-serif`
      ctx.fillText(st.text, st.x, st.y)
    }
    ctx.restore()
  }

  function pointAt(e: PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function pushStamps(items: Stamp[]) {
    stampsRef.current.push(...items)
    historyRef.current.push({ kind: 'stamp', n: items.length })
    redoRef.current = []
    render(padRef.current?.toData() ?? [])
  }
  function stampAt(x: number, y: number, txt: string) {
    if (!txt) return
    const font = SIZES[sizeRef.current].font
    const items: Stamp[] = [{ x, y, text: txt, font }]
    if (symmetryRef.current) items.push({ x: cssW() - x, y, text: txt, font })
    pushStamps(items)
  }
  function paintCell(x: number, y: number) {
    const cell = SIZES[sizeRef.current].cell
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell)
    const key = `${cx},${cy}:${cell}`
    const map = pixelsRef.current
    if (!dragRef.current.changes.some((c) => c.key === key)) dragRef.current.changes.push({ key, prev: map.get(key) })
    if (colorRef.current === PAPER) map.delete(key)
    else map.set(key, colorRef.current)
  }
  function paintPixel(x: number, y: number) {
    paintCell(x, y)
    if (symmetryRef.current) paintCell(cssW() - x, y)
    render(padRef.current?.toData() ?? [])
  }
  useEffect(() => {
    if (!open || !canvasRef.current) return
    const canvas = canvasRef.current
    const s = SIZES[sizeRef.current]
    const pad = new SignaturePad(canvas, { backgroundColor: PAPER, penColor: colorRef.current, minWidth: s.min, maxWidth: s.max, dotSize: s.dot })
    padRef.current = pad
    // A finished pen stroke (mirrored too when symmetry is on) is one undo step.
    const onEnd = () => {
      const data = pad.toData()
      let n = 1
      if (symmetryRef.current) {
        const last = data[data.length - 1]
        if (last) {
          const w = cssW()
          data.push({ ...last, points: last.points.map((p) => ({ ...p, x: w - p.x })) })
          n = 2
        }
      }
      historyRef.current.push({ kind: 'stroke', n })
      redoRef.current = []
      render(data)
    }
    pad.addEventListener('endStroke', onEnd)

    const onDown = (e: PointerEvent) => {
      const { x, y } = pointAt(e)
      if (modeRef.current === 'pen') return
      canvas.setPointerCapture?.(e.pointerId)
      if (modeRef.current === 'sticker') return stampAt(x, y, stickerRef.current)
      if (modeRef.current === 'text') return stampAt(x, y, textRef.current.trim())
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
      if (changes.length) { historyRef.current.push({ kind: 'pixel', changes }); redoRef.current = [] }
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    const resize = () => {
      const data = pad.toData()
      const r = ratio()
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * r
      canvas.height = rect.height * r
      canvas.getContext('2d')?.scale(r, r)
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
      redoRef.current = []
    }
    // Handlers read live settings from refs; build the pad once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    baseImgRef.current = null
    if (!open || !initial) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { baseImgRef.current = img; render(padRef.current?.toData() ?? []) }
    img.src = initial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  // Pen draws only in pen mode; in sticker/pixel/text modes signature_pad is off.
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    pad.off()
    if (mode === 'pen') pad.on()
  }, [mode])
  useEffect(() => { if (padRef.current) padRef.current.penColor = color }, [color])
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const s = SIZES[size]
    pad.minWidth = s.min; pad.maxWidth = s.max; pad.dotSize = s.dot
  }, [size])

  function pickColor(c: string) {
    setColor(c)
    if (!COLORS.includes(c) && c !== PAPER) setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 6))
  }

  if (!open) return null

  const undo = () => {
    const op = historyRef.current.pop()
    if (!op) return
    if (op.kind === 'stroke') {
      const data = padRef.current?.toData() ?? []
      const strokes = data.splice(data.length - op.n, op.n)
      redoRef.current.push({ kind: 'stroke', strokes })
      render(data)
    } else if (op.kind === 'stamp') {
      const stamps = stampsRef.current.splice(stampsRef.current.length - op.n, op.n)
      redoRef.current.push({ kind: 'stamp', stamps })
      render(padRef.current?.toData() ?? [])
    } else {
      const map = pixelsRef.current
      const changes = op.changes.map((c) => ({ key: c.key, prev: c.prev, next: map.get(c.key) }))
      for (const c of op.changes) { if (c.prev === undefined) map.delete(c.key); else map.set(c.key, c.prev) }
      redoRef.current.push({ kind: 'pixel', changes })
      render(padRef.current?.toData() ?? [])
    }
  }
  const redo = () => {
    const op = redoRef.current.pop()
    if (!op) return
    if (op.kind === 'stroke') {
      const data = padRef.current?.toData() ?? []
      data.push(...op.strokes)
      historyRef.current.push({ kind: 'stroke', n: op.strokes.length })
      render(data)
    } else if (op.kind === 'stamp') {
      stampsRef.current.push(...op.stamps)
      historyRef.current.push({ kind: 'stamp', n: op.stamps.length })
      render(padRef.current?.toData() ?? [])
    } else {
      const map = pixelsRef.current
      for (const c of op.changes) { if (c.next === undefined) map.delete(c.key); else map.set(c.key, c.next) }
      historyRef.current.push({ kind: 'pixel', changes: op.changes.map((c) => ({ key: c.key, prev: c.prev })) })
      render(padRef.current?.toData() ?? [])
    }
  }
  const clear = () => {
    pixelsRef.current.clear()
    stampsRef.current = []
    historyRef.current = []
    redoRef.current = []
    render([])
  }

  const hasContent = () =>
    !!padRef.current && (!padRef.current.isEmpty() || stampsRef.current.length > 0 || pixelsRef.current.size > 0)
  const isEmpty = () => !hasContent() && !baseImgRef.current && tpl === 'none'

  const MAX_EDGE = 1280
  function exportBlob(cb: (blob: Blob | null) => void) {
    const canvas = canvasRef.current
    if (!canvas) return cb(null)
    const scale = Math.min(1, MAX_EDGE / Math.max(canvas.width, canvas.height))
    if (scale >= 1) return canvas.toBlob(cb, 'image/png')
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(canvas.width * scale))
    off.height = Math.max(1, Math.round(canvas.height * scale))
    const ctx = off.getContext('2d')
    if (!ctx) return canvas.toBlob(cb, 'image/png')
    ctx.drawImage(canvas, 0, 0, off.width, off.height)
    off.toBlob(cb, 'image/png')
  }
  const save = () => {
    if (isEmpty()) return onCancel()
    setBusy(true)
    exportBlob((blob) => { setBusy(false); if (blob) onSave(blob) })
  }
  const share = () => {
    if (isEmpty() || busy) return
    exportBlob((blob) => {
      if (!blob) return
      const file = new File([blob], 'babillard-dessin.png', { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.canShare?.({ files: [file] })) { void nav.share({ files: [file] }).catch(() => {}); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
    })
  }
  const makeRoutine = () => {
    if (!onMakeRoutine || isEmpty() || busy) return
    exportBlob((blob) => { if (blob) onMakeRoutine(blob) })
  }

  const MODES: { key: Mode; icon: Parameters<typeof Icon>[0]['name']; label: string }[] = [
    { key: 'pen', icon: 'paint-brush-bold', label: t.memo.drawPen },
    { key: 'sticker', icon: 'smiley-bold', label: t.memo.drawSticker },
    { key: 'pixel', icon: 'square-bold', label: t.memo.drawPixel },
    ...(toddler ? [] : [{ key: 'text' as Mode, icon: 'file-text-bold' as const, label: t.memo.drawText }]),
  ]
  const TEMPLATES: { key: TemplateKind; label: string }[] = [
    { key: 'none', label: t.memo.tplNone },
    { key: 'lines', label: t.memo.tplLines },
    { key: 'trace', label: t.memo.tplTrace },
    { key: 'dots', label: t.memo.tplDots },
    { key: 'coloring', label: t.memo.tplColoring },
  ]

  return (
    <div
      ref={rootRef}
      className={'drawpad' + (toddler ? ' drawpad--kid' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? t.memo.editTitle : t.memo.drawTitle}
    >
      <div className="drawpad__bar">
        <div className="drawpad__modes" role="group" aria-label={t.memo.tool}>
          {MODES.map((m) => (
            <button key={m.key} type="button" className={'drawpad__mode' + (mode === m.key ? ' is-on' : '')} onClick={() => setMode(m.key)} aria-label={m.label} aria-pressed={mode === m.key}>
              <Icon name={m.icon} size={18} />
            </button>
          ))}
          {/* Mirror / kaleidoscope — everything you draw is echoed across the middle. */}
          <button type="button" className={'drawpad__mode' + (symmetry ? ' is-on' : '')} onClick={() => setSymmetry((v) => !v)} aria-label={t.memo.symmetry} aria-pressed={symmetry}>
            <Icon name="sparkle-bold" size={18} />
          </button>
        </div>

        {mode === 'text' ? (
          <input
            className="input drawpad__text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.memo.textPlaceholder}
            aria-label={t.memo.drawText}
            maxLength={24}
          />
        ) : mode === 'sticker' ? (
          <div className="drawpad__stickers">
            <div className="drawpad__packs" role="group" aria-label={t.memo.drawSticker}>
              {PACKS.map((p, i) => (
                <button key={p.key} type="button" className={'drawpad__pack' + (pack === i ? ' is-on' : '')} onClick={() => { setPack(i); setSticker(p.items[0]) }} aria-label={t.memo.packs[p.key as keyof typeof t.memo.packs]} aria-pressed={pack === i}>
                  {p.icon}
                </button>
              ))}
            </div>
            <div className="drawpad__stickerset" role="group">
              {PACKS[pack].items.map((e) => (
                <button key={e} type="button" className={'drawpad__sticker' + (sticker === e ? ' is-on' : '')} onClick={() => setSticker(e)} aria-label={e} aria-pressed={sticker === e}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="drawpad__colors">
            {COLORS.map((c) => (
              <button key={c} type="button" className={'drawpad__swatch' + (color === c ? ' is-on' : '')} style={{ background: c }} onClick={() => pickColor(c)} aria-label={t.memo.pen} aria-pressed={color === c} />
            ))}
            <button type="button" className={'drawpad__swatch drawpad__eraser' + (color === PAPER ? ' is-on' : '')} style={{ background: PAPER }} onClick={() => pickColor(PAPER)} aria-label={t.memo.eraser} aria-pressed={color === PAPER} />
            {recent.map((c) => (
              <button key={c} type="button" className={'drawpad__swatch' + (color === c ? ' is-on' : '')} style={{ background: c }} onClick={() => pickColor(c)} aria-label={t.memo.recent} aria-pressed={color === c} />
            ))}
            {!toddler && (
              <label className="drawpad__swatch drawpad__custom" aria-label={t.memo.customColor} style={{ background: color }}>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'} onChange={(e) => pickColor(e.target.value)} />
                <span aria-hidden="true">+</span>
              </label>
            )}
          </div>
        )}

        <div className="drawpad__sizes" role="group" aria-label={t.memo.size}>
          {SIZES.map((s, i) => (
            <button key={s.key} type="button" className={'drawpad__size' + (size === i ? ' is-on' : '')} onClick={() => setSize(i)} aria-label={t.memo.size} aria-pressed={size === i}>
              <span className="drawpad__dot" style={{ width: s.ui, height: s.ui }} />
            </button>
          ))}
        </div>

        <div className="drawpad__tools">
          <button type="button" className="drawpad__tool" onClick={undo} aria-label={t.memo.undo}><Icon name="arrow-counter-clockwise-bold" size={18} /></button>
          <button type="button" className="drawpad__tool" onClick={redo} aria-label={t.memo.redo}><Icon name="repeat-bold" size={18} /></button>
          <button type="button" className="drawpad__tool" onClick={clear} aria-label={t.memo.clear}><Icon name="trash-bold" size={18} /></button>
        </div>
      </div>

      {/* Template row: a learning/creative guide under the drawing. */}
      <div className="drawpad__tplbar">
        <span className="drawpad__tpllabel mono" aria-hidden="true"><Icon name="book-open-bold" size={15} /> {t.memo.template}</span>
        {TEMPLATES.map((tp) => (
          <button key={tp.key} type="button" className={'chip' + (tpl === tp.key ? ' is-on' : '')} onClick={() => setTpl(tp.key)} aria-pressed={tpl === tp.key}>
            {tp.label}
          </button>
        ))}
        {tpl === 'trace' && (
          <div className="drawpad__tracepick" role="group" aria-label={t.memo.tplTrace}>
            {TRACE_CHARS.map((c) => (
              <button key={c} type="button" className={'drawpad__trace' + (traceCh === c ? ' is-on' : '')} onClick={() => setTraceCh(c)} aria-label={c} aria-pressed={traceCh === c}>{c}</button>
            ))}
          </div>
        )}
        {tpl === 'coloring' && (
          <div className="drawpad__tracepick" role="group" aria-label={t.memo.tplColoring}>
            {COLORING.map((sh) => (
              <button key={sh} type="button" className={'chip' + (shape === sh ? ' is-on' : '')} onClick={() => setShape(sh)} aria-pressed={shape === sh}>{t.memo.shapes[sh]}</button>
            ))}
          </div>
        )}
      </div>

      <div className="drawpad__stage">
        <canvas ref={canvasRef} className="drawpad__canvas" />
        {mode === 'pixel' && <div className="drawpad__grid" aria-hidden="true" style={{ '--cell': `${SIZES[size].cell}px` } as React.CSSProperties} />}
      </div>

      <div className="drawpad__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t.memo.cancel}</button>
        <div className="drawpad__actions-end">
          {!toddler && <button type="button" className="btn btn--ghost" onClick={share} disabled={busy}>{t.memo.share}</button>}
          {!toddler && onMakeRoutine && (
            <button type="button" className="btn btn--ghost" onClick={makeRoutine} disabled={busy}><Icon name="baby-bold" size={18} /> {t.memo.routine}</button>
          )}
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}><Icon name="check-bold" size={18} /> {t.memo.save}</button>
        </div>
      </div>
    </div>
  )
}
