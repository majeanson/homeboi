import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { type Recipe, type RecipeTagsData, RECIPE_TAGS_KEY, recipeImg, allTags, recipeTotalMin, tagColor } from '../../lib/recipes'
import { wash, tintInk, edge } from '../../lib/colors'
import { rankCookable, rankUseSoon, rankNeglected } from '../../lib/cookable'
import { withoutHeadings } from '../../lib/recipeSections'
import { formatDuration } from '../../lib/duration'
import { pictoFor } from '../../lib/picto'
import { todayLocalDay } from '../../lib/localDay'
import { InlineIcon } from '../Icon'

// The recipe book: search, tag chips, and the stock-aware sorts ("what can I
// cook" by fewest missing staples, "use it up" by most use-soon items used,
// "oubliées" by longest since last served). Owns all its filter state; the page
// just hands in the data and the open callback. (Creating a recipe moved to the
// contextual ＋ FAB → ?add=recipe.)
//
// `collectionTag` (#11): when set, the book is pre-scoped to that ONE tag (the
// collections browse layer drops in here) — the tag is applied silently and the
// tag-filter chip row hides, so the view reads as "this collection" not "the whole
// book with a chip pressed".
// `lastServed` (#12): recipe id → local-midnight day-seconds it was last cooked,
// built by the page from the meals it holds; powers the calm "Oubliées" sort.
export function RecipesTab({
  recipes,
  lowItems,
  soonItems,
  listItems,
  lastServed,
  collectionTag,
  onView,
}: {
  recipes: Recipe[]
  lowItems: string[]
  soonItems: string[]
  listItems: string[]
  lastServed?: Map<string, number>
  collectionTag?: string
  onView: (r: Recipe) => void
}) {
  const t = useT()
  const [recipeQuery, setRecipeQuery] = useState('')
  // Active tag filters, as lowercase keys. Empty = "Toutes" (no constraint).
  // Multi-select with AND semantics: a recipe must carry EVERY selected tag.
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const toggleTag = (tg: string) => {
    const key = tg.toLowerCase()
    setTagFilter((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]))
  }
  // "Quoi cuisiner ?" / "À utiliser bientôt" / "Oubliées": mutually exclusive sorts.
  const [cookFilter, setCookFilter] = useState(false)
  const [useSoonFilter, setUseSoonFilter] = useState(false)
  // #12 "Haven't had in a while": sort the book by longest-since-served. A gentle
  // re-surfacing of neglected favourites, never a streak/score (NFR-CALM).
  const [neglectFilter, setNeglectFilter] = useState(false)
  // "⏱ ≤ 30 min": total-time filter, an AND on top of search/tags. Only offered
  // once at least one recipe carries time data, so it never appears as a no-op.
  const [fastFilter, setFastFilter] = useState(false)
  const canFastFilter = useMemo(() => recipes.some((r) => recipeTotalMin(r) != null), [recipes])
  const tags = useMemo(() => allTags(recipes), [recipes])
  // Per-tag household colours (migration 0037) — tint the filter pills to match
  // the recipe view. Optional binding: undefined until the read lands.
  const tagColors = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') }).data?.colors

  const collectionKey = collectionTag?.toLowerCase()
  const shownRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase()
    return recipes.filter((r) => {
      // #11: a collection pre-scopes the whole view to one tag, silently.
      if (collectionKey && !(r.tags ?? []).some((tg) => tg.toLowerCase() === collectionKey)) return false
      if (q && !(r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.toLowerCase().includes(q)))) return false
      // AND: every selected tag must be present on the recipe.
      if (tagFilter.length) {
        const rt = new Set((r.tags ?? []).map((tg) => tg.toLowerCase()))
        if (!tagFilter.every((k) => rt.has(k))) return false
      }
      if (fastFilter && canFastFilter) {
        const tm = recipeTotalMin(r)
        if (!tm || tm > 30) return false
      }
      return true
    })
  }, [recipes, recipeQuery, tagFilter, fastFilter, canFastFilter, collectionKey])
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
  // #12 "Oubliées": longest-since-served first. Offered only once we have ANY
  // serving history to order by AND more than one recipe (a single recipe can't
  // be "neglected relative to" anything). daysSince null = never-served → leads.
  const today = todayLocalDay()
  const rankedNeglect = useMemo(
    () => rankNeglected(shownRecipes, lastServed ?? new Map(), today),
    [shownRecipes, lastServed, today],
  )
  const daysSinceById = useMemo(
    () => new Map(rankedNeglect.map((r) => [r.recipe.id, r.daysSince])),
    [rankedNeglect],
  )
  const canNeglectFilter = (lastServed?.size ?? 0) > 0 && recipes.length > 1
  const recipeOrder =
    useSoonFilter && canUseSoonFilter
      ? rankedSoon.map((r) => r.recipe)
      : cookFilter && canCookFilter
        ? ranked.map((r) => r.recipe)
        : neglectFilter && canNeglectFilter
          ? rankedNeglect.map((r) => r.recipe)
          : shownRecipes

  return (
    <section>
      <div className="kitchen__head">
        <h2>{t.recipes.title}</h2>
      </div>
      {(recipes.length > 3 || canCookFilter || canUseSoonFilter || canFastFilter || canNeglectFilter) && (
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
          {canNeglectFilter && (
            <button
              type="button"
              className={`chip kitchen__neglect-filter${neglectFilter ? ' is-on' : ''}`}
              onClick={() => {
                setNeglectFilter((v) => !v)
                setCookFilter(false)
                setUseSoonFilter(false)
              }}
              aria-pressed={neglectFilter}
            >
              <InlineIcon name="clock-bold" /> {t.recipes.neglected}
            </button>
          )}
        </div>
      )}
      {/* #11: a collection pre-scopes the view to one tag — hide the tag-filter
          row so it doesn't double as a "press the tag again" control. */}
      {!collectionTag && tags.length > 0 && (
        <div className="kitchen__tag-filter">
          <button
            type="button"
            className={`chip${tagFilter.length === 0 ? ' is-on' : ''}`}
            onClick={() => setTagFilter([])}
            aria-pressed={tagFilter.length === 0}
          >
            {t.recipes.allTag}
          </button>
          {tags.map((tg) => {
            const on = tagFilter.includes(tg.toLowerCase())
            const hex = tagColor(tagColors, tg)
            // Tint by the tag colour: a solid-ish fill when selected, a faint wash
            // when not, so the colour reads either way without losing the on/off cue.
            const style = hex
              ? on
                ? { background: tintInk(hex), color: '#fffcf5', borderColor: tintInk(hex) }
                : { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) }
              : undefined
            return (
              <button
                key={tg}
                type="button"
                className={`chip${on ? ' is-on' : ''}`}
                style={style}
                onClick={() => toggleTag(tg)}
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
              setTagFilter([])
              setCookFilter(false)
              setUseSoonFilter(false)
              setFastFilter(false)
              setNeglectFilter(false)
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
                ) : neglectFilter && canNeglectFilter ? (
                  // #12 subtle, no-shame subtitle: when last it was served, or a
                  // calm "jamais encore" for one that's never been cooked.
                  <span className="recipe-card__sub recipe-card__seen mono">
                    <InlineIcon name="clock-bold" size={12} />{' '}
                    {(() => {
                      const d = daysSinceById.get(r.id)
                      return d == null ? t.recipes.neverSeen : t.recipes.seenAgo(d)
                    })()}
                  </span>
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
