import { HOUSEHOLD_INK_COLOURS, PALETTE } from '../lib/colors'

// A row of colour dots — pick one. Used for per-person and per-task colour in
// Réglages. Controlled by the parent. `taken` marks colours already worn by other
// members (plus the Maisonnée fallback inks) with a quiet hollow ring, since a
// row's title tint is now the one "who" signal — still pickable, just informed.
//
// `none` offers « no colour of its own » FIRST, for a thing that inherits one (a task
// wears its subject's colour until it picks: LookPicker, 0148). It is a labelled pill,
// not a blank dot: an empty circle says nothing about what it means. `value` null = it.
export function ColorPicker({
  value,
  onChange,
  label,
  taken,
  takenLabel,
  none,
}: {
  value: string | null
  onChange: (c: string) => void
  label?: string
  /** Colours already in use by someone else — shown as taken, never blocked. */
  taken?: string[]
  /** Accessible suffix for a taken dot (e.g. « déjà utilisée »). */
  takenLabel?: string
  /** « Comme le sujet »: the inherited colour, painted in the pill, and the pick that clears. */
  none?: { label: string; colour: string | null; onPick: () => void } | undefined
}) {
  const takenSet = taken ? new Set([...taken, ...HOUSEHOLD_INK_COLOURS].map((c) => c.toLowerCase())) : null
  const current = value?.toLowerCase() ?? null
  return (
    <div className="colorpick" role="group" aria-label={label}>
      {none && (
        <button type="button" className={'colorpick__none' + (current == null ? ' is-sel' : '')} onClick={none.onPick} aria-pressed={current == null}>
          <span className="colorpick__none-dot" style={none.colour ? { background: none.colour } : undefined} aria-hidden="true" />
          {none.label}
        </button>
      )}
      {PALETTE.map((c) => {
        const sel = current === c.toLowerCase()
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
