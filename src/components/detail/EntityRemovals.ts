import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { useRecordUndo } from '../../lib/toast'
import { settingsHref } from '../../lib/settingsNav'
import { BOARD_KEY, CHORES_KEY, HOME_PROJECTS_KEY, MONTH_KEY, CARNETS_KEY } from '../../lib/queryKeys'
import { MEALS_KEY, MEAL_HISTORY_KEY } from '../kitchen/types'

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
// Tiers, unchanged from the board (ACTIONS.md): corvée / entretien → DEFERRED behind the
// undo toast through useDeferredRemoval, scoped to the resource key so the row hides on
// every surface at once and a poll cannot resurrect it mid-undo; a planned meal →
// compensating undo (the DELETE lands, « Annuler » re-plans it). A rendez-vous keeps
// its own door in EventPeekActions (confirm — a series delete is the heavy tier).

export interface Removable {
  id: string
  title: string
}

export function useChoreRemovals() {
  const t = useT()
  const write = useWrite()
  // Two scopes, deliberately: a corvée and a projet/entretien are different resources
  // (CHORES_KEY vs HOME_PROJECTS_KEY), and the scope is what decides which surfaces
  // hide the row together while the undo is open.
  const chores = useDeferredRemoval(CHORES_KEY)
  const home = useDeferredRemoval(HOME_PROJECTS_KEY)
  return {
    visibleChores: chores.visible,
    visibleHome: home.visible,
    isPendingChore: chores.isPending,
    isPendingHome: home.isPending,
    removeChore: (c: Removable) =>
      chores.remove([c.id], t.undo.cleared(c.title), () =>
        write('chores', {
          method: 'DELETE',
          body: { id: c.id },
          affectedKeys: [BOARD_KEY, CHORES_KEY, MONTH_KEY],
        }),
      ),
    removeHome: (c: Removable) =>
      home.remove([c.id], t.undo.cleared(c.title), () =>
        write('home-projects', {
          method: 'DELETE',
          body: { id: c.id },
          affectedKeys: [BOARD_KEY, HOME_PROJECTS_KEY, MONTH_KEY, CARNETS_KEY],
        }),
      ),
    // A corvée / projet is edited INLINE in Réglages (its row expands into the ＋ form),
    // so there is no edit scene to open: these name that place (door #11, the mirror).
    choreEditHref: settingsHref({ tab: 'maison', focus: 'chores' }),
    homeEditHref: settingsHref({ tab: 'maison', focus: 'homeProjects' }),
  }
}

// Take a planned meal off the plan, with a compensating undo that re-plans it on the
// same day + slot. Extracted from Board.tsx so the month panel offers the same door.
export function useRemoveMealFromPlan() {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  return async (m: { id: string; title: string; slot: string; day: number }) => {
    const keys = [BOARD_KEY, MEALS_KEY, MEAL_HISTORY_KEY, MONTH_KEY]
    await write('meals', { method: 'DELETE', body: { id: m.id }, affectedKeys: keys }).catch(() => {})
    recordUndo({
      message: t.undo.mealRemoved(m.title),
      onUndo: () => write('meals', { method: 'POST', body: { date: m.day, slot: m.slot, title: m.title }, affectedKeys: keys }).catch(() => {}),
    })
  }
}
