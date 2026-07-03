import { useMemo } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { type Recipe } from '../../lib/recipes'
import { type MealSlot } from '../../lib/mealSlots'
import { type MealIdea, MEAL_IDEAS_KEY, MEALS_KEY } from './types'
import { BOARD_KEY } from '../../lib/queryKeys'
import { recipeOptions } from './comboOptions'
import { InlineIcon } from '../Icon'
import { MealPool } from './MealPool'
import { type HelpMode } from '../../lib/helpMode'

// The "general ideas" pool under the week grid: a reusable shortlist of meal ideas —
// free text ("tacos") or a saved-recipe shortcut. Planning an idea onto a day leaves
// it in the pool (reusable). A thin wrapper over the shared <MealPool> (which owns the
// add / live-poll-safe delete / inline rename / plan-picker behaviour it shares with
// « Restants »); only the recipe-pick add, the reusable plan, and the copy differ.
export function MealIdeas({
  ideas,
  recipes,
  week,
  lowItems,
  listItems,
  profileId,
  help,
}: {
  ideas: MealIdea[]
  recipes: Recipe[]
  week: { date: number; label: string }[]
  lowItems: string[]
  listItems: string[]
  profileId: string | null
  // The kitchen's page-level help mode (lib/helpMode) — makes the "Idées de repas"
  // heading tappable-to-explain while armed. Optional: plain heading without it.
  help?: HelpMode
}) {
  const t = useT()
  const write = useWrite()
  // Recipes as combobox options — ranked by cookability, badged "Prêt / il manque N".
  const recipeOpts = useMemo(() => recipeOptions(recipes, lowItems, listItems, t), [recipes, lowItems, listItems, t])

  // Place an idea onto a day + meal — same shape as a recipe quick-add, so a
  // recipe-linked idea keeps its link and a free-text idea stays plain text. The idea
  // stays in the pool (reusable), so no compensating undo is needed.
  function planIdea(idea: MealIdea, date: number, slot: MealSlot) {
    void write('meals', {
      method: 'POST',
      body: { date, slot, title: idea.title, recipeId: idea.recipe_id ?? null, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY],
    }).catch(() => {})
  }

  return (
    <MealPool<MealIdea, Recipe>
      items={ideas}
      queryKey={MEAL_IDEAS_KEY}
      collectionKey="ideas"
      endpoint="meal-ideas"
      options={recipeOpts}
      buildAddBody={(title, picked) => ({ title, recipeId: picked?.data.id ?? null, suggestedBy: profileId })}
      onPlan={planIdea}
      renderLead={(idea) =>
        idea.recipe_id ? (
          <>
            <InlineIcon name="book-open-bold" size={14} color="var(--berry-deep)" />{' '}
          </>
        ) : null
      }
      week={week}
      help={help}
      helpKey="ideas"
      guide={{ card: 'kitchen' }}
      noMatchLabel={t.recipes.noMatch}
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
