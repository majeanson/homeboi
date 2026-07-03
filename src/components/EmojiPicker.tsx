import { EMOJI_SET } from '../lib/emoji'

// Tap-to-pick emoji grid — the one shared control for choosing a glyph (a routine
// card, a carnet, anything). Controlled: pass the current `value` (highlighted) and
// an `onPick`. Renders the broad shared EMOJI_SET (lib/emoji) as a scrollable grid,
// so a person taps a picture instead of summoning their keyboard's emoji panel to
// type one. Replaces the per-place hand-rolled palettes / bare emoji text inputs.
export function EmojiPicker({
  value,
  onPick,
  ariaLabel,
  className,
}: {
  // The currently-picked emoji (highlighted), or null/'' for none.
  value?: string | null
  onPick: (emoji: string) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      className={'emoji-picker' + (className ? ' ' + className : '')}
      role="group"
      aria-label={ariaLabel}
    >
      {EMOJI_SET.map((e) => (
        <button
          key={e}
          type="button"
          className={'emoji-picker__opt' + (value === e ? ' is-on' : '')}
          aria-label={e}
          aria-pressed={value === e}
          onClick={() => onPick(e)}
        >
          {e}
        </button>
      ))}
    </div>
  )
}
