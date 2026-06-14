import { useT } from '../../i18n'
import { SLOT_TIME_ORDER, SLOT_ICON_NAME, type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { Icon } from '../Icon'

// Pick which meal a recipe is planned into (déjeuner / dîner / collation /
// souper). Shared by the recipe sheet's "Planifier" and the ideas pool's
// "plan it" so a recipe can land on any meal, not just supper. Defaults are the
// caller's job; souper stays the usual choice. Listed in time order.
export function SlotPicker({ value, onChange }: { value: MealSlot; onChange: (s: MealSlot) => void }) {
  const t = useT()
  const mealPrefs = useMealPrefs()
  return (
    <div className="slot-picker" role="group" aria-label={t.recipes.planSlot}>
      {SLOT_TIME_ORDER.map((s) => {
        const c = mealPrefs.color(s)
        return (
          <button
            key={s}
            type="button"
            className={'chip' + (value === s ? ' is-on' : '')}
            onClick={() => onChange(s)}
            aria-pressed={value === s}
            style={value === s ? { borderColor: c, color: c } : undefined}
          >
            <Icon name={SLOT_ICON_NAME[s]} size={16} color={c} /> {t.kitchen.slots[s]}
          </button>
        )
      })}
    </div>
  )
}
