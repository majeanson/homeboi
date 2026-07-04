import { useState } from 'react'
import { filterEmojis } from '../lib/emoji'
import { useT } from '../i18n'
import { Modal } from './Modal'

// Tap-to-pick emoji grid — the one shared control for choosing a glyph (a routine
// card, a carnet, anything). Controlled: pass the current `value` (highlighted) and
// an `onPick`. Renders the broad shared EMOJI_SET (lib/emoji) as a scrollable grid
// with a search box on top (type « eau », « outil », « chien » to filter — accent-
// insensitive), so a person taps a picture instead of summoning their keyboard's
// emoji panel. Replaces the per-place hand-rolled palettes / bare emoji text inputs.
//
// For a compact field that OPENS this on a bigger surface, use <EmojiField> below.
export function EmojiPicker({
  value,
  onPick,
  ariaLabel,
  className,
  search = true,
}: {
  // The currently-picked emoji (highlighted), or null/'' for none.
  value?: string | null
  onPick: (emoji: string) => void
  ariaLabel: string
  className?: string
  // Show the search box (default). Turn off for a tiny always-tiny inline use.
  search?: boolean
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const list = filterEmojis(q)
  return (
    <div className="emoji-picker-wrap">
      {search && (
        <input
          className="input emoji-picker__search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.common.emojiSearch}
          aria-label={t.common.emojiSearch}
        />
      )}
      {list.length === 0 ? (
        <p className="emoji-picker__empty">{t.common.emojiNoResult}</p>
      ) : (
        <div
          className={'emoji-picker' + (className ? ' ' + className : '')}
          role="group"
          aria-label={ariaLabel}
        >
          {list.map((e, i) => (
            <button
              key={e + i}
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
      )}
    </div>
  )
}

// EmojiField — a compact, tappable emoji trigger that opens the full searchable
// EmojiPicker on a bigger surface (a Modal). Use in a form where the picker inline
// would be cramped: it shows the current glyph (or a `fallback` default disc), and
// tapping the glyph itself opens the picker — "tap the emoji to change it".
export function EmojiField({
  value,
  onPick,
  ariaLabel,
  fallback,
}: {
  value?: string | null
  onPick: (emoji: string) => void
  ariaLabel: string
  // Shown (dimmed) in the trigger when nothing is picked yet — e.g. the kind's
  // default glyph. Purely presentational; an empty pick still means "no emoji".
  fallback?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const shown = value || fallback || '🙂'
  return (
    <>
      <button
        type="button"
        className={'emoji-field' + (value ? '' : ' emoji-field--empty')}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
      >
        <span className="emoji-field__glyph" aria-hidden="true">{shown}</span>
        <span className="emoji-field__hint">{value ? t.common.emojiChange : t.common.emojiChoose}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={ariaLabel}>
        <EmojiPicker
          value={value}
          onPick={(e) => {
            onPick(e)
            setOpen(false)
          }}
          ariaLabel={ariaLabel}
          className="emoji-picker--tall"
        />
        {value && (
          <button
            type="button"
            className="btn btn--ghost emoji-field__clear"
            onClick={() => {
              onPick('')
              setOpen(false)
            }}
          >
            {t.common.emojiClear}
          </button>
        )}
      </Modal>
    </>
  )
}
