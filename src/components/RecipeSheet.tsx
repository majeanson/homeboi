import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { type Recipe, RECIPES_KEY, recipeImg } from '../lib/recipes'
import { scaleIngredients } from '../lib/scale'
import { ingredientsForStep, stepSentences } from '../lib/recipeSteps'
import { ZoomableImg } from './ZoomableImg'
import { CookMode } from './CookMode'
import { IngredientLine } from './IngredientLine'

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

  // Batch scaler: `factor` is the source of truth (1 = the recipe as written).
  // Quick presets (×½ ×1 ×2 ×3) set it directly and work even with no stated
  // servings; when the recipe DOES state servings, a +/- stepper nudges it and
  // the shown serving count is derived from the factor.
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : null
  const [factor, setFactor] = useState(1)
  const serv = baseServings ? Math.max(1, Math.round(baseServings * factor)) : 0
  const MULTS: [string, number][] = [['½', 0.5], ['1', 1], ['2', 2], ['3', 3]]
  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, factor),
    [recipe.ingredients, factor],
  )
  // The recipe handed to Cook mode and pushed to the list reflects the chosen
  // batch, so the cook reads (and shops for) the amounts they'll actually use.
  const effectiveRecipe =
    factor === 1
      ? recipe
      : { ...recipe, ingredients: scaledIngredients, servings: baseServings ? serv : recipe.servings }

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
              <div className="recipe-scale-row">
                {baseServings && (
                  <div className="recipe-scale" role="group" aria-label={t.recipes.servings}>
                    <button
                      type="button"
                      className="recipe-scale__btn"
                      aria-label={t.recipes.scaleLess}
                      onClick={() => setFactor(Math.max(1, serv - 1) / baseServings)}
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
                      onClick={() => setFactor((serv + 1) / baseServings)}
                    >
                      ＋
                    </button>
                  </div>
                )}
                {/* Quick batch presets — work with or without a stated serving
                    count. ×1 returns to the recipe as written. */}
                <div className="recipe-mult" role="group" aria-label={t.recipes.batch}>
                  {MULTS.map(([lbl, m]) => (
                    <button
                      key={m}
                      type="button"
                      className={'recipe-mult__btn mono' + (factor === m ? ' is-active' : '')}
                      aria-pressed={factor === m}
                      onClick={() => setFactor(m)}
                    >
                      ×{lbl}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="recipe-view__ings">
                {scaledIngredients.map((ing, i) => (
                  <li key={i}>
                    <IngredientLine line={ing} size="sm" />
                  </li>
                ))}
              </ul>
            </>
          )}

          {recipe.steps.length > 0 && (
            <>
              <h3 className="recipe-sec-h">{t.recipes.steps}</h3>
              <ol className="recipe-view__steps">
                {recipe.steps.map((s, i) => {
                  // Each step: its instruction as sentence bullets, then the
                  // ingredients (with scaled quantities) that step uses.
                  const used = ingredientsForStep(s, scaledIngredients)
                  return (
                    <li key={i}>
                      <ul className="recipe-step__sentences">
                        {stepSentences(s).map((sen, j) => (
                          <li key={j}>{sen}</li>
                        ))}
                      </ul>
                      {used.length > 0 && (
                        <ul className="recipe-step__ings mono">
                          {used.map((ing, j) => (
                            <li key={j}>
                              <IngredientLine line={ing} size="sm" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
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
