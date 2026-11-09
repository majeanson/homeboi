import { useT } from '../../i18n'
import { useWrite, wrote } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { useRecordUndo } from '../../lib/toast'

import { BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { removeBody, taskEndpoint, taskKeys, taskScene, type TaskRef } from '../../lib/taskSave'
import { useQueryClient } from '@tanstack/react-query'
import { MEALS_KEY, MEAL_HISTORY_KEY, type MealRow } from '../kitchen/types'
import { restoreMeals } from '../kitchen/mealMutations'

// « Remove it from where you SEE it » — the delete doors a calendar row's peek offers,
// in ONE place (Marc, 2026-09-16: « make sure we can remove/delete easily from detail
// popups and such for rendez-vous and others on calendar »).
//
// Until then the board owned these closures and the month panel had none: a corvée or
// an entretien tapped on the calendar opened a peek with no « Modifier » and no
// « Supprimer », and a planned meal tapped there could not be taken off the plan. The
// same rows on the board had all three. One hook, three surfaces (board · Mois · the
// day page), so a row can never behave differently depending on which face named it.
//
// Tiers, unchanged from the board (ACTIONS.md): a task → DEFERRED behind the undo toast
// through useDeferredRemoval, scoped to the calendar's key so every occurrence of it hides
// at once and a poll cannot resurrect it mid-undo; a planned meal →
// compensating undo (the DELETE lands, « Annuler » re-plans it). A rendez-vous keeps
// its own door in EventPeekActions (confirm — a series delete is the heavy tier).

// A task named on a calendar day: its row (`taskId`), whichever occurrence was tapped.
type CalendarTask = Pick<TaskRef, 'source' | 'title'> & { taskId: string }

export function useChoreRemovals() {
  const t = useT()
  const write = useWrite()
  // ONE scope for every task (2026-11-08): a calendar cell is a task whatever its face, and
  // the save adapter (lib/taskSave) spells each face's DELETE.
  const tasks = useDeferredRemoval(MONTH_KEY)
  const ref = (c: CalendarTask): TaskRef => ({ source: c.source, id: c.taskId, title: c.title })
  return {
    /** The cells whose task is not being removed right now: every occurrence hides at once. */
    visibleTasks: <T extends { taskId: string }>(rows: readonly T[]): T[] => rows.filter((r) => !tasks.isPending(r.taskId)),
    removeTask: (c: CalendarTask) =>
      tasks.remove([c.taskId], t.undo.cleared(c.title), () =>
        write(taskEndpoint(c), {
          method: 'DELETE',
          body: removeBody(ref(c)),
          affectedKeys: [BOARD_KEY, MONTH_KEY, ...taskKeys(c)],
        }),
      ),
    /** The one task form, in its scene: reachable from any occurrence. */
    taskEditHref: (c: CalendarTask) => taskScene(ref(c)),
  }
}

// What « Retirer du plan » removed, as the owner's `restoreMeals` wants it back. Pure,
// so the one fact that matters is unit-tested: the recipe link SURVIVES the round trip.
// Until 2026-11-05 this undo re-POSTed `{date, slot, title}` — a bare title — while the
// day scene's undo (`restoreMeals`) kept `recipe_id`; the same gesture on two surfaces
// lost different things, which is the drift write-owners.test.ts now refuses.
export interface RemovedMeal {
  id: string
  title: string
  slot: string
  day: number
  recipe_id?: string | null | undefined
}
export function restoredMealRow(m: RemovedMeal): MealRow {
  return { id: m.id, date: m.day, slot: m.slot, title: m.title, cook_member_id: null, recipe_id: m.recipe_id ?? null }
}

// Take a planned meal off the plan, with a compensating undo that re-plans it on the
// same day + slot — through the OWNER (`restoreMeals`, components/kitchen/mealMutations),
// so the board, the month panel and the day scene undo the same way. Extracted from
// Board.tsx so the month panel offers the same door.
export function useRemoveMealFromPlan() {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  return async (m: RemovedMeal) => {
    const keys = [BOARD_KEY, MEALS_KEY, MEAL_HISTORY_KEY, MONTH_KEY]
    // No « Annuler » for a removal that did not happen (it would re-plan a meal never removed).
    if (!(await wrote(write('meals', { method: 'DELETE', body: { id: m.id }, affectedKeys: keys })))) return
    recordUndo({
      message: t.undo.mealRemoved(m.title),
      onUndo: () => void restoreMeals(qc, [restoredMealRow(m)]),
    })
  }
}
