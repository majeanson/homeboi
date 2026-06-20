import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import {
  type Recipe,
  type RecipeTagsData,
  RECIPE_TAGS_KEY,
  recipeImg,
  allTags,
  orderTags,
  tagOptions,
} from '../../lib/recipes'
import { groupSections } from '../../lib/recipeSections'
import { pictoFor } from '../../lib/picto'
import { SceneHead } from '../SceneHead'
import { Chip } from '../Chip'
import { Icon } from '../Icon'

// #45 — the printable toddler recipe/activity book. A parent makes a cheerful,
// picture-first booklet of the household's recipes — a cover, then one page per
// recipe with big step photos, numbered bubbles, and tick-boxes a little one can
// check off while cooking with a grown-up. It REUSES the recipe data + collection
// (tag) layer wholesale (no migration, no endpoint): the screen toolbar narrows
// which collection to include, then `window.print()` hands the rest to the
// browser's print-to-PDF. The .book__pages markup carries `@media print` styling
// (styles/book.css) so the booklet drops the app chrome and paginates one recipe
// per sheet.
//
// Mirrors KidCollections' spirit (picture-first, pictoFor fallbacks, the household
// tag order) but as a STATIC printable rather than an interactive picker.

// A soft cut-paper palette, cycled per recipe page so the booklet reads as a
// cheerful set of cards (same idea as BigTiles' TILE_TINTS) — deterministic, so a
// recipe is always the same colour (decoration, never a reward; NFR-CALM-2).
const PAGE_TINTS = ['#E0724E', '#7BB0C9', '#B06A93', '#88A36F', '#F2A03D', '#5E8AA8']

