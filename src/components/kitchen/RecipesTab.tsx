import { type ReactNode, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { HeartButton } from '../HeartButton'
import { useLoves } from '../../lib/loves'
import { type Recipe, type RecipeTagsData, RECIPE_TAGS_KEY, recipeImg, allTags, orderTags, tagOptions, recipeTotalMin, tagColor } from '../../lib/recipes'
import { type Pill, type BuiltinKey, DEFAULT_PILLS, isBuiltinPill, isSortKey, pillKey, matchesCustom } from '../../lib/recipePills'
import { wash, tintInk, edge } from '../../lib/colors'
import { rankCookable, rankUseSoon, rankNeglected } from '../../lib/cookable'
import { withoutHeadings } from '../../lib/recipeSections'
import { formatDuration } from '../../lib/duration'
import { pictoFor } from '../../lib/picto'
import { todayLocalDay } from '../../lib/localDay'
import { InlineIcon } from '../Icon'
import { EmptyState } from '../EmptyState'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

// The recipe book: search, tag chips, the configurable filter/sort PILLS, and the
// #11 collections browse layer — all flat in one view (no second-level sub-tabs).
// Owns all its filter state; the page hands in the data and the open callback.
//
// Pills are CONFIG-DRIVEN (Réglages ▸ Recettes → households.recipe_pills_json, read
// with the recipe-tags query). Built-ins: the stock-aware sorts ("Quoi cuisiner?",
// "À utiliser", "Oubliées"), the ≤30-min filter, "Favoris", "Récemment ajoutées";
// each can be hidden + reordered. Custom pills are operator-defined attribute
// filters (lib/recipePills.ts). SORTS are mutually exclusive (one orders the grid);
// FILTERS stack (AND). A pill whose data is absent (no low items, no favourites)
// simply doesn't show — config never forces a no-op chip.
//
// Collections (#11): an "Aa vs Collections" view toggle (`groupView`). "Aa" is a
// flat alphabetical list; "Collections" clusters the SAME filtered list into
// per-tag sections (untagged recipes fall under "Autres"), in the household's
// curated tag order. The toggle only re-arranges, never filters.
// `lastServed` (#12): recipe id → local-midnight day-seconds it was last cooked.
export function RecipesTab({
  recipes,
  lowItems,
  soonItems,
  listItems,
  lastServed,
  onView,
  help,
}: {
  recipes: Recipe[]
  lowItems: string[]
  soonItems: string[]
  listItems: string[]
  lastServed?: Map<string, number>
  onView: (r: Recipe) => void
  // Kitchen's page-level help mode — makes the "Recettes" heading and the
  // "Aa / Collections" toggle explainable in place while armed (lib/helpMode).
  help?: HelpMode
}) {
  const t = useT()
  const [recipeQuery, setRecipeQuery] = useState('')
  // #11 "Collections": flat alphabetical list ("Aa") vs grouped-by-collection.
  // A presentation toggle only — it never filters the set.
  const [groupView, setGroupView] = useState(false)
  // Active tag filters, as lowercase keys. Empty = "Toutes" (no constraint).
  // Multi-select with AND semantics: a recipe must carry EVERY selected tag.
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const toggleTag = (tg: string) => {
    const key = tg.toLowerCase()
    setTagFilter((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]))
  }
  // The active SORT pill (mutually exclusive — one orders the grid) and the set of
  // active FILTER pills (≤30 min / Favoris / custom — they stack, AND).
  const [sort, setSort] = useState<string | null>(null)
  const [filters, setFilters] = useState<Set<string>>(() => new Set())
  const { lovedSet: loved } = useLoves()

  const canFastFilter = useMemo(() => recipes.some((r) => recipeTotalMin(r) != null), [recipes])
  // Per-tag household colours + the curated pill ORDER + the recipe-tab pill config
  // (migrations 0037 / 0045). Optional binding: undefined until the read lands.
  const tagsData = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') }).data
  const tagColors = tagsData?.colors
  const pills = useMemo<Pill[]>(() => tagsData?.pills ?? DEFAULT_PILLS, [tagsData?.pills])
  // The household's curated tag order (presets, or the built-in starters until
  // customized). Reordering these pills in Réglages reorders the chips + the #11
  // collection sections, since both iterate `tags`.
  const tagOrder = useMemo(() => tagOptions(tagsData?.presets ?? [], [], t.recipes.tagPresets), [tagsData?.presets, t.recipes.tagPresets])
  const tags = useMemo(() => orderTags(allTags(recipes), tagOrder), [recipes, tagOrder])

  const shownRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase()
    return recipes.filter((r) => {
      if (q && !(r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.toLowerCase().includes(q)))) return false
      // Tag chips mean different things per view: in the flat "Aa" list they
      // AND-FILTER (a recipe must carry every selected tag); in "Collections" they
      // instead pick WHICH collection sections to show (handled in `groups`), so
      // here we don't narrow the set — every section shows its full membership.
      if (!groupView && tagFilter.length) {
        const rt = new Set((r.tags ?? []).map((tg) => tg.toLowerCase()))
        if (!tagFilter.every((k) => rt.has(k))) return false
      }
      // Every active FILTER pill is an AND. Sorts (cookable/useSoon/neglected/
      // recent) order the grid elsewhere and never filter here.
      for (const p of pills) {
        if (p.off || !filters.has(pillKey(p))) continue
        if (isBuiltinPill(p)) {
          if (p.k === 'fast') {
            if (!canFastFilter) continue
            const tm = recipeTotalMin(r)
            if (!tm || tm > 30) return false
          } else if (p.k === 'favorites') {
            if (!loved.has(r.id)) return false
          }
        } else if (!matchesCustom(r, p, loved)) {
          return false
        }
      }
      return true
    })
  }, [recipes, recipeQuery, tagFilter, groupView, pills, filters, canFastFilter, loved])
  // Cookability: which staple each recipe is missing (out of stock + not on the
  // list), fewest first. The pill only surfaces when there's a low item to rank
  // against, so it never appears as a no-op.
  const ranked = useMemo(() => rankCookable(shownRecipes, lowItems, listItems), [shownRecipes, lowItems, listItems])
  const missingById = useMemo(() => new Map(ranked.map((r) => [r.recipe.id, r.missing])), [ranked])
  const canCookFilter = lowItems.length > 0 && recipes.length > 0
  // "Use it up" ranking: which use-soon items each recipe would finish, most first.
  const rankedSoon = useMemo(() => rankUseSoon(shownRecipes, soonItems), [shownRecipes, soonItems])
  const usesById = useMemo(() => new Map(rankedSoon.map((r) => [r.recipe.id, r.uses])), [rankedSoon])
  const canUseSoonFilter = soonItems.length > 0 && recipes.length > 0
  // #12 "Oubliées": longest-since-served first. Offered only once we have ANY
  // serving history to order by AND more than one recipe. daysSince null = never.
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
  // Default order is alphabetical ("Aa"); an active sort pill overrides it.
  const alphaOrder = useMemo(
    () => [...shownRecipes].sort((a, b) => a.title.localeCompare(b.title)),
    [shownRecipes],
  )
  // "Récemment ajoutées": newest first (by updatedAt — an import/edit bumps it).
  const recentOrder = useMemo(() => [...shownRecipes].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)), [shownRecipes])
  // Resolve the chosen sort to one whose pill is shown + enabled; else no sort.
  const activeSort = useMemo(() => {
    if (!sort) return null
    const p = pills.find((x) => isBuiltinPill(x) && x.k === sort)
    if (!p || p.off) return null
    const ok =
      sort === 'cookable'
        ? canCookFilter
        : sort === 'useSoon'
          ? canUseSoonFilter
          : sort === 'neglected'
            ? canNeglectFilter
            : sort === 'recent'
              ? recipes.length > 1
              : false
    return ok ? sort : null
  }, [sort, pills, canCookFilter, canUseSoonFilter, canNeglectFilter, recipes.length])
  const recipeOrder =
    activeSort === 'useSoon'
      ? rankedSoon.map((r) => r.recipe)
      : activeSort === 'cookable'
        ? ranked.map((r) => r.recipe)
        : activeSort === 'neglected'
          ? rankedNeglect.map((r) => r.recipe)
          : activeSort === 'recent'
            ? recentOrder
            : alphaOrder
  // "Collections" view: cluster the SAME ordered/filtered list into per-tag
  // sections (a recipe with several tags appears in each), untagged ones under
  // "Autres". Null unless grouping is on AND there are tags to group by.
  const groups = useMemo(() => {
    if (!groupView || tags.length === 0) return null
    // Selected tag chips pick which collection sections to show (a UNION of those
    // collections). No selection = every collection, in curated order. Untagged
    // "Autres" only joins when nothing's selected (it isn't a collection you'd pick).
    const visibleTags = tagFilter.length ? tags.filter((tag) => tagFilter.includes(tag.toLowerCase())) : tags
    const byTag = visibleTags
      .map((tag) => {
        const key = tag.toLowerCase()
        return { tag, items: recipeOrder.filter((r) => (r.tags ?? []).some((tg) => tg.toLowerCase() === key)) }
      })
      .filter((g) => g.items.length > 0)
    const untagged = tagFilter.length ? [] : recipeOrder.filter((r) => !(r.tags ?? []).length)
    return { byTag, untagged }
  }, [groupView, tags, recipeOrder, tagFilter])

  // One recipe card — shared by the flat grid and the grouped sections. The ❤
  // favorite (#21) is a sibling overlay of the card button, never nested in it.
  // The subtitle reflects the active SORT (ready/missing, uses, last-seen).
  const renderCard = (r: Recipe) => {
    const img = recipeImg(r.image)
    const missing = missingById.get(r.id) ?? []
    const uses = usesById.get(r.id) ?? []
    const nIngs = withoutHeadings(r.ingredients).length
    const totalMin = recipeTotalMin(r)
    return (
      <div key={r.id} className="recipe-card-wrap">
        <button type="button" className="recipe-card surface" onClick={() => onView(r)}>
          <span className="recipe-card__thumb" aria-hidden="true">
            {img ? <img src={img} alt="" loading="lazy" /> : <span className="recipe-card__noimg">{pictoFor(r.title, '🍳')}</span>}
          </span>
          <span className="recipe-card__title">{r.title}</span>
          {activeSort === 'useSoon' ? (
            uses.length > 0 ? (
              <span className="recipe-card__sub recipe-card__uses mono">
                <InlineIcon name="recycle-bold" size={12} /> {t.recipes.usesN(uses.length)}
              </span>
            ) : (
              nIngs > 0 && <span className="recipe-card__sub mono">{t.recipes.count(nIngs)}</span>
            )
          ) : activeSort === 'cookable' ? (
            missing.length === 0 ? (
              <span className="recipe-card__sub recipe-card__ready mono">
                <InlineIcon name="check-bold" color="var(--sage-deep)" /> {t.recipes.ready}
              </span>
            ) : (
              <span className="recipe-card__sub recipe-card__missing mono">{t.recipes.missingN(missing.length)}</span>
            )
          ) : activeSort === 'neglected' ? (
            // #12 subtle, no-shame subtitle: when last it was served, or a calm
            // "jamais encore" for one that's never been cooked.
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
            <span className="recipe-card__time mono">
              <InlineIcon name="timer-bold" size={12} /> {formatDuration(totalMin * 60)}
            </span>
          )}
        </button>
        <HeartButton recipeId={r.id} />
      </div>
    )
  }

  // Built-in pill label + icon — all from the shared Phosphor set (no emoji).
  const BUILTIN_UI: Record<BuiltinKey, { label: string; icon: ReactNode }> = {
    cookable: { label: t.recipes.cookable, icon: <InlineIcon name="cooking-pot-bold" /> },
    useSoon: { label: t.recipes.useItUp, icon: <InlineIcon name="recycle-bold" /> },
    fast: { label: t.recipes.fast30, icon: <InlineIcon name="timer-bold" /> },
    neglected: { label: t.recipes.neglected, icon: <InlineIcon name="clock-bold" /> },
    favorites: { label: t.recipes.favorites, icon: <InlineIcon name="heart-bold" /> },
    recent: { label: t.recipes.recentlyAdded, icon: <InlineIcon name="sparkle-bold" /> },
  }
  // A pill shows when enabled AND its data makes it meaningful (no low items → no
  // "Quoi cuisiner?", no favourites → no "Favoris", etc.). Customs show with rules.
  const pillShown = (p: Pill): boolean => {
    if (p.off) return false
    if (isBuiltinPill(p)) {
      switch (p.k) {
        case 'cookable':
          return canCookFilter
        case 'useSoon':
          return canUseSoonFilter
        case 'fast':
          return canFastFilter
        case 'neglected':
          return canNeglectFilter
        case 'favorites':
          return loved.size > 0
        case 'recent':
          return recipes.length > 1
      }
    }
    return recipes.length > 0 && p.rules.length > 0
  }
  const shownPills = pills.filter(pillShown)
  const pillOn = (p: Pill): boolean => (isBuiltinPill(p) && isSortKey(p.k) ? activeSort === p.k : filters.has(pillKey(p)))
  const togglePill = (p: Pill) => {
    if (isBuiltinPill(p) && isSortKey(p.k)) {
      setSort((s) => (s === p.k ? null : p.k))
    } else {
      const k = pillKey(p)
      setFilters((f) => {
        const n = new Set(f)
        if (n.has(k)) n.delete(k)
        else n.add(k)
        return n
      })
    }
  }
  const clearAll = () => {
    setRecipeQuery('')
    setTagFilter([])
    setSort(null)
    setFilters(new Set())
  }

  return (
    <section>
      <div className="kitchen__head">
        <HelpTitle help={help} k="recipesBook">{t.recipes.title}</HelpTitle>
      </div>
      {help?.bubbleFor('recipesBook')}
      {/* Search on its own line, good width, with the #11 "Aa vs Collections"
          view toggle beside it. The filter/sort PILLS get their own wrapping
          row below so they agglomerate cleanly like the custom pills. */}
      {(recipes.length > 3 || (recipes.length > 0 && tags.length > 0)) && (
        <div className="kitchen__recipe-searchbar">
          {recipes.length > 3 && (
            <input
              className="input kitchen__recipe-search"
              value={recipeQuery}
              onChange={(e) => setRecipeQuery(e.target.value)}
              placeholder={t.recipes.search}
              aria-label={t.recipes.search}
            />
          )}
          {recipes.length > 0 && tags.length > 0 && (
            <div className="recipe-view-toggle">
              <div className="subtabs subtabs--mini" role="tablist" aria-label={t.recipes.arrange}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!groupView}
                  className={'subtabs__opt' + (!groupView ? ' is-on' : '')}
                  onClick={help ? help.pick('collections', () => setGroupView(false)) : () => setGroupView(false)}
                >
                  Aa
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupView}
                  className={'subtabs__opt' + (groupView ? ' is-on' : '')}
                  onClick={help ? help.pick('collections', () => setGroupView(true)) : () => setGroupView(true)}
                >
                  {t.recipes.collectionsTitle}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {help?.bubbleFor('collections')}
      {shownPills.length > 0 && (
        <div className="kitchen__recipe-tools">
          {shownPills.map((p) => {
            const on = pillOn(p)
            if (isBuiltinPill(p)) {
              const ui = BUILTIN_UI[p.k]
              return (
                <button
                  key={pillKey(p)}
                  type="button"
                  className={`chip kitchen__pill${on ? ' is-on' : ''}`}
                  onClick={() => togglePill(p)}
                  aria-pressed={on}
                >
                  {ui.icon} {ui.label}
                </button>
              )
            }
            // Custom pill — tinted by its colour (wash when off, solid when on),
            // matching how the tag chips read.
            const hex = p.color
            const style = hex
              ? on
                ? { background: tintInk(hex), color: '#fffcf5', borderColor: tintInk(hex) }
                : { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) }
              : undefined
            return (
              <button
                key={pillKey(p)}
                type="button"
                className={`chip kitchen__pill${on ? ' is-on' : ''}`}
                style={style}
                onClick={() => togglePill(p)}
                aria-pressed={on}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      )}
      {tags.length > 0 && (
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
        <EmptyState>{t.recipes.empty}</EmptyState>
      ) : (
        <>
          {/* #11 "Aa vs Collections" view toggle now lives up beside the search;
              re-arranges only — pills/tags still filter. */}
          {/* In Collections, the tag chips above pick which sections to show (a
              union), not narrow the recipes — say so once so the change is clear. */}
          {groupView && tags.length > 0 && (
            <p className="mono recipe-collections-hint">{t.recipes.collectionsPickHint}</p>
          )}
          {recipeOrder.length === 0 ? (
            // The book has recipes — the FILTERS hid them all. Say so (instead of
            // the misleading "no recipes yet") and offer the one-tap way back.
            <div className="board__empty mono">
              <p>{t.recipes.noMatch}</p>
              <button type="button" className="btn btn--ghost mono" onClick={clearAll}>
                {t.recipes.clearFilters}
              </button>
            </div>
          ) : groups && groups.byTag.length === 0 && groups.untagged.length === 0 ? (
            // Collections view with a selection that no recipe matches (e.g. a sort
            // pill filtered them out) — same calm "nothing here, clear it" exit.
            <div className="board__empty mono">
              <p>{t.recipes.noMatch}</p>
              <button type="button" className="btn btn--ghost mono" onClick={clearAll}>
                {t.recipes.clearFilters}
              </button>
            </div>
          ) : groups ? (
            // "Collections" view — one section per tag, untagged under "Autres".
            <>
              {groups.byTag.map((g) => (
                <div key={g.tag} className="recipe-group">
                  <h3 className="recipe-group__head mono">
                    {g.tag} <span className="recipe-group__count">{t.recipes.collectionCount(g.items.length)}</span>
                  </h3>
                  <div className="recipe-grid">{g.items.map(renderCard)}</div>
                </div>
              ))}
              {groups.untagged.length > 0 && (
                <div className="recipe-group">
                  <h3 className="recipe-group__head mono">
                    {t.recipes.ungrouped} <span className="recipe-group__count">{t.recipes.collectionCount(groups.untagged.length)}</span>
                  </h3>
                  <div className="recipe-grid">{groups.untagged.map(renderCard)}</div>
                </div>
              )}
            </>
          ) : (
            <div className="recipe-grid">{recipeOrder.map(renderCard)}</div>
          )}
        </>
      )}
    </section>
  )
}
