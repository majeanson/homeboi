import type { CSSProperties } from 'react'
import { useSpeak } from '../lib/speak'

// The toddler primitive: a grid of big, picture-first, tappable tiles that read
// themselves aloud on tap. Touch targets are huge (NFR-KID-1), meaning carried
// by icon + audio, never required reading (NFR-KID-2). Tapping always speaks;
// an optional onTap lets a tile also DO something (check off, mark done) so a
// toddler can help at a task — the same data a parent acts on in parent view.
export interface Tile {
  key: string
  icon?: string
  image?: string | null // a real photo (recipe) — shown in the sticker disc, with `icon` as the fallback
  label: string
  sub?: string
  narration?: string
  done?: boolean
  color?: string // member colour (avatar_ref) — whose thing this is
  onTap?: () => void
}

// A fixed cut-paper palette. Tiles with no member colour cycle through it by
// position, so a grid reads as a cheerful set of riso cards instead of a wall of
// identical white boxes. Deterministic — the same slot is always the same colour,
// every render — so the colour is decoration, never a variable reward (NFR-CALM-2).
const TILE_TINTS = ['#f2a03d', '#7bb0c9', '#b06a93', '#88a36f', '#e0724e', '#fbd66b']

export function BigTiles({ tiles, empty }: { tiles: Tile[]; empty?: string }) {
  const speak = useSpeak()
  if (tiles.length === 0) {
    return (
      <p className="bigtiles__empty">
        <span className="bigtiles__empty-mark" aria-hidden="true">
          ✿
        </span>
        <span className="mono">{empty ?? '—'}</span>
      </p>
    )
  }
  return (
    <div className="bigtiles">
      {tiles.map((tile, i) => {
        // Member colour (whose thing this is) wins; otherwise cycle the palette so
        // neighbouring tiles never share a colour. The wash + border are derived
        // from this in CSS (color-mix), so they follow day↔night automatically.
        const tint = tile.color ?? TILE_TINTS[i % TILE_TINTS.length]
        return (
          <button
            key={tile.key}
            type="button"
            className={`bigtile${tile.done ? ' is-done' : ''}`}
            style={{ '--tile-tint': tint } as CSSProperties}
            onClick={() => {
              speak(tile.narration ?? tile.label)
              tile.onTap?.()
            }}
            aria-pressed={tile.onTap ? !!tile.done : undefined}
            aria-label={tile.label}
          >
            {tile.color && (
              <span className="bigtile__dot" aria-hidden="true" style={{ background: tile.color }} />
            )}
            <span className={`bigtile__icon${tile.image ? ' bigtile__icon--photo' : ''}`} aria-hidden="true">
              {tile.image ? <img src={tile.image} alt="" loading="lazy" /> : (tile.icon ?? '•')}
            </span>
            <span className="bigtile__label">{tile.label}</span>
            {tile.sub && <span className="bigtile__sub mono">{tile.sub}</span>}
            {tile.done && (
              <span className="bigtile__check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
