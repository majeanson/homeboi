import { useT } from '../../i18n'
import { type MealSlot } from '../../lib/mealSlots'
import { Chip } from '../Chip'
import { SlotPicker } from './SlotPicker'

// The shared "place this onto the week" picker: choose a meal slot, then a day.
// Used by the recipe sheet's "Planifier" and the ideas pool's "Mettre sur un
// jour" so both read identically — same labels, same chip layout, same slot
// vocabulary as the Gérer day-sheet (the reference format). `band` gives it the
// inset surface treatment used inside the recipe-modal footer; inline (default)
// suits the ideas list under a chip.
export function MealPlanPicker({
  slot,
  onSlot,
  week,
  onPickDay,
  band = false,
}: {
  slot: MealSlot
  onSlot: (s: MealSlot) => void
  week: { date: number; label: string }[]
  onPickDay: (date: number) => void
  band?: boolean
}) {
  const t = useT()
  return (
    <div className={'meal-plan-pick' + (band ? ' meal-plan-pick--band' : '')}>
      <span className="meal-plan-pick__label mono">{t.recipes.planSlot}</span>
      <SlotPicker value={slot} onChange={onSlot} />
      <span className="meal-plan-pick__label mono">{t.recipes.planPick}</span>
      <div className="meal-plan-pick__days">
        {week.map((d) => (
          <Chip key={d.date} onClick={() => onPickDay(d.date)}>
            {d.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