export function RecipeBook({ recipes, onClose }: { recipes: Recipe[]; onClose: () => void }) {
  const t = useT()
  // Follow the household's curated tag order (same as the parent book + #11).
  const tagsData = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') }).data
  const tagOrder = useMemo(() => tagOptions(tagsData?.presets ?? [], [], t.recipes.tagPresets), [tagsData?.presets, t.recipes.tagPresets])
  const tags = useMemo(() => orderTags(allTags(recipes), tagOrder), [recipes, tagOrder])

  // Which collection to print (null = the whole book). Photos on by default —
  // a toddler reads by picture — but toggleable to save ink for a B&W print.
  const [tag, setTag] = useState<string | null>(null)
  const [photos, setPhotos] = useState(true)

  const shown = useMemo(() => {
    const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title))
    if (!tag) return sorted
    const key = tag.toLowerCase()
    return sorted.filter((r) => (r.tags ?? []).some((tg) => tg.toLowerCase() === key))
  }, [recipes, tag])

  return (
    <div className="scene book" aria-label={t.recipes.bookTitle}>
      <SceneHead title={t.recipes.bookTitle} icon="book-open-bold" card="recipes" onClose={onClose} />

      {/* Screen-only toolbar: pick a collection, toggle photos, print. Hidden in
          the printed booklet (@media print) — the pages are all that go to paper. */}
      <div className="book__controls">
        <p className="book__hint mono">{t.recipes.bookHint}</p>
        {tags.length > 0 && (
          <div className="book__chips">
            <Chip selected={tag === null} onClick={() => setTag(null)}>
              {t.recipes.bookAll}
            </Chip>
            {tags.map((tg) => (
              <Chip key={tg} selected={tag?.toLowerCase() === tg.toLowerCase()} onClick={() => setTag(tg)}>
                {tg}
              </Chip>
            ))}
          </div>
        )}
        <div className="book__actions">
          <Chip selected={photos} onClick={() => setPhotos((v) => !v)}>
            <Icon name={photos ? 'check-bold' : 'image-square-bold'} size={14} /> {t.recipes.bookPhotos}
          </Chip>
          <button
            type="button"
            className="btn btn--primary book__print"
            onClick={() => window.print()}
            disabled={shown.length === 0}
          >
            <Icon name="file-text-bold" size={18} /> {t.recipes.bookPrint}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="book__empty mono">{t.recipes.bookEmpty}</div>
      ) : (
        <div className="book__pages">
          {/* Cover — a cheerful, all-pictures front page; the owner line is a blank
              for a grown-up to write the child's name (or the child to scribble). */}
          <section className="book-cover">
            <div className="book-cover__art" aria-hidden="true">
              🍎 🥕 🧁 🍪 🥣
            </div>
            <h1 className="book-cover__title">{t.recipes.bookTitle}</h1>
            <p className="book-cover__sub">{tag ?? t.recipes.bookSubtitle}</p>
            <p className="book-cover__owner">
              {t.recipes.bookOwner} <span className="book-cover__line" />
            </p>
            <p className="book-cover__count mono">{t.recipes.bookCount(shown.length)}</p>
          </section>

          {shown.map((r, ri) => (
            <RecipePage key={r.id} recipe={r} tint={PAGE_TINTS[ri % PAGE_TINTS.length]} photos={photos} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

// One recipe = one printable page. Big sticker photo, tick-box ingredients, and
// numbered step bubbles with their step photo — sized for a pre-reader following
// along with a grown-up. Step numbers run continuously across `## ` sections.
function RecipePage({
  recipe,
  tint,
  photos,
  t,
}: {
  recipe: Recipe
  tint: string
  photos: boolean
  t: ReturnType<typeof useT>
}) {
  const img = recipeImg(recipe.image)
  const ingredientGroups = groupSections(recipe.ingredients ?? [])
  const stepGroups = groupSections(recipe.steps ?? [])
  const serves = recipe.servings && recipe.servings > 0 ? recipe.servings : null
  // A continuous step counter across every section, so a multi-part recipe still
  // numbers 1, 2, 3… for a child counting along.
  let stepNo = 0
  return (
    <article className="book-page" style={{ ['--page-tint' as string]: tint }}>
      <header className="book-page__head">
        <span className="book-page__sticker" aria-hidden="true">
          {img ? <img src={img} alt="" /> : <span className="book-page__picto">{pictoFor(recipe.title, '🍳')}</span>}
        </span>
        <div className="book-page__titles">
          <h2 className="book-page__title">{recipe.title}</h2>
          {serves && <p className="book-page__serves mono">🍽 {t.recipes.bookServes(serves)}</p>}
        </div>
      </header>

      <section className="book-need">
        <h3 className="book-page__section">🧺 {t.recipes.bookNeed}</h3>
        {ingredientGroups.map((g, gi) => (
          <div key={gi} className="book-need__group">
            {g.title && <h4 className="book-page__sub">{g.title}</h4>}
            <ul className="book-checklist">
              {g.items.map((it) => (
                <li key={it.idx} className="book-checkitem">
                  <span className="book-check" aria-hidden="true" />
                  <span className="book-checkitem__text">{it.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="book-steps">
        <h3 className="book-page__section">👩‍🍳 {t.recipes.bookCook}</h3>
        {stepGroups.map((g, gi) => (
          <div key={gi} className="book-steps__group">
            {g.title && <h4 className="book-page__sub">{g.title}</h4>}
            <ol className="book-steplist">
              {g.items.map((it) => {
                stepNo += 1
                const stepImg = photos ? recipe.stepImages?.[it.idx] : undefined
                return (
                  <li key={it.idx} className="book-step">
                    <span className="book-step__num" aria-hidden="true">
                      {stepNo}
                    </span>
                    {stepImg && (
                      <span className="book-step__photo" aria-hidden="true">
                        <img src={recipeImg(stepImg) ?? ''} alt="" />
                      </span>
                    )}
                    <span className="book-step__text">{it.text}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </section>

      <footer className="book-page__foot" aria-hidden="true">
        <span className="book-page__stars">⭐ ⭐ ⭐</span>
        <span className="book-page__bravo">{t.recipes.bookBravo}</span>
      </footer>
    </article>
  )
}
