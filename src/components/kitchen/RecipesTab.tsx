import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { type Recipe, recipeImg, allTags, recipeTotalMin } from '../../lib/recipes'
import { rankCookable, rankUseSoon } from '../../lib/cookable'
import { withoutHeadings } from '../../lib/recipeSections'
import { formatDuration } from '../../lib/duration'
import { pictoFor } from '../../lib/picto'
import { InlineIcon } from '../Icon'

// The recipe book: search, tag chips, and the two stock-aware sorts ("what can
// I cook" by fewest missing staples, "use it up" by most use-soon items used).
// Owns all its filter state; the page just hands in the data and the open
// callback. (Creating a recipe moved to the contextual ＋ FAB → ?add=recipe.)
export function RecipesTab({
  recipes,
  lowItems,
  soonItems,
  listItems,
  onView,
}: {
  recipes: Recipe[]
  lowItems: string[]
  soonItems: string[]
  listItems: string[]
  onView: (r: Recipe) => void
}) {
  const t = useT()
  const [recipeQuery, setRecipeQuery] = useState('')
  // Single active tag filter (null = all). Drives the chip row over the grid.
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  // "Quoi cuisiner ?" / "À utiliser bientôt": mutually exclusive sorts.
  const [cookFilter, setCookFilter] = useState(false)
  const [useSoonFilter, setUseSoonFilter] = useState(false)
  // "⏱ ≤ 30 min": total-time filter, an AND on top of search/tags. Only offered
  // once at least one recipe carries time data, so it never appears as a no-op.
  const [fastFilter, setFastFilter] = useState(false)
  const canFastFilter = useMemo(() => recipes.some((r) => recipeTotalMin(r) != null), [recipes])
  const tags = useMemo(() => allTags(recipes), [recipes])

  const shownRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase()
    const tf = tagFilter?.toLowerCase()
    return recipes.filter((r) => {
      if (q && !(r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.toLowerCase().includes(q)))) return false
      if (tf && !(r.tags ?? []).some((tg) => tg.toLowerCase() === tf)) return false
      if (fastFilter && canFastFilter) {
        const tm = recipeTotalMin(r)
        if (!tm || tm > 30) return false
      }
      return true
    })
  }, [recipes, recipeQuery, tagFilter, fastFilter, canFastFilter])
  // Cookability: which staple each recipe is missing (out of stock + not on the
  // list), fewest first. The filter only surfaces when there's a low item to
  // rank against, so it never appears as a no-op.
  const ranked = useMemo(() => rankCookable(shownRecipes, lowItems, listItems), [shownRecipes, lowItems, listItems])
  const missingById = useMemo(() => new Map(ranked.map((r) => [r.recipe.id, r.missing])), [ranked])
  const canCookFilter = lowItems.length > 0 && recipes.length > 0
  // "Use it up" ranking: which use-soon items each recipe would finish, most first.
  const rankedSoon = useMemo(() => rankUseSoon(shownRecipes, soonItems), [shownRecipes, soonItems])
  const usesById = useMemo(() => new Map(rankedSoon.map((r) => [r.recipe.id, r.uses])), [rankedSoon])
  const canUseSoonFilter = soonItems.length > 0 && recipes.length > 0
  const recipeOrder =
    useSoonFilter && canUseSoonFilter
      ? rankedSoon.map((r) => r.recipe)
      : cookFilter && canCookFilter
        ? ranked.map((r) => r.recipe)
        : shownRecipes

  return (
    <section>
      <div className="kitchen__head">
        <h2>{t.recipes.title}</h2>
      </div>
      {(recipes.length > 3 || canCookFilter || canUseSoonFilter || canFastFilter) && (
        <div className="kitchen__recipe-tools">
          {recipes.length > 3 && (
            <input
              className="input kitchen__recipe-search"
              value={recipeQuery}
              onChange={(e) => setRecipeQuery(e.target.value)}
              placeholder={t.recipes.search}
              aria-label={t.recipes.search}
            />
          )}
          {canCookFilter && (
            <button
              type="button"
              className={`chip kitchen__cook-filter${cookFilter ? ' is-on' : ''}`}
              onClick={() => {
                setCookFilter((v) => !v)
                setUseSoonFilter(false)
              }}
              aria-pressed={cookFilter}
            >
              <InlineIcon name="cooking-pot-bold" /> {t.recipes.cookable}
            </button>
          )}
          {canUseSoonFilter && (
            <button
              type="button"
              className={`chip kitchen__soon-filter${useSoonFilter ? ' is-on' : ''}`}
              onClick={() => {
                setUseSoonFilter((v) => !v)
                setCookFilter(false)
              }}
              aria-pressed={useSoonFilter}
            >
              <InlineIcon name="recycle-bold" /> {t.recipes.useItUp}
            </button>
          )}
          {canFastFilter && (
            <button
              type="button"
              className={`chip kitchen__fast-filter${fastFilter ? ' is-on' : ''}`}
              onClick={() => setFastFilter((v) => !v)}
              aria-pressed={fastFilter}
            >
              ⏱ {t.recipes.fast30}
            </button>
          )}
        </div>
      )}
      {tags.length > 0 && (
        <div className="kitchen__tag-filter">
          <button
            type="button"
            className={`chip${!tagFilter ? ' is-on' : ''}`}
            onClick={() => setTagFilter(null)}
            aria-pressed={!tagFilter}
          >
            {t.recipes.allTag}
          </button>
          {tags.map((tg) => {
            const on = tagFilter?.toLowerCase() === tg.toLowerCase()
            return (
              <button
                key={tg}
                type="button"
                className={`chip${on ? ' is-on' : ''}`}
                onClick={() => setTagFilter(on ? null : tg)}
                aria-pressed={on}
              >
                {tg}
              </button>
            )
          })}
        </div>
      )}
      {recipes.length === 0 ? (
        <p className="board__empty mono">{t.recipes.empty}</p>
      ) : recipeOrder.length === 0 ? (
        // The book has recipes — the FILTERS hid them all. Say so (instead of
        // the misleading "no recipes yet") and offer the one-tap way back.
        <div className="board__empty mono">
          <p>{t.recipes.noMatch}</p>
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => {
              setRecipeQuery('')
              setTagFilter(null)
              setCookFilter(false)
              setUseSoonFilter(false)
              setFastFilter(false)
            }}
          >
            {t.recipes.clearFilters}
          </button>
        </div>
      ) : (
        <div className="recipe-grid">
          {recipeOrder.map((r) => {
            const img = recipeImg(r.image)
            const missing = missingById.get(r.id) ?? []
            const uses = usesById.get(r.id) ?? []
            // Badge counts real ingredients, not "## Section" markers.
            const nIngs = withoutHeadings(r.ingredients).length
            const totalMin = recipeTotalMin(r)
            return (
              <button key={r.id} type="button" className="recipe-card surface" onClick={() => onView(r)}>
                <span className="recipe-card__thumb" aria-hidden="true">
                  {img ? <img src={img} alt="" loading="lazy" /> : <span className="recipe-card__noimg">{pictoFor(r.title, '🍳')}</span>}
                </span>
                <span className="recipe-card__title">{r.title}</span>
                {useSoonFilter && canUseSoonFilter ? (
                  uses.length > 0 ? (
                    <span className="recipe-card__sub recipe-card__uses mono">
                      <InlineIcon name="recycle-bold" size={12} /> {t.recipes.usesN(uses.length)}
                    </span>
                  ) : (
                    nIngs > 0 && <span className="recipe-card__sub mono">{t.recipes.count(nIngs)}</span>
                  )
                ) : cookFilter && canCookFilter ? (
                  missing.length === 0 ? (
                    <span className="recipe-card__sub recipe-card__ready mono">
                      <InlineIcon name="check-bold" color="var(--sage-deep)" /> {t.recipes.ready}
                    </span>
                  ) : (
                    <span className="recipe-card__sub recipe-card__missing mono">{t.recipes.missingN(missing.length)}</span>
                  )
                ) : (
                  nIngs > 0 && <span className="recipe-card__sub mono">{t.recipes.count(nIngs)}</span>
                )}
                {totalMin != null && (
                  <span className="recipe-card__time mono">⏱ {formatDuration(totalMin * 60)}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
