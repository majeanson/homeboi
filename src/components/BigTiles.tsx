import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useT } from '../i18n'
import { useSpeak } from '../lib/speak'

// The toddler primitive: a grid of big, picture-first, tappable tiles that read
// themselves aloud on tap. Touch targets are huge (NFR-KID-1), meaning carried
// by icon + audio, never required reading (NFR-KID-2).
//
// Tiles can also DO something (choose a recipe, pick a day) via onTap — but a
// pre-reader can't know what a tile is before hearing it, so an action tile is
// HEAR-FIRST, two taps:
//   tap 1 → speaks the proposition ("Jeudi : Spaghetti. Tape encore pour
//           choisir !") and arms the tile (visible 👆 cue);
//   tap 2 → commits (onTap) with a gentle, always-the-same "Voilà !".
// The arm melts away by itself, or moves when another tile is tapped — a
// wandering finger never commits anything. Speak-only tiles stay one tap.
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
  // What the FIRST tap says after the proposition ("Tape encore pour …"). Lets a
  // cook tile say "…pour cuisiner" where a picker tile says "…pour choisir".
  confirmHint?: string
}

// A fixed cut-paper palette. Tiles with no member colour cycle through it by
// position, so a grid reads as a cheerful set of riso cards instead of a wall of
// identical white boxes. Deterministic — the same slot is always the same colour,
// every render — so the colour is decoration, never a variable reward (NFR-CALM-2).
const TILE_TINTS = ['#f2a03d', '#7bb0c9', '#b06a93', '#88a36f', '#e0724e', '#fbd66b']

// How long an armed tile waits for its confirming tap before melting back.
const ARM_MS = 6000

export function BigTiles({ tiles, empty }: { tiles: Tile[]; empty?: string }) {
  const t = useT()
  const speak = useSpeak()
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current)
    },
    [],
  )

  function tap(tile: Tile) {
    const said = tile.narration ?? tile.label
    if (!tile.onTap) {
      // Nothing to commit — just read it (the original contract).
      speak(said)
      return
    }
    if (armedKey === tile.key) {
      // The confirming tap: commit, same gentle word every time (NFR-CALM-2).
      if (armTimer.current) clearTimeout(armTimer.current)
      setArmedKey(null)
      speak(t.kid.okDone)
      tile.onTap?.()
      return
    }
    // First tap: say what this IS and what tapping again will do, then wait.
    speak(`${said}. ${tile.confirmHint ?? t.kid.tapAgain}`)
    setArmedKey(tile.key)
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmedKey(null), ARM_MS)
  }

  if (tiles.length === 0) {
    // The empty state speaks too — a pre-reader who lands here can't decode the
    // sentence, but a tap anywhere on it reads the message aloud, same contract
    // as every tile (NFR-KID-2).
    return (
      <button type="button" className="bigtiles__empty" onClick={() => speak(empty ?? '')}>
        <span className="bigtiles__empty-mark" aria-hidden="true">
          ✿
        </span>
        <span className="mono">{empty ?? '—'}</span>
      </button>
    )
  }
  return (
    <div className="bigtiles">
      {tiles.map((tile, i) => {
        // Member colour (whose thing this is) wins; otherwise cycle the palette so
        // neighbouring tiles never share a colour. The wash + border are derived
        // from this in CSS (color-mix), so they follow day↔night automatically.
        const tint = tile.color ?? TILE_TINTS[i % TILE_TINTS.length]
        const armed = armedKey === tile.key && !!tile.onTap
        return (
          <button
            key={tile.key}
            type="button"
            className={`bigtile${tile.done ? ' is-done' : ''}${armed ? ' is-armed' : ''}`}
            style={{ '--tile-tint': tint } as CSSProperties}
            onClick={() => tap(tile)}
            aria-pressed={tile.onTap ? !!tile.done : undefined}
            aria-label={armed ? `${tile.label} — ${tile.confirmHint ?? t.kid.tapAgain}` : tile.label}
          >
            {tile.color && (
              <span className="bigtile__dot" aria-hidden="true" style={{ background: tile.color }} />
            )}
            <span className={`bigtile__icon${tile.image ? ' bigtile__icon--photo' : ''}`} aria-hidden="true">
              {tile.image ? <img src={tile.image} alt="" loading="lazy" /> : (tile.icon ?? '•')}
            </span>
            <span className="bigtile__label">{tile.label}</span>
            {tile.sub && <span className="bigtile__sub mono">{tile.sub}</span>}
            {armed && (
              <span className="bigtile__again" aria-hidden="true">
                👆
              </span>
            )}
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

// Toddler-surface text that reads itself aloud on tap — headings, greetings,
// empty lines. A pre-reader should be able to tap ANY word on a kid surface and
// hear it (NFR-KID-2); this wraps plain text in an invisible button without
// changing how it looks (the .sayable reset keeps the parent's typography).
export function Sayable({ text, className }: { text: string; className?: string }) {
  const speak = useSpeak()
  return (
    <button type="button" className={'sayable' + (className ? ' ' + className : '')} onClick={() => speak(text)}>
      {text}
    </button>
  )
}
