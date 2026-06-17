import { useMemo } from 'react'
import { useT } from '../../i18n'
import { useAudience } from '../../lib/audience'
import { type Recipe, recipeImg, allTags } from '../../lib/recipes'
import { pictoFor } from '../../lib/picto'
import { BigTiles, type Tile } from '../BigTiles'

// #11 "Recipe collections" — collections ARE the existing recipe tag system reused
// as a browse layer (NO new table, NO migration). This groups the book by tag into
// {tag, count, coverImage = the first tagged recipe's image} and renders the picker
// two ways off the same data, like every themed tab (audience axis):
//   • parent  → a card grid (image-forward, count subtitle).
//   • toddler → BigTiles (huge, picture-first, tap-to-hear) — a pre-reader browses
//                "soupes / desserts" by sight + sound.
//
// SCAFFOLD STATUS: the parent grid is DONE. The toddler branch is a deliberate
// minimal stub (tiles render + speak, tapping a tile picks the collection) — the
// fuller 3-stage toddler picker (collection → recipe → day, all hear-first) is
// left as a TODO so it isn't half-polished.

export interface Collection {
  tag: string
  count: number
  coverImage: string | null
}

// Group the book by tag, first-seen order (allTags), cover = the first recipe in
// that tag that actually has an image (so a collection isn't a blank disc when its
// lead recipe has no photo). A recipe with several tags appears in each.
function buildCollections(recipes: Recipe[]): Collection[] {
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
  const { audience } = useAudience()
  const collections = useMemo(() => buildCollections(recipes), [recipes])

  if (collections.length === 0) {
    return <p className="board__empty mono">{t.recipes.collectionsEmpty}</p>
  }

  // Toddler lens — picture-first BigTiles, read-aloud on tap. STUB: one tap picks
  // the collection (BigTiles speaks the label, the parent flow takes over). A
  // pre-reader can browse by sight + sound; the full hear-first 3-stage picker
  // (collection → recipe → day) is deferred.
  // TODO #11 toddler flow: arm-then-commit picker through to a day, like KidKitchen.
  if (audience === 'toddler') {
    const tiles: Tile[] = collections.map((c) => ({
      key: c.tag,
      image: c.coverImage,
      icon: pictoFor(c.tag, '🍽'),
      label: c.tag,
      onTap: () => onPick(c.tag),
      confirmHint: t.recipes.collectionTapToOpen,
    }))
    return <BigTiles tiles={tiles} empty={t.recipes.collectionsEmpty} />
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
