import { useMemo } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { type Recipe } from '../../lib/recipes'
import { type MealSlot } from '../../lib/mealSlots'
import { type HelpMode } from '../../lib/helpMode'
import { InlineIcon } from '../Icon'
import { MealPool } from './MealPool'
import { recipeOptions } from './comboOptions'
import { type MealIdea, MEAL_IDEAS_KEY, MEALS_KEY, MEAL_HISTORY_KEY } from './types'

// « Idées de repas » — the kept, reusable pool: free text ("tacos") or a saved-recipe
// shortcut. Planning an idea onto a day LEAVES it in the pool, so no compensating
// undo (unlike « Restants », which is consumed).
//
// It renders in TWO places on purpose, from this ONE configuration of <MealPool>:
//   • inline under the kitchen week grid (Repas tab) — the pool you add to daily,
//     one tap from where the week is read. It never left; C-14 only moved the OTHER
//     idea sources away.
//   • as the first source of the IdeasDrawer (/kitchen/idees), beside ⭐/🧊/🤖/👧,
//     with `hideHeading` (the active source chip already names the concept).
// Both callers share this file so the add body, the recipe link, and the copy can't
// drift between the grid and the drawer.

/** Plan a pool idea onto a day+slot. Reusable: the row stays in the pool. */
export function usePlanIdea() {
  const write = useWrite()
  return (idea: Pick<MealIdea, 'title' | 'recipe_id'>, date: number, slot: MealSlot) => {
    void write('meals', {
      method: 'POST',
      body: { date, slot, title: idea.title, recipeId: idea.recipe_id ?? null, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
    }).catch(() => {})
  }
}

export function MealIdeas({
  ideas,
  recipes,
  week,
  lowItems,
  listItems,
  profileId,
  help,
  hideHeading = false,
}: {
  ideas: MealIdea[]
  recipes: Recipe[]
  week: { date: number; label: string }[]
  lowItems: string[]
  listItems: string[]
  profileId: string | null
  // The kitchen page's help mode (lib/helpMode) — makes the « Idées de repas »
  // heading tappable-to-explain while armed. The drawer hides the heading, so it
  // passes neither.
  help?: HelpMode
  hideHeading?: boolean
}) {
  const t = useT()
  // Recipes as combobox options — ranked by cookability, badged "Prêt / il manque N".
  const recipeOpts = useMemo(() => recipeOptions(recipes, lowItems, listItems, t), [recipes, lowItems, listItems, t])
  const planIdea = usePlanIdea()

  return (
    <MealPool<MealIdea, Recipe>
      items={ideas}
      queryKey={MEAL_IDEAS_KEY}
      collectionKey="ideas"
      endpoint="meal-ideas"
      options={recipeOpts}
      buildAddBody={(title, picked) => ({ title, recipeId: picked?.data.id ?? null, suggestedBy: profileId })}
      onPlan={planIdea}
      renderLead={(idea) => (idea.recipe_id ? <InlineIcon name="book-open-bold" size={14} color="var(--berry-deep)" /> : null)}
      // An idea born from a recipe: its 📖 picto opens that recipe (same tight
      // icon-only link as the combobox row). Tapping the chip still plans it.
      leadTo={(idea) => (idea.recipe_id ? `/kitchen/recipe/${idea.recipe_id}` : undefined)}
      leadToLabel={t.recipes.open}
      week={week}
      help={help}
      helpKey="ideas"
      noMatchLabel={t.recipes.noMatch}
      guide={{ card: 'kitchen', point: 9 }}
      hideHeading={hideHeading}
      labels={{
        heading: t.kitchen.ideas,
        addAria: t.kitchen.addIdea,
        addPlaceholder: t.kitchen.addIdea,
        empty: t.kitchen.ideasEmpty,
        removeLabel: t.kitchen.removeIdea,
        removedUndo: (title) => t.undo.mealIdeaRemoved(title),
      }}
    />
  )
}
