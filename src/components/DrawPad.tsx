import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { getStroke } from 'perfect-freehand'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { CERCLE_KEY, MEMBERS_KEY } from '../lib/queryKeys'
import { useRecipes } from '../lib/queryHooks'
import { drawTraceLine, measureTrace, wrapTrace } from '../lib/traceFont'
import { useModal } from '../lib/useModal'
import {
  type Viewport,
  IDENTITY,
  toContent,
  settle,
  pinch as pinchView,
  zoomAt,
} from '../lib/drawViewport'
import { Icon } from './Icon'

// The family draw pad for a fridge note (#14) — useful + educational, ~80% for the
// kids. Tools: freehand PEN (perfect-freehand), tap-to-stamp STICKER packs, chunky
// PIXEL grid (with flood-FILL), drag-out SHAPES, and a TEXT stamp. Across all:
// MIRROR/kaleidoscope, UNDO/REDO, a family rainbow + custom/recent colours, three
// sizes, paper-colour eraser. A collapsible TEMPLATE layer sits under the drawing —
// ruled handwriting lines, a letter/number to trace, dot paper, or a colour-in
// outline.
//
// NON-DESTRUCTIVE (#1): a drawing is stored as an editable SCENE (the strokes,
// stamps, pixels, shapes + the template), not just a flat PNG. Re-opening rebuilds
// those layers, so adding on top NEVER destroys what someone drew before — the
// earlier marks are still there, on their own layers, and saving keeps them all.
// (The PNG is still produced for the board glance + sharing.) Old PNG-only drawings
// degrade gracefully: no scene → load the PNG as a flat base image to draw over.
//
// Performance: the canvas backing store is capped at 2× DPR (a full-screen tablet
// canvas at 3× was multi-MB and could OOM/crash), pixel painting skips repeats and
// coalesces redraws to one per animation frame, and export is size-capped.
// `useModal` + CSS lock the page so a stroke can't scroll/select behind it.
// `toddler` trims the toolbar to the big, safe, fun controls.
const PAPER = '#fffdf7'
const COLORS = [
  '#2b2b2b', '#C2563A', '#E8632E', '#D9842A', '#F2B705', '#6B8A52',
  '#3FA796', '#5891AC', '#3D6BB5', '#7E5BB0', '#95527A', '#E4739B',
]
// Per-size geometry. `pen` = freehand stroke width fed to perfect-freehand (CSS px);
// the live preview and the committed stroke use the SAME value + renderer, so there's
// no width jump on release. `max` = shape line width; `cell` = pixel-grid cell;
// `font` = sticker/text glyph size; `ui` = the size-picker dot.
const SIZES = [
  { key: 's', pen: 3, max: 2.5, ui: 8, cell: 16, font: 30 },
  { key: 'm', pen: 6, max: 5, ui: 13, cell: 26, font: 48 },
  { key: 'l', pen: 12, max: 11, ui: 19, cell: 40, font: 72 },
] as const
const PACKS: { key: string; icon: string; items: string[] }[] = [
  { key: 'faces', icon: '😀', items: ['😀', '😄', '😍', '🤩', '😎', '😇', '🥳', '😴', '🤗', '😜'] },
  { key: 'animals', icon: '🐱', items: ['🐱', '🐶', '🐰', '🐻', '🦊', '🐸', '🐥', '🦄', '🐝', '🐢'] },
  { key: 'nature', icon: '🌈', items: ['🌈', '🌸', '🌻', '🌳', '⭐', '🌙', '☀️', '❄️', '⚡', '🍄'] },
  { key: 'seasons', icon: '🎃', items: ['🎃', '🎄', '🎁', '🍁', '🌷', '⛄', '🍀', '🎆', '🦃', '💝'] },
  { key: 'things', icon: '🚗', items: ['🚗', '⚽', '🏠', '🎈', '🍎', '🍦', '🎨', '📚', '🚀', '🎵'] },
  { key: 'abc', icon: '🔤', items: ['A', 'B', 'C', '1', '2', '3', '❤', '★', '✓', '?'] },
]
// #37 letter tracing — capital + lowercase shown together (Aa Bb…), plus digits,
// plus whole WORDS to trace (a name from Le cercle / the household, or a recipe).
const TRACE_PAIRS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => c + c.toLowerCase())
const TRACE_DIGITS = '0123456789'.split('')
// Make a word safe for the single-stroke font (A–Z a–z 0–9 space - '): fold accents
// to base letters (the font has no « é »), drop other punctuation, keep ≤2 words so
// it fits a tracing row. "Léa" → "Lea", "Macaroni chinois" → "Macaroni chinois".
function cleanTraceWord(raw: string | undefined | null): string {
  const folded = (raw ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const words = folded.replace(/[^A-Za-z0-9 '-]/g, ' ').split(/\s+/).filter(Boolean)
  return words.slice(0, 2).join(' ').slice(0, 18)
}
type TemplateKind = 'none' | 'lines' | 'trace' | 'dots' | 'coloring'
// #37 — the coloring-page library a toddler picks a faint outline from, then
// traces/colours over. The first six draw via shapePath (also the user shape
// tool); the rest are coloring-only pictures drawn by drawColoring (independent
// strokes, so no shape ever connects to another).
const COLORING = ['star', 'heart', 'flower', 'house', 'fish', 'sun', 'cloud', 'tree', 'balloon', 'car', 'cat', 'butterfly', 'boat'] as const
type ColoringShape = (typeof COLORING)[number]
// The six that shapePath knows (shared with the user shape tool); the others are
// coloring-only and handled in drawColoring.
const SHAPEPATH_COLORING: readonly string[] = ['star', 'heart', 'flower', 'house', 'fish', 'sun']
const SHAPE_TYPES = ['line', 'rect', 'oval', 'tri', 'star', 'heart'] as const
type ShapeType = (typeof SHAPE_TYPES)[number]
const SHAPE_GLYPH: Record<ShapeType, string> = { line: '╱', rect: '▭', oval: '◯', tri: '△', star: '★', heart: '♥' }

type Mode = 'pen' | 'sticker' | 'pixel' | 'text' | 'shape' | 'fill'
type Stamp = { x: number; y: number; text: string; font: number }
type Shape = { type: ShapeType; x0: number; y0: number; x1: number; y1: number; color: string; size: number }
type PixelChange = { key: string; prev: string | undefined }
// A freehand pen stroke (content coords). Rendered by perfect-freehand's getStroke()
// — the SAME call drives the live preview and the committed stroke, so what you draw
// is exactly what's kept (no signature_pad radius-vs-diameter width jump on release).
// `size` is the stroke width in CSS px; `color` is the pen colour (or PAPER = eraser).
type Pt = { x: number; y: number; p: number }
type Stroke = { pts: Pt[]; color: string; size: number }
// A paint-bucket fill: a seed point (content coords) + colour, REPLAYED over the
// rendered raster each render rather than baked to a flat bitmap, so it stays in
// the editable scene (#1) and survives re-opening. See `applyFills`.
type Fill = { x: number; y: number; color: string }
type Op =
  | { kind: 'stroke'; n: number }
  | { kind: 'stamp'; n: number }
  | { kind: 'shape'; n: number }
  | { kind: 'pixel'; changes: PixelChange[] }
  | { kind: 'fill'; n: number }
  | { kind: 'snapshot'; before: LayerSnapshot; after: LayerSnapshot } // Aplatir / Effacer
type Redo =
  | { kind: 'stroke'; strokes: Stroke[] }
  | { kind: 'stamp'; stamps: Stamp[] }
  | { kind: 'shape'; shapes: Shape[] }
  | { kind: 'pixel'; changes: { key: string; prev: string | undefined; next: string | undefined }[] }
  | { kind: 'fill'; fills: Fill[] }
  | { kind: 'snapshot'; before: LayerSnapshot; after: LayerSnapshot }
// The editable, persisted drawing (#1) — everything needed to rebuild the layers.
// `base` is an optional baked-in raster (a `data:` PNG) produced by "Aplatir"
// (flatten): the layers above are merged into one frozen image so a fill can't
// re-flood and new strokes land cleanly on top. It rides under the (now empty or
// fresh) vector layers, exactly like an `initial` base image but stored in-scene.
type Scene = { v: 1; strokes: Stroke[]; stamps: Stamp[]; pixels: [string, string][]; shapes: Shape[]; fills?: Fill[]; base?: string; template: { kind: TemplateKind; ch: string; shape: ColoringShape } }
const SCENE_MAX = 1_500_000 // chars — skip persisting an unusually heavy scene
// A full in-memory snapshot of every layer, used to make whole-canvas ops (Aplatir,
// Effacer) undoable: undo restores `before`, redo restores `after`. The base is the
// live HTMLImageElement (already decoded), so undo/redo is synchronous — no reload.
type LayerSnapshot = {
  base: HTMLImageElement | null
  hadPhoto: boolean
  alpha: number
  strokes: Stroke[]
  stamps: Stamp[]
  shapes: Shape[]
  fills: Fill[]
  pixels: [string, string][]
}
// localStorage draft so closing the pad (Annuler, an accidental nav, a crash) never
// loses an in-progress drawing — the scene is auto-saved a beat after you stop and
// recovered on the next open of the same target. One slot at a time (pruned).
const DRAFT_PREFIX = 'bb:drawpad:'
// Cap the undo history so a long session (the "15 min of drawing" case) can't grow
// the stack without bound — snapshot ops in particular retain a full layer copy + an
// image, so an uncapped stack is a real memory risk. Oldest steps fall off the bottom
// (you can still undo the most recent HISTORY_MAX actions); drawn content is untouched.
const HISTORY_MAX = 120

// ── Template painters (faint, drawn under the drawing). CSS-px space. ──
function tplLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const band = Math.max(64, h / 8)
  ctx.lineWidth = 1.5
  for (let y = band; y < h; y += band) {
    ctx.strokeStyle = 'rgba(72,120,180,0.45)'; ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    ctx.strokeStyle = 'rgba(72,120,180,0.28)'; ctx.setLineDash([7, 7])
    ctx.beginPath(); ctx.moveTo(0, y - band / 2); ctx.lineTo(w, y - band / 2); ctx.stroke()
  }
  ctx.setLineDash([])
}
function tplDots(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  const g = 32
  for (let y = g; y < h; y += g) for (let x = g; x < w; x += g) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill() }
}
function tplTrace(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  tplLines(ctx, w, h)
  // SINGLE-LINE (monoline) glyphs from lib/traceFont — one thin dashed centreline
  // per pen-stroke, not the bold double-walled outline of a serif font. Each row
  // sits on a ruled line; a long name/word wraps to the next line. Letters big but
  // sized so a row fits the width.
  const band = Math.max(64, h / 8)
  const cap = band * 0.62
  const margin = band * 0.3
  const maxW = (w - 2 * margin) / cap // available width in cap-height units
  const rows = text.trim() ? wrapTrace(text, maxW) : []
  const maxRows = Math.max(1, Math.floor((h - band * 0.15) / band))
  ctx.save()
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.005)
  ctx.strokeStyle = 'rgba(40,40,40,0.34)'
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.setLineDash([6, 7])
  rows.slice(0, maxRows).forEach((row, i) => {
    const baseline = band * (i + 1)
    const rowW = measureTrace(row) * cap
    const startX = Math.max(margin, (w - rowW) / 2)
    drawTraceLine(ctx, row, startX, baseline, cap)
  })
  ctx.setLineDash([])
  ctx.restore()
}
function shapePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, shape: ColoringShape | 'tri') {
  ctx.beginPath()
  if (shape === 'heart') {
    for (let t = 0; t <= Math.PI * 2 + 0.05; t += 0.04) {
      const hx = 16 * Math.sin(t) ** 3
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      const x = cx + (hx / 16) * r, y = cy - (hy / 16) * r
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
  } else if (shape === 'tri') {
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.92, cy + r * 0.8); ctx.lineTo(cx - r * 0.92, cy + r * 0.8); ctx.closePath()
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
    ctx.ellipse(cx - r * 0.15, cy, r, r * 0.6, 0, 0, Math.PI * 2)
    ctx.moveTo(cx + r * 0.8, cy); ctx.lineTo(cx + r * 1.3, cy - r * 0.4); ctx.lineTo(cx + r * 1.3, cy + r * 0.4); ctx.closePath()
  }
  ctx.stroke()
}
// Draw one coloring outline centred at (cx,cy), radius r. The six shapePath shapes
// route through it; the toddler picture set (cloud…boat) is drawn here with one
// stroke PER sub-part, so a multi-part picture never draws a stray connecting line.
function drawColoring(ctx: CanvasRenderingContext2D, shape: ColoringShape, cx: number, cy: number, r: number) {
  if (SHAPEPATH_COLORING.includes(shape)) { shapePath(ctx, cx, cy, r, shape); return }
  const circle = (x: number, y: number, rr: number) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke() }
  const line = (x0: number, y0: number, x1: number, y1: number) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke() }
  const ell = (x: number, y: number, rx: number, ry: number, rot: number) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.stroke() }
  const poly = (pts: [number, number][], close = true) => {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.stroke()
  }
  if (shape === 'cloud') {
    circle(cx - r * 0.5, cy + r * 0.12, r * 0.42); circle(cx, cy - r * 0.15, r * 0.52); circle(cx + r * 0.5, cy + r * 0.12, r * 0.42)
  } else if (shape === 'tree') {
    poly([[cx, cy - r], [cx + r * 0.7, cy + r * 0.35], [cx - r * 0.7, cy + r * 0.35]])
    poly([[cx - r * 0.13, cy + r * 0.35], [cx - r * 0.13, cy + r * 0.85], [cx + r * 0.13, cy + r * 0.85], [cx + r * 0.13, cy + r * 0.35]], false)
  } else if (shape === 'balloon') {
    ell(cx, cy - r * 0.2, r * 0.6, r * 0.75, 0)
    poly([[cx - r * 0.1, cy + r * 0.5], [cx + r * 0.1, cy + r * 0.5], [cx, cy + r * 0.62]])
    line(cx, cy + r * 0.62, cx, cy + r)
  } else if (shape === 'car') {
    poly([
      [cx - r, cy + r * 0.15], [cx - r, cy - r * 0.1], [cx - r * 0.5, cy - r * 0.1], [cx - r * 0.35, cy - r * 0.5],
      [cx + r * 0.4, cy - r * 0.5], [cx + r * 0.55, cy - r * 0.1], [cx + r, cy - r * 0.1], [cx + r, cy + r * 0.15],
    ])
    circle(cx - r * 0.5, cy + r * 0.22, r * 0.22); circle(cx + r * 0.5, cy + r * 0.22, r * 0.22)
  } else if (shape === 'cat') {
    circle(cx, cy + r * 0.15, r * 0.55)
    poly([[cx - r * 0.5, cy - r * 0.15], [cx - r * 0.6, cy - r * 0.65], [cx - r * 0.15, cy - r * 0.35]])
    poly([[cx + r * 0.5, cy - r * 0.15], [cx + r * 0.6, cy - r * 0.65], [cx + r * 0.15, cy - r * 0.35]])
  } else if (shape === 'butterfly') {
    line(cx, cy - r * 0.55, cx, cy + r * 0.55)
    ell(cx - r * 0.42, cy - r * 0.2, r * 0.4, r * 0.3, -0.4); ell(cx + r * 0.42, cy - r * 0.2, r * 0.4, r * 0.3, 0.4)
    ell(cx - r * 0.34, cy + r * 0.3, r * 0.3, r * 0.24, 0.5); ell(cx + r * 0.34, cy + r * 0.3, r * 0.3, r * 0.24, -0.5)
  } else {
    // boat — hull, mast, sail
    poly([[cx - r * 0.7, cy + r * 0.3], [cx + r * 0.7, cy + r * 0.3], [cx + r * 0.45, cy + r * 0.7], [cx - r * 0.45, cy + r * 0.7]])
    line(cx, cy + r * 0.3, cx, cy - r * 0.7)
    poly([[cx, cy - r * 0.65], [cx, cy + r * 0.2], [cx + r * 0.55, cy + r * 0.2]])
  }
}
function tplColoring(ctx: CanvasRenderingContext2D, w: number, h: number, shape: ColoringShape) {
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,40,40,0.30)'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  drawColoring(ctx, shape, w / 2, h / 2, Math.min(w, h) * 0.34); ctx.restore()
}
function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.lineWidth = Math.max(2, s.size)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const x = Math.min(s.x0, s.x1), y = Math.min(s.y0, s.y1), w = Math.abs(s.x1 - s.x0), h = Math.abs(s.y1 - s.y0)
  if (s.type === 'line') { ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke() }
  else if (s.type === 'rect') ctx.strokeRect(x, y, w, h)
  else if (s.type === 'oval') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.stroke() }
  else shapePath(ctx, x + w / 2, y + h / 2, Math.max(w, h) / 2, s.type) // tri / star / heart
  ctx.restore()
}

