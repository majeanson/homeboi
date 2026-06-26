import { useMemo } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { BOARD_KEY } from '../../lib/queryKeys'
import { type MealSlot } from '../../lib/mealSlots'
import { type Leftover, type MealRow, LEFTOVERS_KEY, MEALS_KEY } from './types'
import { mealOptions } from './comboOptions'
import { InlineIcon } from '../Icon'
import { MealPool } from './MealPool'
import { type HelpMode } from '../../lib/helpMode'

// "Restants" — the leftovers pool under the week grid. A cooked dish with extra that
// isn't pinned to a day yet: a calm "eat these first" nudge. Add by typing, or quick
// -pick one of today's planned meals. Tap a leftover to PLAN it onto a day (it becomes
// a real meal, badged Restants, and leaves the pool — you eat leftovers once). A thin
// wrapper over the shared <MealPool> (it owns the add / live-poll-safe delete / inline
// rename / plan-picker); only the recent-meal-pick add and the CONSUMING plan (which
// needs a compensating undo, unlike reusable ideas) differ.
export function Leftovers({
  leftovers,
  recentMeals,
  week,
  help,
}: {
  leftovers: Leftover[]
  recentMeals: MealRow[]
  week: { date: number; label: string }[]
  // Kitchen's page-level help mode — makes the "Restants" heading explainable while
  // armed (lib/helpMode). Optional: a plain heading without it.
  help?: HelpMode
}) {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  // Recent meals (the last few days) become "we ate this, there's some left"
  // suggestions in the combobox — pick one to carry its recipe link + source meal.
  const recentOpts = useMemo(() => mealOptions(recentMeals), [recentMeals])

  // Plan it onto a day → a real meal tagged is_leftover; the pool row is consumed
  // server-side. Refresh the plan + board (today's supper headline may change).
  // Compensating undo (the caches are live-polled): delete the created meal AND
  // re-insert the pool row, so Annuler fully reverses the plan.
  async function planLeftover(l: Leftover, date: number, slot: MealSlot) {
    const keys = [LEFTOVERS_KEY, MEALS_KEY, BOARD_KEY]
    const res = await write<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id: l.id, date, slot },
      affectedKeys: keys,
    }).catch(() => null)
    const mealId = res && !res.queued ? res.data?.mealId : undefined
    recordUndo({
      message: t.undo.leftoverPlanned(l.title),
      onUndo: async () => {
        if (mealId) await write('meals', { method: 'DELETE', body: { id: mealId }, affectedKeys: keys }).catch(() => {})
        await write('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
          affectedKeys: keys,
        }).catch(() => {})
      },
    })
  }

  return (
    <MealPool<Leftover, MealRow>
      items={leftovers}
      queryKey={LEFTOVERS_KEY}
      collectionKey="leftovers"
      endpoint="meal-leftovers"
      options={recentOpts}
      buildAddBody={(title, picked) => ({ title, recipeId: picked?.data.recipe_id ?? null, sourceMealId: picked?.data.id ?? null })}
      onPlan={planLeftover}
      renderLead={() => (
        <>
          <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />{' '}
        </>
      )}
      week={week}
      help={help}
      helpKey="leftovers"
      labels={{
        heading: t.kitchen.leftovers,
        addAria: t.kitchen.leftoversAdd,
        addPlaceholder: t.kitchen.leftoversAdd,
        empty: t.kitchen.leftoversEmpty,
        removeLabel: t.kitchen.removeLeftover,
        removedUndo: (title) => t.undo.leftoverRemoved(title),
      }}
    />
  )
}
