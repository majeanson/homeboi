import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { useMealPrefs } from '../../lib/mealPrefs'
import { todayLocalDay } from '../../lib/localDay'
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
  onPickUnplaced,
  band = false,
}: {
  slot: MealSlot
  onSlot: (s: MealSlot) => void
  week: { date: number; label: string }[]
  onPickDay: (date: number) => void
  // « À placer » (mig 0155) as the FIRST chip, before the days — the week grid's first
  // card, the place for a meal of this week with no day yet. Omitted → days only. Every
  // planning door passes it (recipe, Idées and its sources, Historique, « Déplacer… »);
  // it needs no date, so it stays offered even before the week anchor lands.
  onPickUnplaced?: (() => void) | undefined
  band?: boolean
}) {
  const t = useT()
  const { hero } = useMealPrefs()
  // « CE SOIR » FIRST (review #29, 2026-11-17): « Choisir un souper » led to ideas with
  // no way to put one on tonight but « pick a slot, then a day ». One tap now: the
  // household's hero slot, today. The slot is the PARENT's state, so the chip asks for
  // it through `onSlot` and picks the day once the new slot has come back down — every
  // call site keeps its `onPickDay(date)` and gets the shortcut for free.
  const today = todayLocalDay()
  const hasToday = week.some((d) => d.date === today)
  const [pendingTonight, setPendingTonight] = useState(false)
  useEffect(() => {
    if (pendingTonight && slot === hero) {
      setPendingTonight(false)
      onPickDay(today)
    }
  }, [pendingTonight, slot, hero, today, onPickDay])
  const pickTonight = () => {
    if (slot === hero) onPickDay(today)
    else {
      onSlot(hero)
      setPendingTonight(true)
    }
  }
  return (
    <div className={'meal-plan-pick' + (band ? ' meal-plan-pick--band' : '')}>
      {hasToday && (
        <Chip className="meal-plan-pick__tonight" onClick={pickTonight}>
          {t.board.tonight}
        </Chip>
      )}
      <span className="meal-plan-pick__label mono">{t.recipes.planSlot}</span>
      <SlotPicker value={slot} onChange={onSlot} />
      <span className="meal-plan-pick__label mono">{t.recipes.planPick}</span>
      <div className="meal-plan-pick__days">
        {onPickUnplaced && (
          <Chip className="meal-plan-pick__unplaced" onClick={onPickUnplaced}>
            {t.kitchen.unplaced}
          </Chip>
        )}
        {week.map((d) => (
          <Chip key={d.date} onClick={() => onPickDay(d.date)}>
            {d.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
