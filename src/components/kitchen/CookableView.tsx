import { useMemo } from 'react'
import { useT } from '../../i18n'
import { type Recipe, recipeImg } from '../../lib/recipes'
import { rankCookable } from '../../lib/cookable'
import { withoutHeadings } from '../../lib/recipeSections'
import { pictoFor } from '../../lib/picto'
import { InlineIcon } from '../Icon'

// #10 "Cook from what I have" — a DEDICATED, calm view that ranks the recipe book
// by what you can make from what's NOT running low, fewest-missing first. There is
// no pantry inventory by design (NFR-CALM / no stock counts): a staple counts as
// missing only when it matches a pantry-low item AND isn't already on the shopping
// list (see lib/cookable.ts rankCookable). The badge is a plain calm label
// ("Prêt" / "il manque N"), never a score. Reuses the recipe-card grid styling.
//
// When nothing is marked low there's nothing to rank against, so this shows a
// gentle empty state instead of "everything is ready" (which would be a lie — it
// just means we have no signal). The parent points people at the pantry's "running
// low" flag, which is what feeds this.
export function CookableView({
  recipes,
  lowItems,
  listItems,
  onView,
}: {
  recipes: Recipe[]
  lowItems: string[]
  listItems: string[]
  onView: (r: Recipe) => void
}) {
  const t = useT()
  const ranked = useMemo(() => rankCookable(recipes, lowItems, listItems), [recipes, lowItems, listItems])

  return (
    <section>
      <div className="kitchen__head">
        <h2>{t.recipes.cookableTitle}</h2>
      </div>
      {recipes.length === 0 ? (
        <p className="board__empty mono">{t.recipes.empty}</p>
      ) : lowItems.length === 0 ? (
        // Nothing flagged "running low" → no signal to rank against. Say so calmly
        // and point at the pantry flag that feeds this, instead of pretending
        // everything is ready.
        <div className="board__empty mono">
          <p>{t.recipes.cookableEmpty}</p>
          <p className="kitchen__cookable-hint">{t.recipes.cookableHint}</p>
        </div>
      ) : (
        <div className="recipe-grid">
          {ranked.map(({ recipe: r, missing }) => {
            const img = recipeImg(r.image)
            const nIngs = withoutHeadings(r.ingredients).length
            return (
              <button key={r.id} type="button" className="recipe-card surface" onClick={() => onView(r)}>
                <span className="recipe-card__thumb" aria-hidden="true">
                  {img ? <img src={img} alt="" loading="lazy" /> : <span className="recipe-card__noimg">{pictoFor(r.title, '🍳')}</span>}
                </span>
                <span className="recipe-card__title">{r.title}</span>
                {missing.length === 0 ? (
                  <span className="recipe-card__sub recipe-card__ready mono">
                    <InlineIcon name="check-bold" color="var(--sage-deep)" /> {t.recipes.ready}
                  </span>
                ) : (
                  <span className="recipe-card__sub recipe-card__missing mono">
                    {t.recipes.missingN(missing.length)}
                  </span>
                )}
                {nIngs > 0 && missing.length === 0 && (
                  <span className="recipe-card__sub mono">{t.recipes.count(nIngs)}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
