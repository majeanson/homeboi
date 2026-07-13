import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { BOARD_KEY } from '../../lib/queryKeys'
import { type MealSlot } from '../../lib/mealSlots'
import { type HelpMode } from '../../lib/helpMode'
import { InlineIcon } from '../Icon'
import { MealPool } from './MealPool'
import { mealOptions } from './comboOptions'
import { type Leftover, type MealRow, LEFTOVERS_KEY, MEALS_KEY } from './types'

// « Restants » — the leftovers pool: what's already cooked and still to finish. Unlike
// « Idées de repas », planning a leftover CONSUMES the pool row (it becomes a real,
// badged meal), so it carries a compensating undo (delete the meal AND re-insert the
// pool row).
//
// Like <MealIdeas>, it renders in TWO places from this ONE <MealPool> configuration:
//   • inline in La cuisine ▸ Repas, its own section above « Idées de repas » — the
//     pool a family reads while planning the week, back where it belongs.
//   • inside the IdeasDrawer's 🧊 « À écouler » source, with `hideHeading` (the active
//     source chip already names the concept), above the use-soon recipe shortlist.
// One file, so the add body, the recipe link, the undo and the copy can't drift.

/** Plan a leftover onto a day+slot — consumed, so it records a compensating undo. */
export function usePlanLeftover() {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  return async (l: Leftover, date: number, slot: MealSlot) => {
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
}

export function Leftovers({
  leftovers,
  recentMeals,
  week,
  help,
  hideHeading = false,
}: {
  leftovers: Leftover[]
  // Recent meals as the pick options — "what did we cook that's still in the fridge".
  recentMeals: MealRow[]
  week: { date: number; label: string }[]
  // The kitchen page's help mode (lib/helpMode) — makes the « Restants » heading
  // tappable-to-explain while armed. The drawer hides the heading, so it passes neither.
  help?: HelpMode
  hideHeading?: boolean
}) {
  const t = useT()
  const planLeftover = usePlanLeftover()

  return (
    <MealPool<Leftover, MealRow>
      items={leftovers}
      queryKey={LEFTOVERS_KEY}
      collectionKey="leftovers"
      endpoint="meal-leftovers"
      options={mealOptions(recentMeals, t)}
      buildAddBody={(title, picked) => ({
        title,
        recipeId: picked?.data.recipe_id ?? null,
        sourceMealId: picked?.data.id ?? null,
      })}
      onPlan={planLeftover}
      renderLead={() => <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />}
      // A leftover born from a saved recipe: its picto opens that recipe (same tight
      // icon-only link « Idées » uses). Tapping the chip still plans it.
      leadTo={(l) => (l.recipe_id ? `/kitchen/recipe/${l.recipe_id}` : undefined)}
      leadToLabel={t.recipes.open}
      week={week}
      help={help}
      helpKey="leftovers"
      guide={{ card: 'kitchen', point: 8 }}
      hideHeading={hideHeading}
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