// ── Freehand pen (perfect-freehand) ─────────────────────────────────────────────
// getStroke() turns the input points into a filled OUTLINE polygon. The live preview
// and the committed stroke both call this with the same points, so they're identical —
// no width jump on release. `streamline`/`smoothing` give a calm, smooth line; mild
// `thinning` adds a gentle pressure/velocity taper (same in preview + final).
// Cache each COMMITTED stroke's outline by object identity: strokes are never mutated
// after commit, so a re-render (and the fill double-draw, which redraws the ink twice)
// reuses the polygon instead of recomputing getStroke every frame. The live preview
// builds a fresh Stroke each frame (cache miss = one compute), which is fine.
const outlineCache = new WeakMap<Stroke, number[][]>()
function strokeOutline(st: Stroke): number[][] {
  const hit = outlineCache.get(st)
  if (hit) return hit
  const out = getStroke(st.pts.map((p) => [p.x, p.y, p.p]), {
    size: st.size,
    thinning: 0.45,
    smoothing: 0.55,
    streamline: 0.55,
    simulatePressure: true,
    last: true,
  })
  outlineCache.set(st, out)
  return out
}
function drawFreehand(ctx: CanvasRenderingContext2D, st: Stroke) {
  const out = strokeOutline(st)
  ctx.save()
  ctx.fillStyle = st.color
  if (out.length < 2) {
    // A single tap (or a degenerate stroke) → draw a dot so a tap always leaves a mark.
    const p = st.pts[0]
    if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, st.size / 2), 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
    return
  }
  ctx.beginPath()
  ctx.moveTo(out[0][0], out[0][1])
  for (let i = 1; i < out.length; i++) ctx.lineTo(out[i][0], out[i][1])
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
// Read a stored stroke, tolerating the OLD signature_pad PointGroup shape (points[] +
// penColor + min/maxWidth) so drawings saved before the perfect-freehand switch still
// open. New strokes already match the Stroke shape and pass straight through.
function normStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (Array.isArray(r.pts)) {
    const pts = (r.pts as Pt[]).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    return pts.length ? { pts, color: typeof r.color === 'string' ? r.color : '#2b2b2b', size: typeof r.size === 'number' ? r.size : 6 } : null
  }
  if (Array.isArray(r.points)) {
    const pts = (r.points as { x: number; y: number; pressure?: number }[])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: p.x, y: p.y, p: typeof p.pressure === 'number' ? p.pressure : 0.5 }))
    if (!pts.length) return null
    const min = typeof r.minWidth === 'number' ? r.minWidth : 2
    const max = typeof r.maxWidth === 'number' ? r.maxWidth : 4
    return { pts, color: typeof r.penColor === 'string' ? r.penColor : '#2b2b2b', size: Math.max(2, min + max) }
  }
  return null
}

// ── Paint-bucket flood fill (raster) ───────────────────────────────────────────
// A `#rrggbb` (or rgb-ish) colour → [r,g,b]. PAPER and the swatches are all 6-digit
// hex; anything unparseable falls back to black so a fill is never invisible.
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
// Classic 4-neighbour flood fill on a raw RGBA buffer (device pixels), from the
// seed pixel outward, replacing the contiguous run of near-same-colour pixels with
// `col`. A `seen` bitmap (not just the colour test) bounds it so a fill colour that
// sits within tolerance of the target can't loop forever. Tolerance is generous
// enough to cross a stroke's anti-aliased skirt yet stop at the solid ink — same
// "leaks through a gap in the outline" behaviour as Paint's bucket.
// `seen`/`gen` is a reusable visited buffer (one allocation per applyFills pass, not
// per fill): a cell counts as visited this fill when seen[p] === gen, so no clearing
// between fills. Keeps a big drawing's flood fills from churning the GC every render.
function floodFillRaster(data: Uint8ClampedArray, W: number, H: number, sx: number, sy: number, col: [number, number, number], seen: Uint8Array, gen: number) {
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return
  const start = (sy * W + sx) * 4
  const tr = data[start], tg = data[start + 1], tb = data[start + 2]
  const [fr, fg, fb] = col
  // Already the fill colour at the seed → nothing to do.
  if ((tr - fr) ** 2 + (tg - fg) ** 2 + (tb - fb) ** 2 <= 4) return
  const TOL = 48 * 48 // squared RGB distance treated as "same region"
  const stack = [sy * W + sx]
  while (stack.length) {
    const p = stack.pop()!
    if (seen[p] === gen) continue
    seen[p] = gen
    const i = p * 4
    const dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb
    if (dr * dr + dg * dg + db * db > TOL) continue
    data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255
    const x = p % W, y = (p - x) / W
    if (x > 0) stack.push(p - 1)
    if (x < W - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - W)
    if (y < H - 1) stack.push(p + W)
  }
}

