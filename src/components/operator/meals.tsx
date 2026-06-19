import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { SLOT_TIME_ORDER, SLOT_COLOR, SLOT_ICON_NAME, type MealSlot } from '../../lib/mealSlots'
import { wash } from '../../lib/colors'
import { isGuest } from '../../lib/device'
import { ColorPicker } from '../ColorPicker'
import { Icon } from '../Icon'
import { OperatorSection } from './OperatorSection'
import type { HouseholdSettings } from '../../lib/mealPrefs'

// Réglages ▸ Repas. Two household-level settings, shared by every device:
//   • a COLOUR per meal (déjeuner / dîner / collation / souper) — it tints that
//     meal everywhere it's shown (board cards, month dots, kitchen).
//   • a SHOW/HIDE toggle per meal — drops a slot off the glance/plan ("I only
//     care about souper"). You can still plan a hidden slot in La cuisine.
// Both persist on /api/household; saving invalidates HOUSEHOLD_KEY so the meal
// surfaces re-tint/re-filter live (they read the same key via useMealPrefs).
export function MealSlotsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  // Only OVERRIDES live here (a slot absent = its default colour).
  const [colors, setColors] = useState<Record<string, string>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')
  // Read-only guest: the slot rows read as a coloured legend — no recolor / reset /
  // show-hide controls.
  const ro = isGuest()

  useEffect(() => {
    api<HouseholdSettings>('household')
      .then((r) => {
        setColors(r.mealColors ?? {})
        setHidden(new Set(r.mealHidden ?? []))
      })
      .catch(() => {})
  }, [])

  // One save path for both fields — PATCH sends the next state, then we refresh
  // the shared household cache so the board/kitchen re-tint without a reload.
  const save = useCallback(
    async (nextColors: Record<string, string>, nextHidden: Set<string>) => {
      setStatus('idle')
      try {
        await api('household', {
          method: 'PATCH',
          body: { mealColors: nextColors, mealHidden: [...nextHidden] },
        })
        qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
        setStatus('saved')
      } catch {
        setStatus('bad')
      }
    },
    [qc],
  )

  function pickColor(slot: MealSlot, c: string) {
    const next = { ...colors, [slot]: c }
    setColors(next)
    save(next, hidden)
  }
  function resetColor(slot: MealSlot) {
    const next = { ...colors }
    delete next[slot]
    setColors(next)
    save(next, hidden)
  }
  function toggleVisible(slot: MealSlot) {
    const next = new Set(hidden)
    if (next.has(slot)) next.delete(slot)
    else next.add(slot)
    setHidden(next)
    save(colors, next)
  }

  return (
    <OperatorSection title={t.operator.mealColors} help={help} helpKey="mealSlots">
      <ul className="operator__list meal-slots">
        {SLOT_TIME_ORDER.map((slot) => {
          const resolved = colors[slot] ?? SLOT_COLOR[slot]
          const shown = !hidden.has(slot)
          const overridden = slot in colors
          return (
            <li key={slot} className={'meal-slots__row' + (shown ? '' : ' is-off')}>
              <span className="meal-slots__name">
                <span
                  className="meal-slots__chip"
                  style={{ background: wash(resolved), color: resolved }}
                  aria-hidden="true"
                >
                  <Icon name={SLOT_ICON_NAME[slot]} size={20} color={resolved} />
                </span>
                {t.kitchen.slots[slot]}
              </span>
              {!ro && (
                <div className="meal-slots__pick">
                  <ColorPicker value={resolved} onChange={(c) => pickColor(slot, c)} label={t.operator.mealColors} />
                  {overridden && (
                    <button type="button" className="btn btn--ghost mono meal-slots__reset" onClick={() => resetColor(slot)}>
                      {t.operator.mealColorReset}
                    </button>
                  )}
                </div>
              )}
              {ro ? (
                <span className="mono meal-slots__toggle">
                  {shown ? t.operator.mealVisible : t.operator.mealHidden}
                </span>
              ) : (
                <button
                  type="button"
                  className={'btn mono meal-slots__toggle' + (shown ? ' btn--primary' : ' btn--ghost')}
                  onClick={() => toggleVisible(slot)}
                  aria-pressed={shown}
                >
                  {shown ? t.operator.mealVisible : t.operator.mealHidden}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {status === 'saved' && <p className="capture__routed mono">{t.operator.postalSaved}</p>}
      {status === 'bad' && <p className="error mono">{t.operator.postalBad}</p>}
    </OperatorSection>
  )
}
