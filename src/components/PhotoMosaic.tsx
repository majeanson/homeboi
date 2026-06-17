import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { imgUrl } from '../lib/image'

// Full-screen family-photo mosaic for the idle screensaver: tiles the whole
// surface with photos and, every few seconds, cross-fades ONE random tile to a
// different photo. Calm by design (NFR-CALM) — opacity-only, a single tile at a
// time, never a churning wall of motion. Silent no-op with no photos (or R2 off).
// Used by AmbientScreen; the board wall keeps the single-photo PhotoFrame.

const TILE_PX = 260 // target tile edge; the grid fills to whole tiles of this size
const SWAP_MS = 4500 // how often one tile gently changes photo

type Tile = { photo: number; nonce: number }

function shuffle(arr: number[]): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Seed distinct photos where possible; cycle a shuffled order when tiles > photos.
function seedTiles(count: number, n: number): Tile[] {
  const order = shuffle([...Array(n).keys()])
  return Array.from({ length: count }, (_, i) => ({ photo: order[i % n], nonce: 0 }))
}

// Pick a photo not already on screen (and not this tile's current) when we can.
function pickPhoto(n: number, used: Set<number>, current: number): number {
  if (n === 1) return 0
  const free: number[] = []
  for (let i = 0; i < n; i++) if (i !== current && !used.has(i)) free.push(i)
  const pool = free.length
    ? free
    : Array.from({ length: n }, (_, i) => i).filter((i) => i !== current)
  return pool[Math.floor(Math.random() * pool.length)]
}

export function PhotoMosaic() {
  const { data } = useQuery({
    queryKey: ['photos'],
    queryFn: () => api<{ photos: { id: string; key: string }[] }>('photos'),
    ...live,
  })
  const photos = data?.photos ?? []

  // Grid shape from the live container size, so it fills any wall or phone.
  const ref = useRef<HTMLDivElement>(null)
  const [grid, setGrid] = useState({ cols: 1, rows: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const cols = Math.max(1, Math.round(el.clientWidth / TILE_PX))
      const rows = Math.max(1, Math.round(el.clientHeight / TILE_PX))
      setGrid((g) => (g.cols === cols && g.rows === rows ? g : { cols, rows }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const count = grid.cols * grid.rows

  // Per-tile photo index + a nonce that bumps to retrigger the fade on a swap.
  const [tiles, setTiles] = useState<Tile[]>([])
  useEffect(() => {
    if (!photos.length || !count) {
      setTiles([])
      return
    }
    setTiles(seedTiles(count, photos.length))
  }, [count, photos.length])

  // Gently swap one random tile on an interval.
  useEffect(() => {
    if (photos.length < 2 || count < 1) return
    const id = setInterval(() => {
      setTiles((prev) => {
        if (!prev.length) return prev
        const t = Math.floor(Math.random() * prev.length)
        const used = new Set(prev.map((x) => x.photo))
        const next = pickPhoto(photos.length, used, prev[t].photo)
        const copy = prev.slice()
        copy[t] = { photo: next, nonce: prev[t].nonce + 1 }
        return copy
      })
    }, SWAP_MS)
    return () => clearInterval(id)
  }, [photos.length, count])

  if (!photos.length) return null
  return (
    <div
      ref={ref}
      className="ambient-mosaic"
      style={{ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties}
      aria-hidden="true"
    >
      {tiles.map((tile, i) => {
        const p = photos[tile.photo % photos.length]
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
