import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { type Recipe, RECIPES_KEY, recipeImg } from '../lib/recipes'
import { scaleIngredients } from '../lib/scale'
import { ZoomableImg } from './ZoomableImg'
import { CookMode } from './CookMode'

// Read a recipe + act on it. Calm, low-chrome: the picture, ingredients, method,
// then a row of gentle actions —
//   · Add ingredients to the shared list (one call, source 'recipe')
//   · Plan a supper: reveals the week; tapping a day sets that supper's title
//     (groceries stay a separate, deliberate choice — no surprise list dump)
//   · Edit / Delete
// `week` is the Kitchen's 7-day window so planning lands on a real date.
export function RecipeSheet({
  recipe,
  week,
  onEdit,
  onClose,
}: {
  recipe: Recipe
  week: { date: number; label: string }[]
  onEdit: () => void
  onClose: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const [added, setAdded] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [plannedDate, setPlannedDate] = useState<number | null>(null)
  const [cooking, setCooking] = useState(false)
  const canCook = recipe.steps.length > 0 || recipe.ingredients.length > 0
  const imgSrc = recipeImg(recipe.image)

  // Servings scaler: `serv` is the target count the cook wants tonight; the
  // factor against the recipe's own servings rescales every ingredient line.
  // Only offered when the recipe states a base serving count to scale from.
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : null
  const [serv, setServ] = useState(baseServings ?? 0)
  const factor = baseServings ? serv / baseServings : 1
  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, factor),
    [recipe.ingredients, factor],
  )
  // The recipe handed to Cook mode and pushed to the list reflects the chosen
  // batch, so the cook reads (and shops for) the amounts they'll actually use.
  const effectiveRecipe = factor === 1 ? recipe : { ...recipe, ingredients: scaledIngredients, servings: serv }

  async function addToList() {
    if (added || !scaledIngredients.length) return
    setAdded(true)
    await api('recipe-to-list', { method: 'POST', body: { items: scaledIngredients } }).catch(() => setAdded(false))
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  async function planOn(date: number) {
    setPlannedDate(date)
    setPlanning(false)
    await api('meals', { method: 'POST', body: { date, title: recipe.title, staples: [] } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['meals'] })
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  async function del() {
    if (!confirm(t.recipes.deleteConfirm)) return
    await api('recipes', { method: 'DELETE', body: { id: recipe.id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: RECIPES_KEY })
    onClose()
  }

  return (
    <div className="recipe-modal" role="dialog" aria-modal="true" aria-label={recipe.title}>
      <div className="recipe-modal__scrim" onClick={onClose} aria-hidden="true" />
      <div className="recipe-modal__card surface">
        <div className="recipe-modal__bar">
          <h2>{recipe.title}</h2>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.common.back}>
            ✕
          </button>
        </div>

        <div className="recipe-modal__body">
          {imgSrc && <ZoomableImg className="recipe-view__img" src={imgSrc} alt={recipe.title} />}

          {recipe.source && (
            <p className="recipe-view__meta mono">
              {/^https?:\/\//i.test(recipe.source) ? (
                <a href={recipe.source} target="_blank" rel="noreferrer noopener">
                  {t.recipes.sourceLabel}
                </a>
              ) : (
                recipe.source
              )}
            </p>
          )}

          {recipe.tags?.length > 0 && (
            <div className="recipe-view__tags">
              {recipe.tags.map((tg) => (
                <span key={tg} className="chip recipe-view__tag">
                  {tg}
                </span>
              ))}
            </div>
          )}

          {recipe.ingredients.length > 0 && (
            <>
              <h3 className="recipe-sec-h">{t.recipes.ingredients}</h3>
              {baseServings && (
                <div className="recipe-scale" role="group" aria-label={t.recipes.servings}>
                  <button
                    type="button"
                    className="recipe-scale__btn"
                    aria-label={t.recipes.scaleLess}
                    onClick={() => setServ((s) => Math.max(1, s - 1))}
                    disabled={serv <= 1}
                  >
                    −
                  </button>
                  <span className="recipe-scale__val mono" aria-live="polite">
                    {t.recipes.servingsN(serv)}
                  </span>
                  <button
                    type="button"
                    className="recipe-scale__btn"
                    aria-label={t.recipes.scaleMore}
                    onClick={() => setServ((s) => s + 1)}
                  >
                    ＋
                  </button>
                  {factor !== 1 && (
                    <button
                      type="button"
                      className="recipe-scale__reset mono"
                      onClick={() => setServ(baseServings)}
                    >
                      {t.recipes.scaleReset}
                    </button>
                  )}
                </div>
              )}
              <ul className="recipe-view__ings">
                {scaledIngredients.map((ing, i) => (
                  <li key={i}>{ing}</li>
                ))}
              </ul>
            </>
          )}

          {recipe.steps.length > 0 && (
            <>
              <h3 className="recipe-sec-h">{t.recipes.steps}</h3>
              <ol className="recipe-view__steps">
                {recipe.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}

          {recipe.notes && <p className="recipe-view__notes">{recipe.notes}</p>}
        </div>

        {/* Plan-a-supper day picker, anchored right above the actions so tapping
            "Planifier un souper" reveals the days next to the button (not lost up
            in the scrolled recipe body). */}
        {planning && (
          <div className="recipe-plan-days">
            <span className="recipe-plan-days__label mono">{t.recipes.planPick}</span>
            <div className="recipe-plan-days__chips">
              {week.map((d) => (
                <button key={d.date} type="button" className="chip" onClick={() => planOn(d.date)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="recipe-modal__foot recipe-actions">
          {canCook && (
            <button type="button" className="btn btn--primary" onClick={() => setCooking(true)}>
              {t.recipes.cook}
            </button>
          )}
          {recipe.ingredients.length > 0 && (
            <button type="button" className="btn btn--ghost mono" onClick={addToList} disabled={added}>
              {added ? t.recipes.addedToList : t.recipes.addToList}
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => setPlanning((p) => !p)}
            disabled={plannedDate != null}
          >
            {plannedDate != null ? t.recipes.planned : t.recipes.plan}
          </button>
          <button type="button" className="btn btn--ghost mono" onClick={onEdit}>
            {t.recipes.editBtn}
          </button>
          <button type="button" className="btn btn--ghost mono recipe-del" onClick={del}>
            {t.recipes.delete}
          </button>
        </div>
      </div>

      {cooking && <CookMode recipe={effectiveRecipe} onClose={() => setCooking(false)} />}
    </div>
  )
}
