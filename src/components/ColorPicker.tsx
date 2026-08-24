import { HOUSEHOLD_INK_COLOURS, PALETTE } from '../lib/colors'

// A row of colour dots — pick one. Used for per-person and per-task colour in
// Réglages. Controlled by the parent. `taken` marks colours already worn by other
// members (plus the Maisonnée fallback inks) with a quiet hollow ring, since a
// row's title tint is now the one "who" signal — still pickable, just informed.
export function ColorPicker({
  value,
  onChange,
  label,
  taken,
  takenLabel,
}: {
  value: string
  onChange: (c: string) => void
  label?: string
  /** Colours already in use by someone else — shown as taken, never blocked. */
  taken?: string[]
  /** Accessible suffix for a taken dot (e.g. « déjà utilisée »). */
  takenLabel?: string
}) {
  const takenSet = taken ? new Set([...taken, ...HOUSEHOLD_INK_COLOURS].map((c) => c.toLowerCase())) : null
  return (
    <div className="colorpick" role="group" aria-label={label}>
      {PALETTE.map((c) => {
        const sel = value.toLowerCase() === c.toLowerCase()
        const isTaken = !sel && !!takenSet?.has(c.toLowerCase())
        return (
          <button
            key={c}
            type="button"
            className={'colorpick__dot' + (sel ? ' is-sel' : '') + (isTaken ? ' is-taken' : '')}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={isTaken && takenLabel ? `${c} — ${takenLabel}` : c}
            aria-pressed={sel}
            title={isTaken ? takenLabel : undefined}
          />
        )
      })}
    </div>
  )
}
