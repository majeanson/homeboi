import { useT } from '../i18n'

// Calm "Bientôt" reminder lead: how far AHEAD the board starts highlighting a dated
// item (event / scheduled chore). Emphasis only — never a push notification, never
// hides anything (NFR-CALM-1). null = no reminder. Shared by EventForm + ChoreForm;
// mirrors RecurPicker's labelled-row style. Values are seconds, clamped server-side
// to the À venir window (≤ 7 days) in functions/api/events.ts + chores.ts.
export const LEAD_OPTIONS: { key: 'none' | 'h1' | 'h3' | 'h6' | 'd1' | 'd2' | 'd3' | 'w1'; seconds: number | null }[] = [
  { key: 'none', seconds: null },
  { key: 'h1', seconds: 3600 },
  { key: 'h3', seconds: 10800 },
  { key: 'h6', seconds: 21600 },
  { key: 'd1', seconds: 86400 },
  { key: 'd2', seconds: 172800 },
  { key: 'd3', seconds: 259200 },
  { key: 'w1', seconds: 604800 },
]

export function LeadPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const t = useT()
  // A stored value that doesn't match a preset (legacy / hand-set) reads as "none"
  // in the control without losing the underlying number until the user picks.
  const current = LEAD_OPTIONS.find((o) => o.seconds === value)?.key ?? 'none'
  return (
    <label className="recur__row mono">
      <span>{t.lead.label}</span>
      <select
        className="input"
        value={current}
        onChange={(e) => onChange(LEAD_OPTIONS.find((o) => o.key === e.target.value)?.seconds ?? null)}
      >
        {LEAD_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {t.lead[o.key]}
          </option>
        ))}
      </select>
    </label>
  )
}
