import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { PHOTOS_KEY } from '../lib/queryKeys'
import { imgUrl } from '../lib/image'
import { useAmbient } from '../lib/ambient'
import { useGallery } from '../lib/drawingGallery'
import { computeDayPart, type DayPart } from '../lib/timeofday'

// Full-screen family-memory mosaic for the idle screensaver: tiles the whole
// surface with family PHOTOS and saved kids' DRAWINGS (#49), and every few seconds
// cross-fades ONE random tile to a different image. Calm by design (NFR-CALM) —
// opacity-only, a single tile at a time, never a churning wall of motion. Silent
// no-op with nothing to show (or R2 off). Used by AmbientScreen; the board wall
// keeps the single-photo PhotoFrame.
//
// Which sources appear is the household's Mode veille choice (showPhotos /
// showDrawings). When BOTH are on, swaps are gently biased by daypart — kids' art
// leads through the day, calm photos lead at dusk/night (#49 "by daypart").

const TILE_PX = 260 // target tile edge at full density; the dense cap is set by this
const SWAP_MS = 4500 // how often one tile gently changes image

type Tile = { photo: number; nonce: number }
type Img = { id: string; key: string; draw: boolean }

// Probability a swap lands on a DRAWING rather than a photo, by daypart. Only
// matters when BOTH sources are present; otherwise the available one always wins.
const DRAW_WEIGHT: Record<DayPart, number> = {
  dawn: 0.4,
  morning: 0.6,
  noon: 0.65,
  afternoon: 0.6,
  dusk: 0.3,
  twilight: 0.28,
  'deep-twilight': 0.25,
  night: 0.25,
}

// Choose the grid shape from the container size AND the image count. The count
// drives density: below the dense cap we use exactly as many tiles as there are
// images (so every tile is distinct — few images → fewer, bigger tiles, one image
// → full-screen), and once there are enough it locks to the fixed dense grid.
function gridFor(w: number, h: number, photoCount: number): { cols: number; rows: number } {
  if (w <= 0 || h <= 0 || photoCount < 1) return { cols: 1, rows: 1 }
  const maxCols = Math.max(1, Math.round(w / TILE_PX))
  const maxRows = Math.max(1, Math.round(h / TILE_PX))
  const denseCap = maxCols * maxRows
  const target = Math.min(photoCount, denseCap)
  let cols = Math.round(Math.sqrt((target * w) / h))
  cols = Math.max(1, Math.min(maxCols, cols))
  let rows = Math.max(1, Math.ceil(target / cols))
  rows = Math.min(rows, maxRows)
  // Never tile more cells than we have distinct images — a screensaver that shows
  // the same drawing across several tiles isn't calm. Trim the last partial row
  // (and, in the tiny case, narrow the columns) so every tile holds its own image.
  while (cols * rows > photoCount && rows > 1) rows--
  if (cols * rows > photoCount) cols = Math.max(1, photoCount)
  return { cols, rows }
}

function shuffle(arr: number[]): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Seed distinct images where possible; cycle a shuffled order when tiles > images.
function seedTiles(count: number, n: number): Tile[] {
  const order = shuffle([...Array(n).keys()])
  return Array.from({ length: count }, (_, i) => ({ photo: order[i % n], nonce: 0 }))
}

// Pick the next image index for a tile: bring in an image that is NOT already on
// another tile, so the wall never shows the same drawing/photo twice. Choose the
// source group (drawings vs photos) by the daypart weight only among images still
// free; if a group is exhausted on screen we take the other rather than duplicate.
// When nothing fresh remains (tiles == images) we return `current` — the caller
// reads that as "stay put", so a small gallery rests rather than churning dupes.
function pickBiased(images: Img[], used: Set<number>, current: number, drawWeight: number): number {
  if (images.length <= 1) return current
  const draws: number[] = []
  const photos: number[] = []
  images.forEach((im, i) => (im.draw ? draws : photos).push(i))
  const freshIn = (g: number[]) => g.filter((i) => i !== current && !used.has(i))
  const fd = freshIn(draws)
  const fp = freshIn(photos)
  let pool: number[]
  if (fd.length && fp.length) pool = Math.random() < drawWeight ? fd : fp
  else if (fd.length || fp.length) pool = fd.length ? fd : fp
  else return current // every image is already on a tile — no fresh pick, stay put
  return pool[Math.floor(Math.random() * pool.length)]
}

export function PhotoMosaic() {
  const a = useAmbient()
  const photosQ = useQuery({
    queryKey: PHOTOS_KEY,
    queryFn: () => api<{ photos: { id: string; key: string }[] }>('photos'),
    ...live,
  })
  const drawingsQ = useGallery()

  // The blended pool, honouring the Mode veille toggles. Drawings are served by the
  // SAME /api/img/<key> route as photos, so a tile renders either identically.
  const images = useMemo<Img[]>(() => {
    const out: Img[] = []
    if (a.showPhotos) for (const p of photosQ.data?.photos ?? []) out.push({ id: p.id, key: p.key, draw: false })
    if (a.showDrawings) for (const d of drawingsQ.data?.drawings ?? []) out.push({ id: `d_${d.media_key}`, key: d.media_key, draw: true })
    return out
  }, [a.showPhotos, a.showDrawings, photosQ.data, drawingsQ.data])
  const n = images.length

  // Track the live container size, so the grid fills any wall or phone.
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Density scales with the image count (see gridFor).
  const grid = useMemo(() => gridFor(size.w, size.h, n), [size.w, size.h, n])
  const count = grid.cols * grid.rows

  // Per-tile image index + a nonce that bumps to retrigger the fade on a swap.
  const [tiles, setTiles] = useState<Tile[]>([])
  useEffect(() => {
    if (!n || !count) {
      setTiles([])
      return
    }
    setTiles(seedTiles(count, n))
  }, [count, n])

  // Gently swap one random tile on an interval, biased by daypart when both
  // sources are present.
  useEffect(() => {
    if (n < 2 || count < 1) return
    const id = setInterval(() => {
      const weight = DRAW_WEIGHT[computeDayPart(Date.now())]
      setTiles((prev) => {
        if (!prev.length) return prev
        const t = Math.floor(Math.random() * prev.length)
        const used = new Set(prev.map((x) => x.photo))
        const next = pickBiased(images, used, prev[t].photo, weight)
        if (next === prev[t].photo) return prev // no fresh image to bring in — no churn (and no dupe)
        const copy = prev.slice()
        copy[t] = { photo: next, nonce: prev[t].nonce + 1 }
        return copy
      })
    }, SWAP_MS)
    return () => clearInterval(id)
  }, [n, count, images])

  if (!n) return null
  return (
    <div
      ref={ref}
      className="ambient-mosaic"
      style={{ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties}
      aria-hidden="true"
    >
      {tiles.map((tile, i) => {
        const p = images[tile.photo % n]
        return (
          <div className="ambient-mosaic__tile" key={i}>
            {/* key bumps with the nonce so React remounts the <img>, replaying the fade. */}
            <img key={`${p.id}-${tile.nonce}`} src={imgUrl(p.key)} alt="" />
          </div>
        )
      })}
    </div>
  )
}
