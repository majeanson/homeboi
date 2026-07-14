import { useT, useLang } from '../i18n'
import { useWrite } from '../lib/write'
import { isGuest } from '../lib/device'
import { HOUSEHOLD_KEY } from '../lib/queryKeys'
import { useAisleOverrides } from '../lib/aislePrefs'
import { aisleFor, aisleKey, AISLES, AISLE_BY_ID, type AisleId } from '../lib/aisle'

// The shared "which store aisle does this grocery item sort into?" picker. The
// override is keyed by the item's NORMALIZED identity (aisleKey), so setting it here
// applies everywhere that same item shows — the list line, the recurrent "already
// bought" item that carries the search synonyms, the detail peek — they all share one
// key ("Oeuf" / "oeufs" / "2 douzaines d'œufs" → one override). Persists instantly via
// HOUSEHOLD_KEY (the list re-sorts live); "Auto" clears it back to the picture guess.
// A guest can't write, so the control is disabled for them.
export function AislePicker({
  text,
  className,
  compact,
}: {
  text: string
  className?: string
  /** Icon-only face: the <select> is a real, focusable control but goes transparent
      over the aisle emoji, so a dense row (quick-add) spends one glyph instead of
      "Automatique — 🥛" repeated down the whole column. The dropdown itself still
      lists the full labels. */
  compact?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const overrides = useAisleOverrides()
  const key = aisleKey(text)
  // The keyword guess (no overrides) — shown on the "Auto" option so it's clear where
  // the item lands by default.
  const guess = aisleFor(text)
  // The override map is a plain Record, so a miss reads as AisleId at the type level —
  // check membership before trusting it.
  const override: AisleId | undefined = AISLE_BY_ID[overrides[key]] ? overrides[key] : undefined
  const current: AisleId | 'auto' = override ?? 'auto'
  const shown = AISLE_BY_ID[override ?? guess]
  function set(value: string) {
    void write('household', {
      method: 'PATCH',
      body: { aisleOverride: { key, aisle: value === 'auto' ? null : value } },
      affectedKeys: [HOUSEHOLD_KEY],
    }).catch(() => {})
  }
  // The name the icon stands for — the tooltip/aria label, so the collapsed face is
  // never a mystery glyph (and stays honest about auto vs. a set override).
  const title =
    current === 'auto'
      ? `${t.list.aisleLabel} · ${t.list.aisleAuto} — ${shown.label[lang]}`
      : `${t.list.aisleLabel} · ${shown.label[lang]}`
  const select = (
    <select
      className={compact ? 'aisle-pick__sel' : 'input aisle-pick' + (className ? ` ${className}` : '')}
      value={current}
      onChange={(e) => set(e.target.value)}
      disabled={isGuest()}
      aria-label={title}
      title={title}
    >
      <option value="auto">{`${t.list.aisleAuto} — ${AISLE_BY_ID[guess].emoji} ${AISLE_BY_ID[guess].label[lang]}`}</option>
      {AISLES.map((a) => (
        <option key={a.id} value={a.id}>{`${a.emoji} ${a.label[lang]}`}</option>
      ))}
    </select>
  )
  if (!compact) return select
  return (
    <span className={'aisle-pip' + (current === 'auto' ? ' is-auto' : '') + (className ? ` ${className}` : '')}>
      <span className="aisle-pip__emoji" aria-hidden="true">
        {shown.emoji}
      </span>
      {select}
    </span>
  )
}
