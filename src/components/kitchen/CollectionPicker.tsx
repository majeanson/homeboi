import { type Recipe, recipeImg, allTags } from '../../lib/recipes'

// #11 "Recipe collections" — collections ARE the existing recipe tag system reused
// as a browse layer (NO new table, NO migration). `buildCollections` groups the
// book by tag into {tag, count, coverImage = the first tagged recipe's image}.
//
// The PARENT recipe book renders collections inline as an "Aa vs Collections" view
// toggle (RecipesTab) — no separate picker component. This helper is shared with
// the TODDLER hear-first flow (KidCollections / KidKitchen), which still groups by
// tag into BigTiles.

export interface Collection {
  tag: string
  count: number
  coverImage: string | null
}

// Group the book by tag, first-seen order (allTags); cover = the first recipe in
// that tag that actually has an image (so a collection isn't a blank disc when its
// lead recipe has no photo). A recipe with several tags appears in each.
export function buildCollections(recipes: Recipe[]): Collection[] {
  const tags = allTags(recipes)
  return tags.map((tag) => {
    const key = tag.toLowerCase()
    const inTag = recipes.filter((r) => (r.tags ?? []).some((tg) => tg.toLowerCase() === key))
    const withImg = inTag.find((r) => r.image)
    return { tag, count: inTag.length, coverImage: recipeImg((withImg ?? inTag[0])?.image) }
  })
}
