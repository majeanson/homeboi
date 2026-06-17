import { useMemo } from 'react'
import { useT } from '../../i18n'
import { type Recipe, recipeImg, allTags } from '../../lib/recipes'
import { pictoFor } from '../../lib/picto'

// #11 "Recipe collections" — collections ARE the existing recipe tag system reused
// as a browse layer (NO new table, NO migration). This groups the book by tag into
// {tag, count, coverImage = the first tagged recipe's image}.
//
// This file is the PARENT picker (a card grid). The TODDLER lens has its own
// dedicated hear-first 3-stage flow in `KidCollections.tsx` (collection → recipe →
// day), which reuses `buildCollections` below — so there's no audience branch here.

export interface Collection {
  tag: string
  count: number
  coverImage: string | null
}

// Group the book by tag, first-seen order (allTags), cover = the first recipe in
// that tag that actually has an image (so a collection isn't a blank disc when its
// lead recipe has no photo). A recipe with several tags appears in each. Shared by
// the parent grid (here) and the toddler BigTiles flow (KidCollections).
export function buildCollections(recipes: Recipe[]): Collection[] {
  const tags = allTags(recipes)
  return tags.map((tag) => {
    const key = tag.toLowerCase()
    const inTag = recipes.filter((r) => (r.tags ?? []).some((tg) => tg.toLowerCase() === key))
    const withImg = inTag.find((r) => r.image)
    return { tag, count: inTag.length, coverImage: recipeImg((withImg ?? inTag[0])?.image) }
  })
}

export function CollectionPicker({
  recipes,
  onPick,
}: {
  recipes: Recipe[]
  onPick: (tag: string) => void
}) {
  const t = useT()
  const collections = useMemo(() => buildCollections(recipes), [recipes])

  if (collections.length === 0) {
    return <p className="board__empty mono">{t.recipes.collectionsEmpty}</p>
  }

  // Parent lens — card grid, reusing the recipe-card styling.
  return (
    <div className="recipe-grid">
      {collections.map((c) => (
        <button
          key={c.tag}
          type="button"
          className="recipe-card surface"
          onClick={() => onPick(c.tag)}
        >
          <span className="recipe-card__thumb" aria-hidden="true">
            {c.coverImage ? (
              <img src={c.coverImage} alt="" loading="lazy" />
            ) : (
              <span className="recipe-card__noimg">{pictoFor(c.tag, '🍽')}</span>
            )}
          </span>
          <span className="recipe-card__title">{c.tag}</span>
          <span className="recipe-card__sub mono">{t.recipes.collectionCount(c.count)}</span>
        </button>
      ))}
    </div>
  )
}
