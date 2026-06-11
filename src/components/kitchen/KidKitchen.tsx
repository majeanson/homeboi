import { useState } from 'react'
import { useLang, useT } from '../../i18n'
import { formatWeekday } from '../../lib/format'
import { pictoFor } from '../../lib/picto'
import { type Recipe, recipeImg } from '../../lib/recipes'
import { BigTiles, Sayable, type Tile } from '../BigTiles'
import { type MealRow, type WeekDay } from './types'

// Toddler lens on the kitchen: just "what's for supper" this week, big and
// read-aloud, plus the picture-first meal picker. Each supper draws its own food
// picture (pictoFor) so a pre-reader sees pizza/soup/chicken — not seven
// identical plates. A child's pick is a SUGGESTION (onSuggest) — it only fills
// an empty day; planned days grey out and stay read-only.
export function KidKitchen({
  week,
  recipes,
  recipeFor,
  onSuggest,
  onStartRecipe,
}: {
  week: WeekDay[]
  recipes: Recipe[]
  recipeFor: (meal: MealRow) => Recipe | undefined
  onSuggest: (date: number, recipe: Recipe) => void
  onStartRecipe: (recipe: Recipe) => void
}) {
  const t = useT()
  const { lang } = useLang()
  // The recipe a child has tapped and is now choosing a day for (null = still
  // browsing the recipe shelf).
  const [kidRecipe, setKidRecipe] = useState<Recipe | null>(null)

  // A planned supper that maps to a saved recipe is tappable: hear "Jeudi :
  // Spaghetti" first, then a second tap STARTS the recipe (Cook mode — big
  // read-aloud steps). Planned meals with no matching recipe stay read-aloud only.
  const planned: Tile[] = week
    .filter((d) => d.meal)
    .map((d) => {
      const recipe = recipeFor(d.meal!)
      return {
        key: String(d.date),
        icon: pictoFor(d.meal!.title, '🍽'),
        label: d.meal!.title,
        sub: formatWeekday(d.date, lang),
        narration: `${formatWeekday(d.date, lang)}: ${d.meal!.title}`,
        confirmHint: recipe ? t.kid.tapToCook : undefined,
        onTap: recipe ? () => onStartRecipe(recipe) : undefined,
      }
    })
  // The picker: tap a recipe to hear it (BigTiles speaks on tap) and choose it,
  // then tap a day to put it on the menu. The day tile's narration ("Lundi:
  // Pizza") doubles as the spoken confirmation, and `planned` above redraws so
  // the child watches their pick appear. Real photo when the recipe has one,
  // the food picto as fallback (NFR-KID-2: pick by sight, never by reading).
  const recipeTiles: Tile[] = recipes.map((r) => ({
    key: r.id,
    image: recipeImg(r.image),
    icon: pictoFor(r.title, '🍽'),
    label: r.title,
    onTap: () => setKidRecipe(r),
  }))
  const dayTiles: Tile[] = kidRecipe
    ? week.map(({ date, meal }) => ({
        key: String(date),
        icon: meal ? pictoFor(meal.title, '🍽') : '📅',
        label: formatWeekday(date, lang),
        sub: meal?.title,
        // A planned day is "taken" — greyed and read-only (tapping just reads the
        // meal that's already there). Only empty days accept the suggestion.
        done: !!meal,
        narration: meal
          ? `${formatWeekday(date, lang)}: ${meal.title}`
          : `${formatWeekday(date, lang)}: ${kidRecipe.title}`,
        onTap: meal
          ? undefined
          : () => {
              setKidRecipe(null)
              onSuggest(date, kidRecipe)
            },
      }))
    : []

  return (
    <main className={`kid__main${recipes.length > 0 ? ' kid__main--feed' : ''}`}>
      <div className="kid-head">
        <span className="kid-head__emoji" aria-hidden="true">🍲</span>
        <Sayable className="kid-head__title" text={t.kid.supper} />
      </div>
      <BigTiles tiles={planned} empty={t.board.nothingTonight} />

      {recipes.length > 0 &&
        (kidRecipe ? (
          <section className="kid-pick">
            <div className="kid-head">
              <span className="kid-head__emoji" aria-hidden="true">
                {pictoFor(kidRecipe.title, '🍽')}
              </span>
              <Sayable className="kid-head__title" text={t.kid.whichDay} />
            </div>
            <BigTiles tiles={dayTiles} />
            <button type="button" className="kid-pick__back mono" onClick={() => setKidRecipe(null)}>
              ← {t.kid.back}
            </button>
          </section>
        ) : (
          <section className="kid-pick">
            <div className="kid-head">
              <span className="kid-head__emoji" aria-hidden="true">📖</span>
              <Sayable className="kid-head__title" text={t.kid.pickMeal} />
            </div>
            <BigTiles tiles={recipeTiles} />
          </section>
        ))}
    </main>
  )
}
