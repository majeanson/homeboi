import { useSpeak } from '../lib/speak'

// The toddler primitive: a grid of big, picture-first, tappable tiles that read
// themselves aloud on tap. Touch targets are huge (NFR-KID-1), meaning carried
// by icon + audio, never required reading (NFR-KID-2). Tapping always speaks;
// an optional onTap lets a tile also DO something (check off, mark done) so a
// toddler can help at a task — the same data a parent acts on in parent view.
export interface Tile {
  key: string
  icon?: string
  label: string
  sub?: string
  narration?: string
  done?: boolean
  color?: string // member colour (avatar_ref) — whose thing this is
  onTap?: () => void
}

export function BigTiles({ tiles, empty }: { tiles: Tile[]; empty?: string }) {
  const speak = useSpeak()
  if (tiles.length === 0) {
    return <p className="bigtiles__empty mono">{empty ?? '—'}</p>
  }
  return (
    <div className="bigtiles">
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          className={`bigtile${tile.done ? ' is-done' : ''}`}
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
          <span className="bigtile__icon" aria-hidden="true">
            {tile.icon ?? '•'}
          </span>
          <span className="bigtile__label">{tile.label}</span>
          {tile.sub && <span className="bigtile__sub mono">{tile.sub}</span>}
          {tile.done && (
            <span className="bigtile__check" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