export function DrawPad({
  open,
  onCancel,
  onSave,
  onKeep,
  onMakeRoutine,
  initial,
  initialSceneUrl,
  filigrane,
  pickPhotoOnOpen,
  toddler,
}: {
  open: boolean
  onCancel: () => void
  // Save hands up the flat PNG (board glance / share) AND the editable scene JSON
  // ('' if too heavy to persist) so the caller can store both (#1).
  onSave: (png: Blob, scene: string) => void
  // Optional "Garder": keep a copy in the lasting gallery (separate from pinning to
  // the fridge). Shown as its own action when provided. Same (png, scene) payload.
  onKeep?: (png: Blob, scene: string) => void
  onMakeRoutine?: (png: Blob, scene: string) => void
  // Fallback for old PNG-only drawings: drawn as a flat, non-editable base layer.
  initial?: string
  // Preferred: a URL to the editable scene JSON; rebuilt into editable layers.
  initialSceneUrl?: string
  // #14 "Calquer": load `initial` as a FADED, removable tracing layer (a watermark
  // photo) instead of editable strokes — you redraw over the original and the caller
  // saves a NEW copy, leaving the source drawing untouched. The fade slider / remove
  // controls (#14b) apply to it, so the guide can be dialled or cleared before saving.
  filigrane?: boolean
  // #14b — open straight into the "draw over a photo" flow: prompts for a photo and
  // shows a one-tap "Choisir une photo" target over the empty stage until one is set.
  pickPhotoOnOpen?: boolean
  toddler?: boolean
}) {
  const t = useT()
  // #37 word tracing — names + recipe titles a child can trace ("trace your name").
  // Household members + Le cercle for names, the recipe book for words; folded to
  // the font's A–Z a–z 0–9 alphabet, deduped, capped. Shared caches (cheap).
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: { display_name: string }[] }>('members'), enabled: open })
  const cercleQ = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<{ contacts: { firstName?: string; name?: string }[] }>('cercle'), enabled: open })
  const recipesQ = useRecipes()
  const traceWords = useMemo(() => {
    const raw = [
      ...(membersQ.data?.members ?? []).map((m) => m.display_name),
      ...(cercleQ.data?.contacts ?? []).map((c) => c.firstName || c.name || ''),
      ...(recipesQ.data?.recipes ?? []).map((r) => r.title),
    ]
    const out: string[] = []
    const seen = new Set<string>()
    for (const r of raw) {
      const word = cleanTraceWord(r)
      const key = word.toLowerCase()
      if (!word || word.length < 2 || seen.has(key)) continue
      seen.add(key)
      out.push(word)
      if (out.length >= 16) break
    }
    return out
  }, [membersQ.data, cercleQ.data, recipesQ.data])
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Committed freehand strokes (source of truth; rendered by perfect-freehand).
  const strokesRef = useRef<Stroke[]>([])
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  // #14b — alpha for the base image. 1 for an old PNG-only drawing (drawn opaque,
  // unchanged); a user-picked watermark photo starts faint so the drawing reads on
  // top. WYSIWYG: whatever fade is shown is what bakes into the saved PNG, so 0%
  // erases the photo (a clean trace) and 100% keeps it (annotating the photo).
  const photoAlphaRef = useRef(1)
  const pixelsRef = useRef<Map<string, string>>(new Map())
  const stampsRef = useRef<Stamp[]>([])
  const shapesRef = useRef<Shape[]>([])
  const fillsRef = useRef<Fill[]>([])
  const previewRef = useRef<Shape | null>(null)
  // Offscreen snapshot of the committed canvas, captured once at the start of a
  // live shape drag. While dragging we blit this + draw the preview on top, so a
  // shape preview costs O(1) per frame instead of re-rasterizing every stroke via
  // signature_pad's fromData (the source of both the lag and the per-frame stroke
  // shimmer on previous lines).
  const snapshotRef = useRef<HTMLCanvasElement | null>(null)
  const historyRef = useRef<Op[]>([])
  const redoRef = useRef<Redo[]>([])
  const rafRef = useRef<number | null>(null)
  const modeRef = useRef<Mode>('pen')
  const colorRef = useRef<string>(COLORS[0])
  const sizeRef = useRef<number>(1)
  const stickerRef = useRef<string>(PACKS[0].items[0])
  const textRef = useRef<string>('')
  const symmetryRef = useRef<boolean>(false)
  const fillRef = useRef<boolean>(false)
  const shapeTypeRef = useRef<ShapeType>('rect')
  const tplRef = useRef<{ kind: TemplateKind; ch: string; shape: ColoringShape }>({ kind: 'none', ch: 'Aa', shape: 'star' })
  const dragRef = useRef<{ active: boolean; changes: PixelChange[]; last: string | null }>({ active: false, changes: [], last: null })
  const shapeDragRef = useRef<{ active: boolean; x0: number; y0: number } | null>(null)
  // The one pointer that owns the in-progress gesture — a second finger on a
  // tablet is ignored so it can't reset a drag or bake a ghost into the snapshot.
  const activePointerRef = useRef<number | null>(null)
  // Canvas rect cached at gesture start; reused for the move/up of that gesture so
  // a fast drag doesn't call getBoundingClientRect() on every pointer event.
  const rectRef = useRef<DOMRect | null>(null)
  // Zoom/pan viewport (#14): two-finger pinch zooms + pans, one finger draws, the
  // wheel / ± buttons zoom on desktop. content↔screen mapping lives in lib/drawViewport;
  // EVERY pointer is inverse-mapped to content coords so a stroke lands where the
  // finger is even at 4×. signature_pad is the renderer only (fromData) — it can't map
  // a zoomed coordinate itself, so the pen is driven through these handlers too.
  const viewRef = useRef<Viewport>({ ...IDENTITY })
  // All active pointers (canvas-relative CSS px), so a 2nd finger switches a draw into
  // a pinch and the gesture state machine knows how many fingers are down.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef<'idle' | 'draw' | 'pinch'>('idle')
  const pinchRef = useRef<{ startView: Viewport; startMid: { x: number; y: number }; startDist: number } | null>(null)
  // In-progress freehand pen stroke (content coords). We collect samples here and, on
  // pointer-up, commit a Stroke — both the live preview and the commit render through
  // the same perfect-freehand path, so the line never changes on release.
  const penDragRef = useRef<{ points: { x: number; y: number; pressure: number; time: number }[] } | null>(null)
  // Tap-to-place tools (sticker / text / fill) commit on pointer-UP, not down, so
  // starting a two-finger pinch-zoom can't drop a stray stamp/fill where the first
  // finger landed (the old "rainbow emoji bottom-right" bug). A pinch or a drag past
  // TAP_SLOP cancels the pending tap.
  const tapRef = useRef<{ x: number; y: number; mode: Mode } | null>(null)

  const [mode, setMode] = useState<Mode>('pen')
  const [color, setColor] = useState<string>(COLORS[0])
  const [recent, setRecent] = useState<string[]>([])
  const [size, setSize] = useState(1)
  const [pack, setPack] = useState(0)
  const [sticker, setSticker] = useState(PACKS[0].items[0])
  const [text, setText] = useState('')
  const [symmetry, setSymmetry] = useState(false)
  const [fill, setFill] = useState(false)
  const [shapeType, setShapeType] = useState<ShapeType>('rect')
  const [tpl, setTpl] = useState<TemplateKind>('none')
  const [tplOpen, setTplOpen] = useState(false)
  const [traceCh, setTraceCh] = useState('Aa')
  const [shape, setShape] = useState<ColoringShape>('star')
  const [hasPhoto, setHasPhoto] = useState(false) // a user watermark photo is loaded
  const [photoAlpha, setPhotoAlpha] = useState(0.4)
  const [busy, setBusy] = useState(false)
  // Mirror of viewRef.z (×100) purely for the UI badge / reset button. The drawing
  // itself reads viewRef directly so a pinch never waits on React.
  const [zoomPct, setZoomPct] = useState(100)
  // Two toddler "stay in the drawing" locks (a child just wants to draw, not drive
  // the chrome). ZOOM lock: a second finger no longer pinch-zooms — it's ignored, so
  // the first finger keeps drawing and the page can't end up stuck at 4×. EXIT lock:
  // the bottom action row (Annuler / Garder / Partager / Épingler…) is disabled so a
  // stray tap can't leave the drawing. Both are toggled from the toolbar (out of the
  // toddler's main draw zone) and a parent flips them back. zoomLock needs a ref —
  // the pointer handlers read it from inside the open-effect's stale closure.
  const [zoomLock, setZoomLock] = useState(false)
  const [exitLock, setExitLock] = useState(false)
  const zoomLockRef = useRef(false)
  // Draft auto-save plumbing. `committedRef` flips on Save/Garder/Routine so the
  // teardown drops the draft instead of re-saving committed work as a "draft".
  const draftTimerRef = useRef<number | null>(null)
  const committedRef = useRef(false)
  const [showDraftHint, setShowDraftHint] = useState(false)
  // Stable per-target draft slot. Use the URL *pathname* (not the whole signed URL)
  // so a re-signed scene URL still recovers the same draft; a brand-new pad keys to
  // 'new'. One slot per drawing target.
  const draftKey = useMemo(() => {
    const raw = initialSceneUrl || initial || ''
    let id = 'new'
    if (raw) { try { id = new URL(raw, location.href).pathname } catch { id = raw } }
    return DRAFT_PREFIX + id
  }, [initial, initialSceneUrl])

  useEffect(() => void (modeRef.current = mode), [mode])
  useEffect(() => void (colorRef.current = color), [color])
  useEffect(() => void (sizeRef.current = size), [size])
  useEffect(() => void (stickerRef.current = sticker), [sticker])
  useEffect(() => void (textRef.current = text), [text])
  useEffect(() => void (symmetryRef.current = symmetry), [symmetry])
  useEffect(() => void (fillRef.current = fill), [fill])
  useEffect(() => void (shapeTypeRef.current = shapeType), [shapeType])
  useEffect(() => void (zoomLockRef.current = zoomLock), [zoomLock])
  useEffect(() => {
    tplRef.current = { kind: tpl, ch: traceCh, shape }
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, traceCh, shape])
  // #14b — the watermark fade slider repaints the base photo at the new alpha.
  // Only touch the alpha ref when a watermark/calque photo is actually loaded:
  // photoAlpha's state default (0.4) is the slider's resting value, NOT the opacity
  // of a plain base image. A flat base PNG (an old scene-less drawing re-opened to
  // MODIFY/COPY) must render at the opaque useRef(1) default — otherwise it'd come
  // back faded, looking like an unwanted « filigrane ».
  useEffect(() => {
    if (!hasPhoto) return
    photoAlphaRef.current = photoAlpha
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoAlpha])

  useModal(rootRef, onCancel, { open })

  // While the pad is open, neutralize the browser's swipe-left / swipe-right
  // history navigation (Android edge-swipe back, macOS/Chrome trackpad two-finger
  // swipe). touch-action:none stops the canvas from scrolling, but back/forward is a
  // NAVIGATION gesture the CSS can't reach — a stray horizontal drag mid-stroke could
  // otherwise yank you off the board and lose the drawing. We hold one extra same-URL
  // history entry: a back/forward gesture pops it, we immediately re-push and stay put
  // (no route change — the sentinel sits on the page the pad opened from). The entry
  // is dropped again on close so the history stack stays clean.
  useEffect(() => {
    if (!open) return
    const SENTINEL = '__drawpad_nav_guard__'
    history.pushState({ [SENTINEL]: true }, '')
    const onPop = () => { history.pushState({ [SENTINEL]: true }, '') }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Drop our sentinel if it's still the current entry (closed via UI, not a back
      // gesture); the listener is already off so this back step is silent.
      if (history.state?.[SENTINEL]) history.back()
    }
  }, [open])

  const ratio = () => Math.min(Math.max(window.devicePixelRatio || 1, 1), 2) // cap 2× → bounded memory
  const cssW = () => (canvasRef.current ? canvasRef.current.width / ratio() : 0)
  const cssH = () => (canvasRef.current ? canvasRef.current.height / ratio() : 0)

  // Set the canvas transform to the current viewport: content (CSS px) → device px,
  // device = ratio · (z · content + offset). Used by render() and the live previews.
  function applyViewport(ctx: CanvasRenderingContext2D) {
    const v = viewRef.current
    const r = ratio()
    ctx.setTransform(r * v.z, 0, 0, r * v.z, r * v.ox, r * v.oy)
  }

  // Draw the ink layer: freehand strokes (perfect-freehand) + shapes + the live shape
  // preview. Called twice when there are fills (once to bound them, once on top).
  function drawInk(ctx: CanvasRenderingContext2D) {
    for (const st of strokesRef.current) drawFreehand(ctx, st)
    for (const s of shapesRef.current) drawShape(ctx, s)
    if (previewRef.current) drawShape(ctx, previewRef.current)
  }
  function render(skipTemplate = false) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Clear to PAPER at IDENTITY (covers the whole device canvas), then apply the
    // zoom/pan viewport so every content layer is drawn in stable content coords.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    applyViewport(ctx)
    const w = canvas.width / ratio()
    const h = canvas.height / ratio()
    ctx.save()
    const tp = tplRef.current
    if (!skipTemplate) {
      if (tp.kind === 'lines') tplLines(ctx, w, h)
      else if (tp.kind === 'dots') tplDots(ctx, w, h)
      else if (tp.kind === 'trace') tplTrace(ctx, w, h, tp.ch)
      else if (tp.kind === 'coloring') tplColoring(ctx, w, h, tp.shape)
    }
    const img = baseImgRef.current
    if (img && img.width && img.height) {
      const s = Math.min(w / img.width, h / img.height)
      // #14b — a user watermark photo draws at the chosen fade; an old flat base PNG
      // (photoAlphaRef stays 1) is unaffected. globalAlpha is restored by ctx.restore().
      ctx.globalAlpha = photoAlphaRef.current
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s)
      ctx.globalAlpha = 1
    }
    for (const [key, col] of pixelsRef.current) {
      const [coords, cellStr] = key.split(':')
      const [cx, cy] = coords.split(',').map(Number)
      const cell = Number(cellStr)
      ctx.fillStyle = col
      ctx.fillRect(cx * cell, cy * cell, cell, cell)
    }
    ctx.restore()
    drawInk(ctx)
    // Paint-bucket fills: flood the ink-bounded raster, then redraw the ink ON TOP, so
    // a fill stops at the outlines yet NEVER hides a stroke — you can draw over a filled
    // area and the new mark stays visible (fixes the "drawing hides under fill" feel).
    // No fills → none of this runs (a fill-free drawing pays nothing).
    if (fillsRef.current.length) {
      applyFills(ctx)
      drawInk(ctx)
    }
    ctx.save()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const st of stampsRef.current) { ctx.font = `${st.font}px sans-serif`; ctx.fillText(st.text, st.x, st.y) }
    ctx.restore()
    if (!skipTemplate) scheduleDraftSave() // a real paint changed something → checkpoint the draft
  }
  // Replay every bucket fill onto the current canvas in ONE read/modify/write pass.
  // getImageData/putImageData work in device pixels (transform-independent), so the
  // content-space seed is mapped through the live viewport first. No-op when empty,
  // so a fill-free drawing pays nothing.
  function applyFills(ctx: CanvasRenderingContext2D) {
    const fills = fillsRef.current
    const canvas = canvasRef.current
    if (!fills.length || !canvas) return
    const W = canvas.width, H = canvas.height
    // getImageData throws on a cross-origin-tainted canvas; swallow so a base image
    // without CORS just can't be bucket-filled rather than breaking every render.
    let img: ImageData
    try { img = ctx.getImageData(0, 0, W, H) } catch { return }
    const r = ratio()
    const v = viewRef.current
    const seen = new Uint8Array(W * H) // one reusable visited buffer for the whole pass
    let gen = 0
    for (const f of fills) {
      if (++gen > 255) { seen.fill(0); gen = 1 } // Uint8 generation wrap (≥255 fills)
      const dx = Math.round(r * (v.z * f.x + v.ox))
      const dy = Math.round(r * (v.z * f.y + v.oy))
      floodFillRaster(img.data, W, H, dx, dy, hexToRgb(f.color), seen, gen)
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.putImageData(img, 0, 0)
    ctx.restore()
  }
  function addFill(x: number, y: number) {
    const items: Fill[] = [{ x, y, color: colorRef.current }]
    if (symmetryRef.current) items.push({ x: cssW() - x, y, color: colorRef.current })
    fillsRef.current.push(...items)
    pushOp({ kind: 'fill', n: items.length })
    redoRef.current = []
    render()
  }
  // Push an undo step, capping the stack from the bottom so a long session can't grow
  // it without bound. Dropping the oldest steps never touches drawn content.
  function pushOp(op: Op) {
    const h = historyRef.current
    h.push(op)
    if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX)
  }
  // Deep-copy the current strokes so a snapshot can't be mutated by later edits.
  function grabStrokes(): Stroke[] {
    return strokesRef.current.map((s) => ({ color: s.color, size: s.size, pts: s.pts.map((p) => ({ ...p })) }))
  }
  // Capture every layer right now (for an undoable whole-canvas op).
  function snapNow(): LayerSnapshot {
    return {
      base: baseImgRef.current, hadPhoto: hasPhoto, alpha: photoAlphaRef.current,
      strokes: grabStrokes(), stamps: [...stampsRef.current], shapes: [...shapesRef.current],
      fills: [...fillsRef.current], pixels: [...pixelsRef.current],
    }
  }
  // Restore a full snapshot (undo/redo of Aplatir / Effacer). Synchronous — the base
  // is an already-decoded image element.
  function applySnapshot(s: LayerSnapshot) {
    baseImgRef.current = s.base
    photoAlphaRef.current = s.alpha
    setHasPhoto(s.hadPhoto)
    setPhotoAlpha(s.alpha)
    pixelsRef.current = new Map(s.pixels)
    stampsRef.current = [...s.stamps]
    shapesRef.current = [...s.shapes]
    fillsRef.current = [...s.fills]
    strokesRef.current = s.strokes.map((st) => ({ color: st.color, size: st.size, pts: st.pts.map((p) => ({ ...p })) }))
    render()
  }

  // ── Draft auto-save (localStorage) ──────────────────────────────────────────
  function pruneDrafts(keep: string) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && k.startsWith(DRAFT_PREFIX) && k !== keep) localStorage.removeItem(k)
      }
    } catch { /* storage disabled */ }
  }
  function writeDraftNow() {
    if (draftTimerRef.current != null) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null }
    // Only brand-new pads keep a recoverable draft (see the recovery guard); editing a
    // saved drawing leaves the server copy as the source of truth.
    if (initial || initialSceneUrl) return
    try {
      if (!hasContent()) { localStorage.removeItem(draftKey); return }
      const json = sceneJson()
      if (!json) return // too heavy to persist (rare) — leave the prior draft alone
      pruneDrafts(draftKey)
      localStorage.setItem(draftKey, `{"scene":${json},"ts":${Date.now()}}`)
    } catch { /* quota / disabled — best-effort */ }
  }
  // Debounced: the timer RESETS on each paint, so a serialize happens once ~0.8 s after
  // you STOP — never mid-stroke (a big scene is costly to JSON.stringify, so coalescing
  // matters). Only brand-new pads draft (edits keep the server copy as source of truth).
  function scheduleDraftSave() {
    if (committedRef.current) return // saved already → don't resurrect committed work
    if (initial || initialSceneUrl) return // edit pad → no draft
    if (draftTimerRef.current != null) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = window.setTimeout(() => { draftTimerRef.current = null; writeDraftNow() }, 800)
  }
  function clearDraft() {
    if (draftTimerRef.current != null) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null }
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
  }
  // Coalesce rapid paints (pixel drag) to one full redraw per frame.
  function scheduleRender() {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; render() })
  }
  // Freeze the committed drawing into an offscreen buffer (device-pixel space).
  function captureSnapshot() {
    const canvas = canvasRef.current
    if (!canvas) return
    const snap = snapshotRef.current ?? (snapshotRef.current = document.createElement('canvas'))
    snap.width = canvas.width
    snap.height = canvas.height
    const sctx = snap.getContext('2d')
    if (sctx) { sctx.clearRect(0, 0, snap.width, snap.height); sctx.drawImage(canvas, 0, 0) }
  }
  // Live shape drag: blit the frozen snapshot + draw the preview on top. No
  // fromData, so cost is constant regardless of how much was already drawn.
  function renderShapePreview() {
    const canvas = canvasRef.current
    const snap = snapshotRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !snap || !ctx || !previewRef.current) return // drag ended → leave the committed render alone
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0) // snapshot is device-pixel; draw 1:1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(snap, 0, 0)
    ctx.restore() // back to the viewport transform → preview uses content coords
    const p = previewRef.current
    drawShape(ctx, p)
    if (symmetryRef.current) { const w = cssW(); drawShape(ctx, { ...p, x0: w - p.x0, x1: w - p.x1 }) } // mirror, matching commitShape
  }
  // Coalesce shape-preview frames to one blit per animation frame.
  function schedulePreview() {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; renderShapePreview() })
  }

  // Build a Stroke from collected pointer samples. The SAME function feeds the live
  // preview and the committed stroke, so perfect-freehand renders them identically —
  // what you see while dragging is exactly what's kept (no width jump on release).
  function makeStroke(pts: { x: number; y: number; pressure: number }[], color: string): Stroke {
    return { pts: pts.map((p) => ({ x: p.x, y: p.y, p: p.pressure })), color, size: SIZES[sizeRef.current].pen }
  }
  // Live freehand pen: blit the frozen snapshot + draw the in-progress stroke on top
  // (O(1) per frame). Uses drawFreehand — the exact renderer used on commit.
  function renderPenPreview() {
    const canvas = canvasRef.current
    const snap = snapshotRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !snap || !ctx || !penDragRef.current) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(snap, 0, 0)
    ctx.restore() // back to the viewport transform
    const pts = penDragRef.current.points
    drawFreehand(ctx, makeStroke(pts, colorRef.current))
    if (symmetryRef.current) { const w = cssW(); drawFreehand(ctx, makeStroke(pts.map((p) => ({ ...p, x: w - p.x })), colorRef.current)) }
  }
  function schedulePenPreview() {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; renderPenPreview() })
  }

  function pointAt(e: PointerEvent) {
    const rect = rectRef.current ?? canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  // Screen → content: every tool reads this so a tap lands on the right pixel at any
  // zoom/pan (pointAt stays the raw CSS-px, used for pinch midpoints + the wheel anchor).
  function contentAt(e: PointerEvent) {
    const p = pointAt(e)
    return toContent(viewRef.current, p.x, p.y)
  }
  // Commit the freehand stroke being previewed (one or both, with symmetry) into the
  // stroke list + history, then one re-render. Called on pointer-up; a 2nd finger landing
  // mid-stroke instead DROPS it (cancelDrawForPinch) — you meant to pinch.
  function commitPenStroke() {
    const drag = penDragRef.current
    penDragRef.current = null
    if (!drag || !drag.points.length) { render(); return }
    strokesRef.current.push(makeStroke(drag.points, colorRef.current))
    let n = 1
    if (symmetryRef.current) {
      const w = cssW()
      strokesRef.current.push(makeStroke(drag.points.map((p) => ({ ...p, x: w - p.x })), colorRef.current))
      n = 2
    }
    pushOp({ kind: 'stroke', n })
    redoRef.current = []
    render()
  }
  // Push the current viewport to the UI badge + repaint. Called after any pinch/wheel.
  function applyView(next: Viewport) {
    viewRef.current = next
    setZoomPct(Math.round(next.z * 100))
    render()
  }
  function pushStamps(items: Stamp[]) {
    stampsRef.current.push(...items)
    pushOp({ kind: 'stamp', n: items.length })
    redoRef.current = []
    render()
  }
  function stampAt(x: number, y: number, txt: string) {
    if (!txt) return
    const font = SIZES[sizeRef.current].font
    const items: Stamp[] = [{ x, y, text: txt, font }]
    if (symmetryRef.current) items.push({ x: cssW() - x, y, text: txt, font })
    pushStamps(items)
  }
  function setCell(x: number, y: number, cell: number) {
    // Key embeds the cell size, so pixels painted at one brush size sit on a
    // different grid than another — flood-fill / eraser only see same-cell cells.
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell)
    const key = `${cx},${cy}:${cell}`
    const map = pixelsRef.current
    if (!dragRef.current.changes.some((c) => c.key === key)) dragRef.current.changes.push({ key, prev: map.get(key) })
    if (colorRef.current === PAPER) map.delete(key)
    else map.set(key, colorRef.current)
  }
  function paintPixel(x: number, y: number) {
    const cell = SIZES[sizeRef.current].cell
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell)
    const tag = `${cx},${cy}`
    if (dragRef.current.last === tag) return // same cell as last move — skip the redraw
    dragRef.current.last = tag
    setCell(x, y, cell)
    if (symmetryRef.current) setCell(cssW() - x, y, cell)
    scheduleRender()
  }
  // Flood-fill the contiguous run of like-valued grid cells from (x,y) — the pixel
  // "bucket". Bounded by the visible grid (cap guards a pathological canvas).
  function floodFill(x: number, y: number) {
    const cell = SIZES[sizeRef.current].cell
    const cols = Math.ceil(cssW() / cell), rows = Math.ceil(cssH() / cell)
    const map = pixelsRef.current
    const at = (cx: number, cy: number) => map.get(`${cx},${cy}:${cell}`)
    const sx = Math.floor(x / cell), sy = Math.floor(y / cell)
    const target = at(sx, sy)
    const fillVal = colorRef.current === PAPER ? undefined : colorRef.current
    if (target === fillVal) return
    const changes: PixelChange[] = []
    const seen = new Set<string>()
    const stack: [number, number][] = [[sx, sy]]
    let guard = cols * rows + 1
    while (stack.length && guard-- > 0) {
      const [cx, cy] = stack.pop()!
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue
      const tag = `${cx},${cy}`
      if (seen.has(tag)) continue
      seen.add(tag)
      if (at(cx, cy) !== target) continue
      const key = `${cx},${cy}:${cell}`
      changes.push({ key, prev: map.get(key) })
      if (fillVal === undefined) map.delete(key); else map.set(key, fillVal)
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
    }
    if (changes.length) { pushOp({ kind: 'pixel', changes }); redoRef.current = [] }
    render()
  }
  function commitShape(s: Shape) {
    const items = [s]
    if (symmetryRef.current) {
      const w = cssW()
      items.push({ ...s, x0: w - s.x0, x1: w - s.x1 })
    }
    shapesRef.current.push(...items)
    pushOp({ kind: 'shape', n: items.length })
    redoRef.current = []
    previewRef.current = null
    render()
  }

  useEffect(() => {
    if (!open || !canvasRef.current) return
    committedRef.current = false // fresh session: until a Save lands, work is a draft
    const canvas = canvasRef.current

    // ── one finger draws, two fingers pinch-zoom + pan ──────────────────────────
    const beginDraw = (e: PointerEvent) => {
      committedRef.current = false // a new mark after a Save/Garder → draft it again
      const m = modeRef.current
      const c = contentAt(e)
      // Tap tools wait for pointer-up (a clean tap), so a pinch start can't drop one.
      if (m === 'sticker' || m === 'text' || m === 'fill') { tapRef.current = { x: c.x, y: c.y, mode: m }; return }
      if (m === 'shape') { captureSnapshot(); shapeDragRef.current = { active: true, x0: c.x, y0: c.y }; return }
      if (m === 'pixel') {
        if (fillRef.current) { floodFill(c.x, c.y); return }
        dragRef.current = { active: true, changes: [], last: null }
        paintPixel(c.x, c.y)
        return
      }
      // pen — collect content-space points; the snapshot makes the live preview O(1).
      captureSnapshot()
      penDragRef.current = { points: [{ x: c.x, y: c.y, pressure: e.pressure || 0.5, time: Date.now() }] }
      schedulePenPreview()
    }
    const continueDraw = (e: PointerEvent) => {
      const m = modeRef.current
      const c = contentAt(e)
      // A pending tap that drags too far is a pan, not a tap → cancel it (no stamp).
      if (tapRef.current) {
        const dx = c.x - tapRef.current.x, dy = c.y - tapRef.current.y
        if (dx * dx + dy * dy > 12 * 12) tapRef.current = null
        return
      }
      if (m === 'pixel' && dragRef.current.active && !fillRef.current) { paintPixel(c.x, c.y); return }
      if (m === 'shape' && shapeDragRef.current?.active) {
        const d = shapeDragRef.current
        previewRef.current = { type: shapeTypeRef.current, x0: d.x0, y0: d.y0, x1: c.x, y1: c.y, color: colorRef.current, size: SIZES[sizeRef.current].max }
        schedulePreview()
        return
      }
      if (m === 'pen' && penDragRef.current) {
        penDragRef.current.points.push({ x: c.x, y: c.y, pressure: e.pressure || 0.5, time: Date.now() })
        schedulePenPreview()
      }
    }
    const endDraw = (e: PointerEvent) => {
      const m = modeRef.current
      // A completed single-finger tap places the sticker / text / fill.
      if (tapRef.current) {
        const tap = tapRef.current
        tapRef.current = null
        const c = contentAt(e)
        if (tap.mode === 'sticker') stampAt(c.x, c.y, stickerRef.current)
        else if (tap.mode === 'text') stampAt(c.x, c.y, textRef.current.trim())
        else if (tap.mode === 'fill') addFill(c.x, c.y)
        return
      }
      if (m === 'pixel' && dragRef.current.active) {
        const { changes } = dragRef.current
        dragRef.current = { active: false, changes: [], last: null }
        if (changes.length) { pushOp({ kind: 'pixel', changes }); redoRef.current = [] }
      } else if (m === 'shape' && shapeDragRef.current?.active) {
        const d = shapeDragRef.current
        const c = contentAt(e)
        shapeDragRef.current = null
        previewRef.current = null
        if (Math.abs(c.x - d.x0) > 3 || Math.abs(c.y - d.y0) > 3)
          commitShape({ type: shapeTypeRef.current, x0: d.x0, y0: d.y0, x1: c.x, y1: c.y, color: colorRef.current, size: SIZES[sizeRef.current].max })
        else render()
      } else if (m === 'pen') {
        commitPenStroke()
      }
    }
    // A 2nd finger landed mid-draw: keep what's already committed (pixel cells are
    // discrete), drop the pen/shape preview, and hand off to the pinch.
    const cancelDrawForPinch = () => {
      if (modeRef.current === 'pixel' && dragRef.current.active) {
        const { changes } = dragRef.current
        dragRef.current = { active: false, changes: [], last: null }
        if (changes.length) { pushOp({ kind: 'pixel', changes }); redoRef.current = [] }
      }
      shapeDragRef.current = null
      penDragRef.current = null
      tapRef.current = null // a pinch started — drop any pending sticker/text/fill tap
      previewRef.current = null
      render()
    }
    const startPinch = () => {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = {
        startView: { ...viewRef.current },
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      }
    }
    const doPinch = () => {
      const pr = pinchRef.current
      if (!pr) return
      const [a, b] = [...pointersRef.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      applyView(pinchView(pr.startView, pr.startMid, pr.startDist, mid, dist, cssW(), cssH()))
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return // ignore right/middle click
      rectRef.current = rectRef.current ?? canvas.getBoundingClientRect()
      const rect = rectRef.current
      pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      canvas.setPointerCapture?.(e.pointerId)
      if (pointersRef.current.size >= 2) {
        // Zoom locked (toddler): ignore the extra finger entirely so the first one
        // keeps drawing — no pinch, the page can't be zoomed away. The pointer stays
        // tracked (harmless) and is dropped on its own up.
        if (zoomLockRef.current) return
        if (gestureRef.current === 'draw') cancelDrawForPinch()
        gestureRef.current = 'pinch'
        activePointerRef.current = null
        startPinch()
        return
      }
      gestureRef.current = 'draw'
      activePointerRef.current = e.pointerId
      beginDraw(e)
    }
    const onMove = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return
      const rect = rectRef.current ?? canvas.getBoundingClientRect()
      pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      if (gestureRef.current === 'pinch') { if (pointersRef.current.size >= 2) doPinch(); return }
      if (gestureRef.current === 'draw' && e.pointerId === activePointerRef.current) continueDraw(e)
    }
    const onUp = (e: PointerEvent) => {
      canvas.releasePointerCapture?.(e.pointerId) // explicit release (also auto on up)
      const wasActive = e.pointerId === activePointerRef.current
      pointersRef.current.delete(e.pointerId)
      if (gestureRef.current === 'draw' && wasActive) {
        endDraw(e)
        activePointerRef.current = null
        gestureRef.current = 'idle'
      } else if (gestureRef.current === 'pinch' && pointersRef.current.size < 2) {
        pinchRef.current = null
        applyView(settle(viewRef.current, cssW(), cssH()))
        // Stay 'pinch'-locked while one finger remains, so it can't start a stray
        // stroke; only fall back to 'idle' once every finger is up.
        if (pointersRef.current.size === 0) gestureRef.current = 'idle'
      }
      if (pointersRef.current.size === 0) rectRef.current = null
    }
    // Desktop: wheel zooms toward the cursor (no pinch on a trackpad/mouse).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (zoomLockRef.current) return // zoom locked: swallow the wheel, don't zoom
      const rect = rectRef.current ?? canvas.getBoundingClientRect()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      applyView(zoomAt(viewRef.current, factor, e.clientX - rect.left, e.clientY - rect.top, cssW(), cssH()))
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // The stage is flex:1 under a toolbar whose height changes as tools open
    // (sticker packs, the template bar, the text field…). Those reflows resize the
    // canvas WITHOUT firing a window 'resize', so the backing store kept its old
    // size — signature_pad then mapped clientX/Y at the wrong scale and the ink
    // drifted from the finger, more the further you drew. A ResizeObserver re-syncs
    // on any layout change. Guards: skip no-op fires (RO double-fires same size) and
    // never resize mid-gesture (setting canvas.width clears the live stroke).
    let lastW = 0, lastH = 0
    const resize = () => {
      const r = ratio()
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width * r))
      const h = Math.max(1, Math.round(rect.height * r))
      if (w === lastW && h === lastH) return
      if (gestureRef.current !== 'idle') return // never resize mid draw/pinch
      lastW = w; lastH = h
      canvas.width = w
      canvas.height = h
      // Re-clamp the viewport to the new size (a toolbar opening shrinks the stage);
      // render() reads viewRef + the stroke list so content stays put across resizes.
      viewRef.current = settle(viewRef.current, w / r, h / r)
      setZoomPct(Math.round(viewRef.current.z * 100))
      render()
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)
    window.addEventListener('resize', resize)
    return () => {
      // Persist (or drop) the draft BEFORE the canvas is torn down — closing the pad
      // any way (Annuler, nav-away, unmount) must not lose an in-progress drawing.
      if (committedRef.current) clearDraft(); else writeDraftNow()
      ro?.disconnect()
      window.removeEventListener('resize', resize)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      strokesRef.current = []
      baseImgRef.current = null
      photoAlphaRef.current = 1
      setHasPhoto(false)
      pixelsRef.current = new Map()
      stampsRef.current = []
      shapesRef.current = []
      fillsRef.current = []
      setShowDraftHint(false)
      previewRef.current = null
      snapshotRef.current = null
      shapeDragRef.current = null
      activePointerRef.current = null
      rectRef.current = null
      historyRef.current = []
      redoRef.current = []
      // Reset the viewport so re-opening the pad starts fitted at 1×.
      viewRef.current = { ...IDENTITY }
      pointersRef.current.clear()
      gestureRef.current = 'idle'
      pinchRef.current = null
      penDragRef.current = null
      setZoomPct(100)
      // Re-open starts unlocked — the locks are a per-session, parent-set choice.
      zoomLockRef.current = false
      setZoomLock(false)
      setExitLock(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Load an existing drawing: prefer the editable SCENE (#1, lossless layers); fall
  // back to the flat PNG base image for old scene-less drawings.
  useEffect(() => {
    baseImgRef.current = null
    if (!open) return
    let cancelled = false
    // `asPhoto` loads the base as the #14b watermark layer (faded + removable) — used
    // for "Calquer", where the original is only a tracing guide, not editable content.
    const loadBase = (asPhoto = false) => {
      if (!initial) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (cancelled) return
        baseImgRef.current = img
        if (asPhoto) { photoAlphaRef.current = 0.4; setPhotoAlpha(0.4); setHasPhoto(true) }
        render()
      }
      img.src = initial
    }
    // Rebuild every editable layer from a Scene (the stored scene, or a recovered
    // draft). Returns false on a non-v1 object so the fetch path can fall back.
    const loadSceneObject = (s: Scene): boolean => {
      if (s?.v !== 1) return false
      stampsRef.current = Array.isArray(s.stamps) ? s.stamps : []
      shapesRef.current = Array.isArray(s.shapes) ? s.shapes : []
      fillsRef.current = Array.isArray(s.fills) ? s.fills : []
      pixelsRef.current = new Map(Array.isArray(s.pixels) ? s.pixels : [])
      // normStroke tolerates the old signature_pad PointGroup shape (back-compat).
      strokesRef.current = (Array.isArray(s.strokes) ? s.strokes : []).map(normStroke).filter((x): x is Stroke => !!x)
      if (s.template?.kind) { setTpl(s.template.kind); setTraceCh(s.template.ch || 'Aa'); setShape(s.template.shape || 'star'); tplRef.current = s.template }
      // A flattened (baked) base, if any, loads as the opaque bottom layer.
      if (typeof s.base === 'string' && s.base.startsWith('data:')) {
        const bi = new Image()
        bi.onload = () => { if (!cancelled) { baseImgRef.current = bi; photoAlphaRef.current = 1; render() } }
        bi.src = s.base
      }
      render()
      return true
    }
    // Draft recovery — only for a brand-new pad (no source drawing). There it's an
    // unambiguous win: an interrupted fresh drawing comes back, and "Repartir à zéro"
    // cleanly blanks it. For editing a SAVED drawing the stored scene is the source of
    // truth (and "start fresh" would have to mean "reload the original", not blank), so
    // we don't auto-restore over it. Photo-trace entry flows want a clean stage too.
    if (!filigrane && !pickPhotoOnOpen && !initial && !initialSceneUrl) {
      try {
        const raw = localStorage.getItem(draftKey)
        const draft = raw ? (JSON.parse(raw)?.scene as Scene | undefined) : undefined
        if (draft && loadSceneObject(draft)) { setShowDraftHint(true); return () => { cancelled = true } }
      } catch { /* unreadable draft → fall through to the normal load */ }
    }
    // Calquer: ignore the editable scene; the original rides as a faded tracing layer.
    if (filigrane) { loadBase(true); return () => { cancelled = true } }
    if (initialSceneUrl) {
      fetch(initialSceneUrl)
        .then((r) => r.text())
        .then((txt) => {
          if (cancelled) return
          if (!loadSceneObject(JSON.parse(txt) as Scene)) throw new Error('bad scene')
        })
        .catch(() => { if (!cancelled) loadBase() }) // unreadable scene → flat base image
    } else {
      loadBase()
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, initialSceneUrl, filigrane, pickPhotoOnOpen, draftKey])

  // #14b — load a chosen photo as the watermark base layer (drawn under every other
  // layer, like `initial` but with an adjustable fade). The bytes stay client-side —
  // only the flattened PNG is ever uploaded — so this needs no R2/endpoint change.
  function loadPhotoUrl(url: string, revoke: boolean) {
    const img = new Image()
    img.onload = () => {
      baseImgRef.current = img
      setHasPhoto(true)
      photoAlphaRef.current = 0.4
      setPhotoAlpha(0.4)
      render()
      if (revoke) URL.revokeObjectURL(url)
    }
    img.onerror = () => { if (revoke) URL.revokeObjectURL(url) }
    img.src = url
  }
  function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = '' // allow re-picking the same file
    if (file) loadPhotoUrl(URL.createObjectURL(file), true)
  }
  function removePhoto() {
    baseImgRef.current = null
    photoAlphaRef.current = 1
    setHasPhoto(false)
    render()
  }
  // Opened via "Sur une photo": try to surface the file picker immediately (the
  // tap that opened the pad is usually still a live user gesture). If a browser
  // blocks the programmatic click, the centred "Choisir une photo" prompt over the
  // empty stage is the one-tap fallback.
  useEffect(() => {
    if (open && pickPhotoOnOpen && !hasPhoto) photoInputRef.current?.click()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pickPhotoOnOpen])

  function pickColor(c: string) {
    setColor(c)
    if (!COLORS.includes(c) && c !== PAPER) setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 6))
  }
  // Locking the zoom also snaps back to a fitted 1× page, so a child isn't left
  // stranded mid-zoom with no way to pinch back out.
  function toggleZoomLock() {
    const next = !zoomLock
    setZoomLock(next)
    if (next) applyView({ ...IDENTITY })
  }

  if (!open) return null

  const undo = () => {
    const op = historyRef.current.pop()
    if (!op) return
    if (op.kind === 'stroke') {
      redoRef.current.push({ kind: 'stroke', strokes: strokesRef.current.splice(strokesRef.current.length - op.n, op.n) })
      render()
    } else if (op.kind === 'stamp') {
      redoRef.current.push({ kind: 'stamp', stamps: stampsRef.current.splice(stampsRef.current.length - op.n, op.n) })
      render()
    } else if (op.kind === 'shape') {
      redoRef.current.push({ kind: 'shape', shapes: shapesRef.current.splice(shapesRef.current.length - op.n, op.n) })
      render()
    } else if (op.kind === 'fill') {
      redoRef.current.push({ kind: 'fill', fills: fillsRef.current.splice(fillsRef.current.length - op.n, op.n) })
      render()
    } else if (op.kind === 'snapshot') {
      redoRef.current.push(op)
      applySnapshot(op.before)
    } else {
      const map = pixelsRef.current
      const changes = op.changes.map((c) => ({ key: c.key, prev: c.prev, next: map.get(c.key) }))
      for (const c of op.changes) { if (c.prev === undefined) map.delete(c.key); else map.set(c.key, c.prev) }
      redoRef.current.push({ kind: 'pixel', changes })
      render()
    }
  }
  const redo = () => {
    const op = redoRef.current.pop()
    if (!op) return
    if (op.kind === 'stroke') {
      strokesRef.current.push(...op.strokes)
      pushOp({ kind: 'stroke', n: op.strokes.length })
      render()
    } else if (op.kind === 'stamp') {
      stampsRef.current.push(...op.stamps)
      pushOp({ kind: 'stamp', n: op.stamps.length })
      render()
    } else if (op.kind === 'shape') {
      shapesRef.current.push(...op.shapes)
      pushOp({ kind: 'shape', n: op.shapes.length })
      render()
    } else if (op.kind === 'fill') {
      fillsRef.current.push(...op.fills)
      pushOp({ kind: 'fill', n: op.fills.length })
      render()
    } else if (op.kind === 'snapshot') {
      pushOp(op)
      applySnapshot(op.after)
    } else {
      const map = pixelsRef.current
      for (const c of op.changes) { if (c.next === undefined) map.delete(c.key); else map.set(c.key, c.next) }
      pushOp({ kind: 'pixel', changes: op.changes.map((c) => ({ key: c.key, prev: c.prev })) })
      render()
    }
  }
  // Effacer is now UNDOABLE: it records a snapshot op (the deleted layers) so a
  // mis-tap of the trash is one Annuler away — like every other delete in the pad.
  // The base image (a watermark / flattened layer) is kept, matching prior behaviour.
  const clear = () => {
    const before = snapNow()
    // A flattened (baked) drawing lives in the base image — clearing must remove it too,
    // or "Effacer" looks like it did nothing. A watermark / initial photo guide is kept.
    const flatBase = before.base?.src?.startsWith('data:') ?? false
    const had = before.strokes.length || before.stamps.length || before.shapes.length || before.fills.length || before.pixels.length || flatBase
    pixelsRef.current = new Map(); stampsRef.current = []; shapesRef.current = []; fillsRef.current = []
    if (flatBase) baseImgRef.current = null
    if (had) {
      const after: LayerSnapshot = { base: flatBase ? null : before.base, hadPhoto: before.hadPhoto, alpha: before.alpha, strokes: [], stamps: [], shapes: [], fills: [], pixels: [] }
      pushOp({ kind: 'snapshot', before, after })
      redoRef.current = []
    }
    // Snap back to a fitted, un-zoomed blank page.
    viewRef.current = { ...IDENTITY }
    setZoomPct(100)
    render()
  }
  // Aplatir (flatten): merge every layer into one frozen raster base, then start fresh
  // layers on top. Once baked, fills are permanent and new strokes sit cleanly above.
  // Undoable (one snapshot).
  const flatten = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!hasContent() && !baseImgRef.current) return
    const before = snapNow()
    // Bake at 1× and WITHOUT the faint template guide (it stays a guide, not ink).
    viewRef.current = { ...IDENTITY }
    setZoomPct(100)
    render(true)
    let url: string
    try { url = canvas.toDataURL('image/png') } catch { render(); return } // tainted base → can't bake
    const img = new Image()
    img.onload = () => {
      baseImgRef.current = img
      photoAlphaRef.current = 1
      setHasPhoto(false)
      pixelsRef.current = new Map(); stampsRef.current = []; shapesRef.current = []; fillsRef.current = []
      const after: LayerSnapshot = { base: img, hadPhoto: false, alpha: 1, strokes: [], stamps: [], shapes: [], fills: [], pixels: [] }
      pushOp({ kind: 'snapshot', before, after })
      redoRef.current = []
      render()
    }
    img.src = url
  }

  const hasContent = () =>
    strokesRef.current.length > 0 || stampsRef.current.length > 0 || pixelsRef.current.size > 0 || shapesRef.current.length > 0 || fillsRef.current.length > 0
  const isEmpty = () => !hasContent() && !baseImgRef.current && tpl === 'none'

  function sceneJson(): string {
    try {
      // Only a flattened (`data:`) base belongs in the scene; a watermark photo (a
      // transient `blob:` guide) and an `initial` http base are NOT re-stored here.
      const baseSrc = baseImgRef.current?.src
      const base = baseSrc?.startsWith('data:') ? baseSrc : undefined
      const scene: Scene = { v: 1, strokes: strokesRef.current, stamps: stampsRef.current, pixels: [...pixelsRef.current], shapes: shapesRef.current, fills: fillsRef.current, base, template: tplRef.current }
      const json = JSON.stringify(scene)
      return json.length > SCENE_MAX ? '' : json
    } catch {
      return ''
    }
  }

  const MAX_EDGE = 1280
  function exportBlob(cb: (blob: Blob | null) => void) {
    const canvas = canvasRef.current
    if (!canvas) return cb(null)
    // Always export the FULL drawing at 1×: if the user saved while zoomed in, reset
    // the viewport and re-render first so the PNG isn't cropped to the visible region.
    // The scene JSON is unaffected (it stores zoom-independent content coords).
    const v = viewRef.current
    if (v.z !== 1 || v.ox !== 0 || v.oy !== 0) {
      viewRef.current = { ...IDENTITY }
      setZoomPct(100)
      render()
    }
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
    committedRef.current = true // saved → the teardown drops the draft, not re-saves it
    clearDraft()
    setBusy(true)
    const scene = sceneJson()
    exportBlob((blob) => { setBusy(false); if (blob) onSave(blob, scene) })
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
    committedRef.current = true
    clearDraft()
    const scene = sceneJson()
    exportBlob((blob) => { if (blob) onMakeRoutine(blob, scene) })
  }
  const keep = () => {
    if (!onKeep || isEmpty() || busy) return
    committedRef.current = true
    clearDraft()
    const scene = sceneJson()
    exportBlob((blob) => { if (blob) onKeep(blob, scene) })
  }

  const MODES: { key: Mode; icon: Parameters<typeof Icon>[0]['name']; label: string }[] = [
    { key: 'pen', icon: 'paint-brush-bold', label: t.memo.drawPen },
    { key: 'fill', icon: 'paint-bucket-bold', label: t.memo.fillTool },
    { key: 'shape', icon: 'star-fill', label: t.memo.drawShape },
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

  // Portal to <body>: the pad is `position: fixed; inset: 0`, but a launcher like the
  // ＋ "Note rapide" sheet (`.sheet` has `transform: translateY(0)`) is a containing
  // block for fixed descendants — rendered inline, the pad would be trapped inside
  // that scrollable sheet (you could scroll up/down while drawing). Portalling escapes
  // any transformed ancestor so it's always a true full-page scene.
  return createPortal(
    <div ref={rootRef} className={'drawpad' + (toddler ? ' drawpad--kid' : '')} role="dialog" aria-modal="true" aria-label={initial || initialSceneUrl ? t.memo.editTitle : t.memo.drawTitle}>
      {/* Row 1 — compact tool row (scrolls sideways, never wraps tall). */}
      <div className="drawpad__bar drawpad__bar--tools">
        <div className="drawpad__modes" role="group" aria-label={t.memo.tool}>
          {MODES.map((m) => (
            <button key={m.key} type="button" className={'drawpad__mode' + (mode === m.key ? ' is-on' : '')} onClick={() => setMode(m.key)} aria-label={m.label} aria-pressed={mode === m.key}>
              <Icon name={m.icon} size={18} />
            </button>
          ))}
          <button type="button" className={'drawpad__mode' + (symmetry ? ' is-on' : '')} onClick={() => setSymmetry((v) => !v)} aria-label={t.memo.symmetry} aria-pressed={symmetry}>
            <Icon name="sparkle-bold" size={18} />
          </button>
        </div>
        <div className="drawpad__sizes" role="group" aria-label={t.memo.size}>
          {SIZES.map((s, i) => (
            <button key={s.key} type="button" className={'drawpad__size' + (size === i ? ' is-on' : '')} onClick={() => setSize(i)} aria-label={t.memo.size} aria-pressed={size === i}>
              <span className="drawpad__dot" style={{ width: s.ui, height: s.ui }} />
            </button>
          ))}
        </div>
        <div className="drawpad__tools">
          <button type="button" className={'drawpad__tool' + (hasPhoto ? ' is-on' : '')} onClick={() => photoInputRef.current?.click()} aria-label={hasPhoto ? t.memo.photoChange : t.memo.photoAdd}><Icon name="image-square-bold" size={18} /></button>
          <button type="button" className={'drawpad__tool' + (tplOpen ? ' is-on' : '')} onClick={() => setTplOpen((v) => !v)} aria-label={t.memo.template} aria-pressed={tplOpen}><Icon name="book-open-bold" size={18} /></button>
          <button type="button" className="drawpad__tool" onClick={undo} aria-label={t.memo.undo}><Icon name="arrow-counter-clockwise-bold" size={18} /></button>
          <button type="button" className="drawpad__tool" onClick={redo} aria-label={t.memo.redo}><Icon name="repeat-bold" size={18} /></button>
          <button type="button" className="drawpad__tool" onClick={clear} aria-label={t.memo.clear}><Icon name="trash-bold" size={18} /></button>
          {/* Aplatir — bake every layer into one frozen base so a fill can't re-flood
              and new marks land on top. Undoable. */}
          <button type="button" className="drawpad__tool" onClick={flatten} aria-label={t.memo.flatten}><Icon name="stack-bold" size={18} /></button>
          {/* Two toddler "stay in the drawing" locks. Zoom lock: a 2nd finger can no
              longer pinch the page away. Exit lock: the bottom action row can't be
              tapped to leave. Placed up here (away from the draw zone) so a parent
              sets them and a child can't easily flip them back. */}
          <button type="button" className={'drawpad__tool drawpad__lock' + (zoomLock ? ' is-on' : '')} onClick={toggleZoomLock} aria-label={zoomLock ? t.memo.unlockZoom : t.memo.lockZoom} aria-pressed={zoomLock}>
            <Icon name={zoomLock ? 'lock-bold' : 'lock-open-bold'} size={18} />
            <span className="drawpad__lockbadge"><Icon name="magnifying-glass-bold" size={10} /></span>
          </button>
          <button type="button" className={'drawpad__tool drawpad__lock' + (exitLock ? ' is-on' : '')} onClick={() => setExitLock((v) => !v)} aria-label={exitLock ? t.memo.unlockExit : t.memo.lockExit} aria-pressed={exitLock}>
            <Icon name={exitLock ? 'lock-bold' : 'lock-open-bold'} size={18} />
            <span className="drawpad__lockbadge"><Icon name="door-bold" size={10} /></span>
          </button>
        </div>
      </div>

      {/* Row 2 — context for the active tool (scrolls sideways). */}
      <div className="drawpad__bar drawpad__bar--ctx">
        {mode === 'text' ? (
          <input className="input drawpad__text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.memo.textPlaceholder} aria-label={t.memo.drawText} maxLength={24} />
        ) : mode === 'sticker' ? (
          <div className="drawpad__stickers">
            <div className="drawpad__packs" role="group" aria-label={t.memo.drawSticker}>
              {PACKS.map((p, i) => (
                <button key={p.key} type="button" className={'drawpad__pack' + (pack === i ? ' is-on' : '')} onClick={() => { setPack(i); setSticker(p.items[0]) }} aria-label={t.memo.packs[p.key as keyof typeof t.memo.packs]} aria-pressed={pack === i}>{p.icon}</button>
              ))}
            </div>
            <div className="drawpad__stickerset" role="group">
              {PACKS[pack].items.map((e) => (
                <button key={e} type="button" className={'drawpad__sticker' + (sticker === e ? ' is-on' : '')} onClick={() => setSticker(e)} aria-label={e} aria-pressed={sticker === e}>{e}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {mode === 'shape' && (
              <div className="drawpad__shapes" role="group" aria-label={t.memo.drawShape}>
                {SHAPE_TYPES.map((s) => (
                  <button key={s} type="button" className={'drawpad__shape' + (shapeType === s ? ' is-on' : '')} onClick={() => setShapeType(s)} aria-label={t.memo.shapeTools[s]} aria-pressed={shapeType === s}>{SHAPE_GLYPH[s]}</button>
                ))}
              </div>
            )}
            {mode === 'pixel' && (
              <button type="button" className={'chip drawpad__fill' + (fill ? ' is-on' : '')} onClick={() => setFill((v) => !v)} aria-pressed={fill}>{t.memo.fillTool}</button>
            )}
            <div className="drawpad__colors">
              {COLORS.map((c) => (
                <button key={c} type="button" className={'drawpad__swatch' + (color === c ? ' is-on' : '')} style={{ background: c }} onClick={() => pickColor(c)} aria-label={t.memo.pen} aria-pressed={color === c} />
              ))}
              <button type="button" className={'drawpad__swatch drawpad__eraser' + (color === PAPER ? ' is-on' : '')} style={{ background: PAPER }} onClick={() => pickColor(PAPER)} aria-label={t.memo.eraser} aria-pressed={color === PAPER} />
              {recent.map((c) => (
                <button key={c} type="button" className={'drawpad__swatch' + (color === c ? ' is-on' : '')} style={{ background: c }} onClick={() => pickColor(c)} aria-label={t.memo.recent} aria-pressed={color === c} />
              ))}
              {/* Custom colour wheel — available to toddlers too (picking a fun
                  colour is a drawing feature, harmless on the kid surface). */}
              <label className="drawpad__swatch drawpad__custom" aria-label={t.memo.customColor} style={{ background: color }}>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'} onChange={(e) => pickColor(e.target.value)} />
                <span aria-hidden="true">+</span>
              </label>
            </div>
          </>
        )}
      </div>

      {/* Row 3 — template picker, collapsed by default to keep the surface wide. */}
      {tplOpen && (
        <div className="drawpad__tplbar">
          <span className="drawpad__tpllabel mono" aria-hidden="true"><Icon name="book-open-bold" size={15} /> {t.memo.template}</span>
          {TEMPLATES.map((tp) => (
            <button key={tp.key} type="button" className={'chip' + (tpl === tp.key ? ' is-on' : '')} onClick={() => setTpl(tp.key)} aria-pressed={tpl === tp.key}>{tp.label}</button>
          ))}
          {tpl === 'trace' && (
            <div className="drawpad__tracepick" role="group" aria-label={t.memo.tplTrace}>
              {/* Capital + lowercase shown together (Aa Bb…) — one tap traces the pair. */}
              {TRACE_PAIRS.map((pair) => (
                <button key={pair} type="button" className={'drawpad__trace' + (traceCh === pair ? ' is-on' : '')} onClick={() => setTraceCh(pair)} aria-label={pair} aria-pressed={traceCh === pair}>{pair}</button>
              ))}
              {TRACE_DIGITS.map((d) => (
                <button key={d} type="button" className={'drawpad__trace' + (traceCh === d ? ' is-on' : '')} onClick={() => setTraceCh(d)} aria-label={d} aria-pressed={traceCh === d}>{d}</button>
              ))}
              {/* Whole words to trace — a child's name (household / Le cercle) or a
                  recipe. "Trace your name." */}
              {traceWords.length > 0 && (
                <>
                  <span className="drawpad__traceword-label mono" aria-hidden="true">{t.memo.traceWords}</span>
                  {traceWords.map((word) => (
                    <button key={word} type="button" className={'chip' + (traceCh === word ? ' is-on' : '')} onClick={() => setTraceCh(word)} aria-pressed={traceCh === word}>{word}</button>
                  ))}
                </>
              )}
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
      )}

      {/* #14b — photo fade bar: a slider + quick presets to dial the watermark, so a
          child can crank it bright to follow a tracing or fade it out for a clean
          line drawing. Only shown once a photo is loaded. */}
      {hasPhoto && (
        <div className="drawpad__photobar">
          <span className="drawpad__tpllabel mono" aria-hidden="true"><Icon name="image-square-bold" size={15} /> {t.memo.photoOpacity}</span>
          <input
            type="range"
            className="drawpad__photorange"
            min={0}
            max={100}
            step={5}
            value={Math.round(photoAlpha * 100)}
            onChange={(e) => setPhotoAlpha(Number(e.currentTarget.value) / 100)}
            aria-label={t.memo.photoOpacity}
          />
          {([['photoFaint', 0.2], ['photoSoft', 0.4], ['photoStrong', 0.7], ['photoFull', 1]] as const).map(([label, v]) => (
            <button key={label} type="button" className={'chip' + (Math.abs(photoAlpha - v) < 0.03 ? ' is-on' : '')} onClick={() => setPhotoAlpha(v)} aria-pressed={Math.abs(photoAlpha - v) < 0.03}>{t.memo[label]}</button>
          ))}
          <button type="button" className="chip drawpad__photoremove" onClick={removePhoto}><Icon name="trash-bold" size={14} /> {t.memo.photoRemove}</button>
        </div>
      )}

      {/* Draft recovered — an unsaved drawing was restored after the pad was closed.
          One tap to start fresh instead, or dismiss the note. */}
      {showDraftHint && (
        <div className="drawpad__draft" role="status">
          <Icon name="arrow-counter-clockwise-bold" size={15} />
          <span>{t.memo.draftRestored}</span>
          <button type="button" className="chip" onClick={() => { clear(); setShowDraftHint(false) }}>{t.memo.draftDiscard}</button>
          <button type="button" className="drawpad__draftx" onClick={() => setShowDraftHint(false)} aria-label={t.common.close}><Icon name="x-bold" size={14} /></button>
        </div>
      )}

      <div className="drawpad__stage">
        <canvas ref={canvasRef} className="drawpad__canvas" />
        {/* The pixel grid is a CSS overlay at base scale, so hide it while zoomed (it
            wouldn't line up with the magnified cells). */}
        {mode === 'pixel' && zoomPct === 100 && <div className="drawpad__grid" aria-hidden="true" style={{ '--cell': `${SIZES[size].cell}px` } as React.CSSProperties} />}
        {/* Zoom badge — tap to snap back to fit. Pinch (two fingers) or the wheel
            zooms; one finger keeps drawing. Only shown once zoomed in. */}
        {zoomPct > 100 && (
          <button type="button" className="drawpad__zoom mono" onClick={() => applyView({ ...IDENTITY })} aria-label={t.memo.zoomReset}>
            <Icon name="magnifying-glass-bold" size={14} /> {zoomPct}%
          </button>
        )}
        {/* One-tap prompt for the "Sur une photo" entry when no photo is set yet. */}
        {pickPhotoOnOpen && !hasPhoto && (
          <button type="button" className="drawpad__photoprompt" onClick={() => photoInputRef.current?.click()}>
            <Icon name="image-square-bold" size={28} />
            <span>{t.memo.photoChoose}</span>
          </button>
        )}
      </div>
      <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={onPhotoFile} aria-hidden="true" tabIndex={-1} />
      {pickPhotoOnOpen && hasPhoto && <p className="drawpad__photohint mono" aria-hidden="true">{t.memo.photoHint}</p>}

      {/* Exit lock (toddler): the whole action row is dimmed + disabled so a stray
          tap can't leave the drawing. A parent flips the lock in the toolbar. */}
      <div className={'drawpad__actions' + (exitLock ? ' is-locked' : '')}>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={exitLock}>{t.common.cancel}</button>
        <div className="drawpad__actions-end">
          {/* Keep (save to « Mes dessins ») — available to toddlers too, so a child
              can keep their own art. Share + Make-routine stay parent-only (an
              external share / the parent routine builder aren't toddler actions). */}
          {onKeep && (
            <button type="button" className="btn btn--ghost" onClick={keep} disabled={busy || exitLock}><Icon name="push-pin-bold" size={18} /> {t.memo.keep}</button>
          )}
          {!toddler && <button type="button" className="btn btn--ghost" onClick={share} disabled={busy || exitLock}>{t.memo.share}</button>}
          {!toddler && onMakeRoutine && (
            <button type="button" className="btn btn--ghost" onClick={makeRoutine} disabled={busy || exitLock}><Icon name="baby-bold" size={18} /> {t.memo.routine}</button>
          )}
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy || exitLock}><Icon name="check-bold" size={18} /> {t.memo.save}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
