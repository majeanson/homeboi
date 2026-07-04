import { useT } from '../../i18n'
import { imgUrl } from '../../lib/image'
import { recipeImg, recipeTotalMin } from '../../lib/recipes'
import { Chip } from '../Chip'
import { ZoomableImg } from '../ZoomableImg'
import type { RecipeSharePayload } from '../../lib/share'

// Read-only recipe render for the PUBLIC /partage page — no loves/plan/list queries (a
// signed-out visitor would 401-spam), just the picture, ingredients, and method. Inline
// '## Section' rows render as headings (the flat-array section convention); step photos
// resolve through /api/img by their share-owned key.
export function SharedRecipeView({ payload }: { payload: RecipeSharePayload }) {
  const t = useT()
  const total = recipeTotalMin(payload)
  const photo = recipeImg(payload.image)
  const servings =
    payload.servings != null
      ? payload.servingsUnit
        ? `${payload.servings} ${payload.servingsUnit}`
        : t.recipes.servingsN(payload.servings)
      : null
  const meta = [servings, total ? `${total} min` : null].filter(Boolean).join(' · ')

  return (
    <article className="shared-recipe">
      {photo && (
        <div className="shared-recipe__photo">
          <ZoomableImg src={photo} alt={payload.title} />
        </div>
      )}
      <h1 className="shared-recipe__title">{payload.title}</h1>
      {meta && <p className="shared-recipe__meta mono">{meta}</p>}
      {payload.tags.length > 0 && (
        <div className="shared-recipe__tags">
          {payload.tags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      )}

      <section className="shared-recipe__sec">
        <h2 className="shared-recipe__h2">{t.shareLink.ingredients}</h2>
        <ul className="shared-recipe__list">
          {payload.ingredients.map((line, i) =>
            line.startsWith('## ') ? (
              <li key={i} className="shared-recipe__group">
                {line.slice(3)}
              </li>
            ) : (
              <li key={i}>{line}</li>
            ),
          )}
        </ul>
      </section>

      <section className="shared-recipe__sec">
        <h2 className="shared-recipe__h2">{t.shareLink.steps}</h2>
        <div className="shared-recipe__steps">
          {(() => {
            let n = 0 // manual numbering so a '## Section' row doesn't consume a step number
            return payload.steps.map((line, i) => {
              if (line.startsWith('## '))
                return (
                  <p key={i} className="shared-recipe__group">
                    {line.slice(3)}
                  </p>
                )
              n += 1
              const stepPhoto = payload.stepImages[i]
              return (
                <div key={i} className="shared-recipe__step">
                  <span className="shared-recipe__stepnum mono">{n}</span>
                  <div className="shared-recipe__stepbody">
                    <p>{line}</p>
                    {stepPhoto ? <ZoomableImg src={imgUrl(stepPhoto)} alt="" className="shared-recipe__stepphoto" /> : null}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </section>

      {payload.notes && (
        <section className="shared-recipe__sec">
          <h2 className="shared-recipe__h2">{t.shareLink.notes}</h2>
          <p className="shared-recipe__notes">{payload.notes}</p>
        </section>
      )}
    </article>
  )
}
