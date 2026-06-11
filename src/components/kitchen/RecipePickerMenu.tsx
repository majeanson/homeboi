import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { rankCookable } from '../../lib/cookable'

// A searchable, ranked recipe picker — shared by every slot's "Choisir une
// recette" (the week grid) so picking a recipe is the same everywhere. Instead
// of a flat chip wall of every title, it: ranks by what you could cook now
// (fewest missing staples first, reusing rankCookable), badges "Prêt" / "il
// manque N", and filters as you type. onPick fires with the chosen recipe.
export function RecipePickerMenu({
  recipes,
  lowItems,
  listItems,
  onPick,
}: {
  recipes: Recipe[]
  lowItems: string[]
  listItems: string[]
  onPick: (recipe: Recipe) => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const ranked = useMemo(() => rankCookable(recipes, lowItems, listItems), [recipes, lowItems, listItems])
  // Badges only mean something when there's a low item to rank against — with an
  // empty pantry-low list every recipe is "ready", which is just noise.
  const showBadge = lowItems.length > 0
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return ranked
    return ranked.filter(
      ({ recipe }) =>
        recipe.title.toLowerCase().includes(needle) ||
        recipe.ingredients.some((i) => i.toLowerCase().includes(needle)),
    )
  }, [ranked, q])

  return (
    <div className="recipe-picker">
      <input
        className="input recipe-picker__search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.recipes.search}
        aria-label={t.recipes.search}
      />
      {shown.length === 0 ? (
        <p className="recipe-picker__empty mono">{t.recipes.noMatch}</p>
      ) : (
        <ul className="recipe-picker__list">
          {shown.map(({ recipe, missing }) => (
            <li key={recipe.id}>
              <button type="button" className="recipe-picker__row" onClick={() => onPick(recipe)}>
                <span className="recipe-picker__title">{recipe.title}</span>
                {showBadge &&
                  (missing.length === 0 ? (
                    <span className="recipe-picker__badge is-ready mono">✓ {t.recipes.ready}</span>
                  ) : (
                    <span className="recipe-picker__badge mono">{t.recipes.missingN(missing.length)}</span>
                  ))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
