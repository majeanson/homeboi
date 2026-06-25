import { useT, useLang } from '../i18n'
import { useWrite } from '../lib/write'
import { isGuest } from '../lib/device'
import { HOUSEHOLD_KEY } from '../lib/queryKeys'
import { useAisleOverrides } from '../lib/aislePrefs'
import { aisleFor, aisleKey, AISLES, AISLE_BY_ID } from '../lib/aisle'

// The shared "which store aisle does this grocery item sort into?" picker. The
// override is keyed by the item's NORMALIZED identity (aisleKey), so setting it here
// applies everywhere that same item shows — the list line, the recurrent "already
// bought" item that carries the search synonyms, the detail peek — they all share one
// key ("Oeuf" / "oeufs" / "2 douzaines d'œufs" → one override). Persists instantly via
// HOUSEHOLD_KEY (the list re-sorts live); "Auto" clears it back to the picture guess.
// A guest can't write, so the control is disabled for them.
export function AislePicker({ text, className }: { text: string; className?: string }) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const overrides = useAisleOverrides()
  const key = aisleKey(text)
  // The keyword guess (no overrides) — shown on the "Auto" option so it's clear where
  // the item lands by default.
  const guess = aisleFor(text)
  function set(value: string) {
    void write('household', {
      method: 'PATCH',
      body: { aisleOverride: { key, aisle: value === 'auto' ? null : value } },
      affectedKeys: [HOUSEHOLD_KEY],
    }).catch(() => {})
  }
  return (
    <select
      className={'input aisle-pick' + (className ? ` ${className}` : '')}
      value={overrides[key] ?? 'auto'}
      onChange={(e) => set(e.target.value)}
      disabled={isGuest()}
      aria-label={t.list.aisleLabel}
    >
      <option value="auto">{`${t.list.aisleAuto} — ${AISLE_BY_ID[guess].emoji} ${AISLE_BY_ID[guess].label[lang]}`}</option>
      {AISLES.map((a) => (
        <option key={a.id} value={a.id}>{`${a.emoji} ${a.label[lang]}`}</option>
      ))}
    </select>
  )
}
