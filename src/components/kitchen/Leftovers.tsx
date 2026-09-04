import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { type MealSlot } from '../../lib/mealSlots'
import { type HelpMode } from '../../lib/helpMode'
import { InlineIcon } from '../Icon'
import { MealPool } from './MealPool'
import { mealOptions } from './comboOptions'
import { type Leftover, type MealRow, LEFTOVERS_KEY, MEALS_KEY, MEAL_HISTORY_KEY } from './types'

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

/** Plan a leftover onto a day+slot — consumed, so it records a compensating undo.
 * The param is the SUBSET of Leftover this actually reads, so the board can pass
 * its leaner /api/board row (no created_at there) without inventing one. */
export function usePlanLeftover() {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  return async (l: Pick<Leftover, 'id' | 'title' | 'recipe_id' | 'source_meal_id'>, date: number, slot: MealSlot) => {
    const keys = [LEFTOVERS_KEY, MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY]
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


/**
 * « Il en reste ? » — announce leftovers from something already cooked INTO the pool
 * (the mirror of usePlanLeftover, which takes one back out). Compensating undo: the
 * pool is live-polled, so the row has to be deleted rather than held back.
 *
 * Lived in THREE hand-rolled copies before 2026-08-28 — the day editor, the board's
 * meal peek, and (differently) the ＋ sheet — which is how they came to disagree on
 * the invalidation: the day page refreshed only the kitchen pool, the board only the
 * board, and each announce left the OTHER surface showing a stale list until its next
 * poll. One hook, both keys, so they can't drift apart again.
 *
 * `from` is deliberately loose: a meal row (with its recipe link), a board meal (no
 * recipe_id in that payload), or a recipe with no meal behind it at all.
 *
 * `opts.undo` opts OUT of the undo toast, and it is not a preference: the toast is
 * z-index 40 and a full-screen scene is 80–90, so an « Annuler » offered from inside
 * one is painted UNDERNEATH it — an undo nobody can tap. Cook mode hit exactly this
 * on 2026-08-27. A caller that turns it off owes the user another way back (its own
 * control state, or a reachable door on the pool itself). Returns the new row's id
 * so such a caller can undo it in place.
 *
 * (The ＋ sheet keeps its own copy ON PURPOSE — it is a form with busy/error state
 * that closes on success, and it offers no undo because the sheet is already gone.)
 */
export function useAnnounceLeftover() {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  return async (
    from: { id?: string | null; title: string; recipe_id?: string | null },
    opts?: { undo?: boolean },
  ): Promise<string | undefined> => {
    const keys = [LEFTOVERS_KEY, BOARD_KEY]
    const res = await write<{ id?: string }>('meal-leftovers', {
      method: 'POST',
      body: { title: from.title, recipeId: from.recipe_id ?? null, sourceMealId: from.id ?? null },
      affectedKeys: keys,
    }).catch(() => null)
    const id = res && !res.queued ? res.data?.id : undefined
    if (opts?.undo !== false)
      recordUndo({
        message: t.undo.leftoverAdded(from.title),
        onUndo: () => {
          if (id) void write('meal-leftovers', { method: 'DELETE', body: { id }, affectedKeys: keys }).catch(() => {})
        },
      })
    return id
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
