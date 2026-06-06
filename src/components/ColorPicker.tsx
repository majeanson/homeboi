import { PALETTE } from '../lib/colors'

// A row of colour dots — pick one. Used for per-person and per-task colour in
// Réglages. Controlled by the parent.
export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (c: string) => void
  label?: string
}) {
  return (
    <div className="colorpick" role="group" aria-label={label}>
      {PALETTE.map((c) => {
        const sel = value.toLowerCase() === c.toLowerCase()
        return (
          <button
            key={c}
            type="button"
            className={'colorpick__dot' + (sel ? ' is-sel' : '')}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
            aria-pressed={sel}
          />
        )
      })}
    </div>
  )
}
