import { useT } from '../../i18n'
import { MEAL_SLOTS, SLOT_ICON, type MealSlot } from '../../lib/mealSlots'

// Pick which meal a recipe is planned into (déjeuner / dîner / souper /
// collation). Shared by the recipe sheet's "Planifier" and the ideas pool's
// "plan it" so a recipe can land on any meal, not just supper. Defaults are the
// caller's job; souper stays the usual choice.
export function SlotPicker({ value, onChange }: { value: MealSlot; onChange: (s: MealSlot) => void }) {
  const t = useT()
  return (
    <div className="slot-picker" role="group" aria-label={t.recipes.planSlot}>
      {MEAL_SLOTS.map((s) => (
        <button
          key={s}
          type="button"
          className={'chip' + (value === s ? ' is-on' : '')}
          onClick={() => onChange(s)}
          aria-pressed={value === s}
        >
          <span aria-hidden="true">{SLOT_ICON[s]}</span> {t.kitchen.slots[s]}
        </button>
      ))}
    </div>
  )
}
