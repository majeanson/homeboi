import { type ComboOption } from '../EntityCombobox'
import { InlineIcon } from '../Icon'
import { type Recipe } from '../../lib/recipes'
import { rankCookable } from '../../lib/cookable'
import { type Pill, slotPriorityLabel } from '../../lib/recipePills'
import { type MealSlot } from '../../lib/mealSlots'
import { type Leftover, type MealRow } from './types'
import { type useT } from '../../i18n'

// Shared builders that turn kitchen entities into EntityCombobox options, so the
// recipe / leftover / recent-meal dropdowns read identically wherever they appear
// (the day editor, the ideas pool, the leftovers pool, the ＋ sheet). Recipes keep
// the cookable ranking + "Prêt / il manque N" badges that RecipePickerMenu had.
type T = ReturnType<typeof useT>

// Recipes, ranked by what you could cook now (fewest missing staples first), each
// badged like the old picker. `group` tags them for a grouped dropdown (the day
// editor mixes recipes with leftovers); omit it for a single-source field.
export function recipeOptions(
  recipes: Recipe[],
  lowItems: string[],
  listItems: string[],
  t: T,
  opts: { group?: string; readyBadge?: boolean; priority?: (r: Recipe) => string | null } = {},
): ComboOption<Recipe>[] {
  const { group, readyBadge = true, priority } = opts
  // Badges only mean something against a low list — with an empty pantry-low every
  // recipe is "ready", which is just noise (same rule as RecipePickerMenu).
  const showBadge = lowItems.length > 0
  let ranked = rankCookable(recipes, lowItems, listItems)
  // A meal-slot pill (e.g. "Dîner & Souper") lifts its matching recipes to the top —
  // cookability still orders WITHIN each group, so "what you could cook now" isn't
  // lost, just outranked by what the household said belongs at this slot. `priority`
  // names WHICH pill did it (null = didn't), shown as the row's hint below so the
  // reorder isn't silent — a household member who never opened Réglages had no way
  // to know why a recipe jumped to the top.
  //
  // Resolved ONCE per recipe into this map: `priority` walks every active pill's
  // every rule, and the partition + the hint below would otherwise each ask again
  // (3 walks per row, per keystroke of the combobox filter). `null` = not lifted;
  // `''` = lifted by a pill the household left unnamed, which is why the partition
  // tests `!== null` rather than truthiness.
  const lifted = priority ? new Map(ranked.map((x) => [x.recipe.id, priority(x.recipe)])) : null
  if (lifted) {
    ranked = [
      ...ranked.filter((x) => lifted.get(x.recipe.id) !== null),
      ...ranked.filter((x) => lifted.get(x.recipe.id) === null),
    ]
  }
  return ranked.map(({ recipe, missing }) => ({
    id: recipe.id,
    label: recipe.title,
    data: recipe,
    group,
    icon: 'book-open-bold',
    iconColor: 'var(--berry-deep)',
    // Tapping the picto opens the recipe instead of picking it — you can read the
    // ingredients before committing the row. The rest of the row still picks.
    iconTo: `/kitchen/recipe/${recipe.id}`,
    iconToLabel: t.recipes.open,
    keywords: recipe.ingredients,
    hint: lifted?.get(recipe.id) ? t.recipes.pillLifted(lifted.get(recipe.id)!) : undefined,
    badge: showBadge
      ? missing.length === 0
        ? readyBadge
          ? (
              <span className="combobox__badge is-ready mono">
                <InlineIcon name="check-bold" /> {t.recipes.ready}
              </span>
            )
          : undefined
        : <span className="combobox__badge mono">{t.recipes.missingN(missing.length)}</span>
      : undefined,
  }))
}

// The Restants pool — no cookability (a leftover is already cooked), just the
// recycle picto, so it reads as a leftover beside the recipe rows.
function leftoverOptions(leftovers: Leftover[], t: T, group?: string): ComboOption<Leftover>[] {
  return leftovers.map((l) => ({
    id: l.id,
    label: l.title,
    data: l,
    group,
    icon: 'arrow-counter-clockwise-bold',
    iconColor: 'var(--terracotta-deep)',
    // A leftover born from a saved recipe: tapping its picto opens that recipe (the
    // same tight icon-only link the recipe rows use); the rest of the row still picks.
    iconTo: l.recipe_id ? `/kitchen/recipe/${l.recipe_id}` : undefined,
    iconToLabel: l.recipe_id ? t.recipes.open : undefined,
  }))
}

// The day editor's slot field mixes both sources in one dropdown: pick a recipe
// (links it, optional staples) OR a pooled leftover (consumes it into the slot).
// `kind` lets the caller route the pick to the right handler. Group headings only
// appear when BOTH sources are present (a single source needs no label).
export type MealPick = { kind: 'recipe'; recipe: Recipe } | { kind: 'leftover'; leftover: Leftover }

export function mealPickOptions(
  recipes: Recipe[],
  lowItems: string[],
  listItems: string[],
  leftovers: Leftover[],
  t: T,
  // Which meal slot this picker is for, plus the household's pill config + who
  // loved what — together they decide which recipes get lifted to the top of the
  // recipe group (see lib/recipePills.slotPriorityLabel). All optional: omit `slot` (or
  // leave `pills` empty) and the picker behaves exactly as before, cookable-ranked.
  opts: { slot?: MealSlot; pills?: Pill[]; loved?: Set<string> } = {},
): ComboOption<MealPick>[] {
  const both = recipes.length > 0 && leftovers.length > 0
  const priority = opts.slot ? slotPriorityLabel(opts.pills ?? [], opts.slot, opts.loved ?? new Set()) : undefined
  // No "Prêt" checkmark here (readyBadge: false) — the compact meal-slot picker
  // doesn't need it; recipeOptions' other caller (MealIdeas) keeps the badge.
  const r: ComboOption<MealPick>[] = recipeOptions(recipes, lowItems, listItems, t, {
    group: both ? t.recipes.title : undefined,
    readyBadge: false,
    priority,
  }).map((o) => ({ ...o, data: { kind: 'recipe', recipe: o.data } }))
  const l: ComboOption<MealPick>[] = leftoverOptions(leftovers, t, both ? t.kitchen.leftovers : undefined).map((o) => ({
    ...o,
    data: { kind: 'leftover', leftover: o.data },
  }))
  // Restants lead — what's already cooked and just needs a home beats a fresh recipe.
  return [...l, ...r]
}

// Recent / today's planned meals — "we ate this, there's some left" suggestions
// for the leftovers field. Carries recipe_id + the source meal id so a leftover
// born from a cooked recipe keeps its link.
export function mealOptions(meals: MealRow[], t: T, group?: string): ComboOption<MealRow>[] {
  return meals.map((m) => ({
    id: m.id,
    label: m.title,
    data: m,
    group,
    icon: 'arrow-counter-clockwise-bold',
    iconColor: 'var(--terracotta-deep)',
    // A recent meal cooked from a saved recipe keeps its link: tapping the picto
    // opens that recipe before you spin it into a leftover; the row still picks.
    iconTo: m.recipe_id ? `/kitchen/recipe/${m.recipe_id}` : undefined,
    iconToLabel: m.recipe_id ? t.recipes.open : undefined,
  }))
}
