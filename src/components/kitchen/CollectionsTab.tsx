import { useState } from 'react'
import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { CollectionPicker } from './CollectionPicker'
import { RecipesTab } from './RecipesTab'
import { InlineIcon } from '../Icon'

// #11 "Recipe collections" (parent browser) — pick a collection (a tag) from the
// CollectionPicker, then drop into the normal RecipesTab scoped to that tag (via
// its optional `collectionTag` prop), so the cook/use-it-up/fast filters and the
// recipe cards all work exactly as they do in the full book — collections are just
// a browse layer over the existing tag system, not a separate screen. (The toddler
// equivalent is `KidCollections`, surfaced from KidKitchen — not this component.)
export function CollectionsTab({
  recipes,
  lowItems,
  soonItems,
  listItems,
  lastServed,
  onView,
}: {
  recipes: Recipe[]
  lowItems: string[]
  soonItems: string[]
  listItems: string[]
  lastServed: Map<string, number>
  onView: (r: Recipe) => void
}) {
  const t = useT()
  const [picked, setPicked] = useState<string | null>(null)

  if (picked == null) {
    return (
      <section>
        <div className="kitchen__head">
          <h2>{t.recipes.collectionsTitle}</h2>
        </div>
        <CollectionPicker recipes={recipes} onPick={setPicked} />
      </section>
    )
  }

  return (
    <section>
      <div className="kitchen__head kitchen__collection-head">
        <button type="button" className="btn btn--ghost mono" onClick={() => setPicked(null)}>
          <InlineIcon name="caret-left-bold" /> {t.recipes.collectionsBack}
        </button>
        <h2>{picked}</h2>
      </div>
      <RecipesTab
        recipes={recipes}
        lowItems={lowItems}
        soonItems={soonItems}
        listItems={listItems}
        lastServed={lastServed}
        collectionTag={picked}
        onView={onView}
      />
    </section>
  )
}
