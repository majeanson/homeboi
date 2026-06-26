import { Fragment, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useWrite } from '../lib/write'
import { BOARD_KEY } from '../lib/queryKeys'
import { type Recipe, type RecipeTagsData, RECIPES_KEY, RECIPE_TAGS_KEY, recipeImg, tagColor } from '../lib/recipes'
import { isGuest } from '../lib/device'
import { wash, tintInk, edge } from '../lib/colors'
import { formatDuration } from '../lib/duration'
import { scaleIngredients } from '../lib/scale'
import { ingredientsForStep, stepSentences, stripStepOrdinal } from '../lib/recipeSteps'
import { groupSections, withoutHeadings } from '../lib/recipeSections'
import { ingredientName } from '../lib/ingredient'
import { type MealSlot } from '../lib/mealSlots'
import { ZoomableImg } from './ZoomableImg'
import { Icon, InlineIcon } from './Icon'
import { Chip } from './Chip'
import { IngredientLine } from './IngredientLine'
import { MealPlanPicker } from './kitchen/MealPlanPicker'
import { useModal } from '../lib/useModal'
import { useConfirm } from '../lib/confirm'
import { shareRecipe } from '../lib/shareRecipe'

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
  onCook,
  onEdit,
  onClose,
}: {
  recipe: Recipe
  week: { date: number; label: string }[]
  // Cook mode is its own route now; the sheet hands up the chosen batch factor so
  // the cook screen scales to the same amounts shown here.
  onCook: (factor: number) => void
  onEdit: () => void
  onClose: () => void
}) {
  const t = useT()
  const confirm = useConfirm()
  const write = useWrite()
  // Read-only guest: the recipe stays fully readable + cookable (reads), but the
  // write actions — add-to-list, plan-a-supper, edit, delete — are hidden.
  const ro = isGuest()
  const modalRef = useRef<HTMLDivElement>(null)
  useModal(modalRef, onClose)
  const [added, setAdded] = useState(false)
  // "Add to list" opens a checklist (you rarely need EVERY ingredient — most are
  // staples you already have). null = closed; each row is a buyable name you tick
  // to add. Starts all-unticked, so it's "pick the few I'm missing", not "untick
  // the many I have".
  const [listPrompt, setListPrompt] = useState<{ item: string; on: boolean }[] | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planSlot, setPlanSlot] = useState<MealSlot>('supper')
  const [plannedDate, setPlannedDate] = useState<number | null>(null)
  const canCook = recipe.steps.length > 0 || recipe.ingredients.length > 0
  const imgSrc = recipeImg(recipe.image)
  // Per-tag household colours (migration 0037) — the same source the form and
  // search read, so a tag's colour is consistent everywhere it shows.
  const tagColors = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') }).data?.colors

  // "Original" flips the body into the recipe with nothing we added — no
  // scaling, no measure pills, no per-step ingredients, no sentence bullets.
  // An imported recipe shows its as-imported snapshot; a hand-typed one shows
  // the card as written. Plain title, plain list, plain numbered steps.
  const [showOriginal, setShowOriginal] = useState(false)
  const orig = recipe.original ?? null
  const origView = {
    title: orig?.title || recipe.title,
    ingredients: orig?.ingredients?.length ? orig.ingredients : recipe.ingredients,
    steps: orig?.steps?.length ? orig.steps : recipe.steps,
    servings: orig ? (orig.servings ?? null) : recipe.servings,
    source: (orig ? orig.source : null) ?? recipe.source,
  }

  // Batch scaler: `factor` is the source of truth (1 = the recipe as written).
  // Quick presets (×½ ×1 ×2 ×3) set it directly and work even with no stated
  // servings; when the recipe DOES state servings, a +/- stepper nudges it and
  // the shown serving count is derived from the factor.
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : null
  const [factor, setFactor] = useState(1)
  const serv = baseServings ? Math.max(1, Math.round(baseServings * factor)) : 0
  // "24 biscuits" when the recipe yields a named thing, else "4 portions".
  const servLabel = (n: number) => (recipe.servingsUnit ? `${n} ${recipe.servingsUnit}` : t.recipes.servingsN(n))
  // Prep/cook/total pills under the meta line — real fields since 0027.
  const timeParts = (
    [
      [t.recipes.timePrep, recipe.prepMin],
      [t.recipes.timeCook, recipe.cookMin],
      [t.recipes.timeTotal, recipe.totalMin],
    ] as [string, number | null | undefined][]
  )
    .filter((p): p is [string, number] => !!p[1])
    .map(([label, m]) => `${label} ${formatDuration(m * 60)}`)
  const MULTS: [string, number][] = [['½', 0.5], ['1', 1], ['2', 2], ['3', 3]]
  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, factor),
    [recipe.ingredients, factor],
  )
  // Sectioned display ("Biscuits" / "Glaçage"): inline "## " markers group the
  // flat lines; a recipe without markers is one untitled group, unchanged. Step
  // numbering runs ACROSS sections (each group's <ol> picks up where the last
  // ended) so cook mode's "étape 5" matches the sheet.
  const ingGroups = useMemo(() => groupSections(scaledIngredients), [scaledIngredients])
  const stepGroups = useMemo(() => {
    let n = 1
    return groupSections(recipe.steps).map((g) => {
      const start = n
      n += g.items.length
      return { ...g, start }
    })
  }, [recipe.steps])
  // The Original view groups too (the markers are part of the snapshot) —
  // computed inline, it's a handful of lines.
  const origIngGroups = groupSections(origView.ingredients)
  const origStepGroups = (() => {
    let n = 1
    return groupSections(origView.steps).map((g) => {
      const start = n
      n += g.items.length
      return { ...g, start }
    })
  })()
  // Open the "which ingredients?" checklist: the recipe's buyable names, deduped,
  // section markers dropped. (recipe-to-list reduces a measured line to its name
  // anyway — "500 g de bœuf haché" → "Bœuf haché" — so we show that directly.)
  function openAddToList() {
    const seen = new Set<string>()
    const opts: { item: string; on: boolean }[] = []
    for (const line of withoutHeadings(scaledIngredients)) {
      const name = ingredientName(line)
      const k = name.toLowerCase()
      if (name && !seen.has(k)) {
        seen.add(k)
        opts.push({ item: name, on: false })
      }
    }
    setListPrompt(opts)
  }
  const toggleListItem = (item: string) =>
    setListPrompt((p) => p?.map((o) => (o.item === item ? { ...o, on: !o.on } : o)) ?? p)
  const allListOn = !!listPrompt?.length && listPrompt.every((o) => o.on)
  const toggleAllList = () => setListPrompt((p) => p?.map((o) => ({ ...o, on: !allListOn })) ?? p)

  async function confirmAddToList() {
    const items = (listPrompt ?? []).filter((o) => o.on).map((o) => o.item)
    if (!items.length) return
    setAdded(true)
    setListPrompt(null)
    await write('recipe-to-list', { method: 'POST', body: { items }, affectedKeys: [BOARD_KEY, ['list']] }).catch(() =>
      setAdded(false),
    )
  }

  async function planOn(date: number) {
    setPlannedDate(date)
    setPlanning(false)
    // Optimistic badge above; roll it back on failure so the sheet never claims
    // a meal the server doesn't have. Lands on the chosen slot (souper default).
    await write('meals', {
      method: 'POST',
      body: { date, slot: planSlot, title: recipe.title, staples: [], recipeId: recipe.id },
      affectedKeys: [['meals'], BOARD_KEY],
    }).catch(() => setPlannedDate(null))
  }

  async function del() {
    // A recipe is a HEAVY object to lose by a stray tap — deliberate yes/no via
    // the in-app confirm dialog (not the platform confirm, which e2e can't see).
    if (!(await confirm({ message: t.recipes.deleteConfirm, confirmLabel: t.recipes.delete, tone: 'danger' }))) return
    await write('recipes', { method: 'DELETE', body: { id: recipe.id }, affectedKeys: [RECIPES_KEY] }).catch(() => {})
    onClose()
  }

  return (
    <div ref={modalRef} className="recipe-modal" role="dialog" aria-modal="true" aria-label={recipe.title}>
      <div className="recipe-modal__scrim" onClick={onClose} aria-hidden="true" />
      <div className="recipe-modal__card surface">
        <div className="recipe-modal__bar">
          <h2>{recipe.title}</h2>
          <button
            type="button"
            className={'btn btn--ghost mono recipe-original-toggle' + (showOriginal ? ' is-on' : '')}
            onClick={() => setShowOriginal((s) => !s)}
            aria-pressed={showOriginal}
            title={showOriginal ? t.recipes.originalHide : t.recipes.originalShow}
            aria-label={showOriginal ? t.recipes.originalHide : t.recipes.originalShow}
          >
            <Icon name="scroll-bold" size={18} />
          </button>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.common.back}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>

        {showOriginal ? (
          <div className="recipe-modal__body recipe-original">
            <p className="recipe-original__tag mono">
              {orig ? t.recipes.originalImported : t.recipes.originalAsWritten}
              {orig?.importedAt ? ` · ${new Date(orig.importedAt * 1000).toLocaleDateString()}` : ''}
            </p>
            {/* The photo this recipe was READ from (photo-import path), so the cook
                can re-check the parsed text against the real card any time. */}
            {orig?.sourceImage && recipeImg(orig.sourceImage) && (
              <ZoomableImg
                className="recipe-original__source"
                src={recipeImg(orig.sourceImage)!}
                alt={t.recipes.reviewPhotoAlt}
              />
            )}
            <h3 className="recipe-original__title">{origView.title}</h3>
            {origView.servings ? <p className="recipe-original__meta">{t.recipes.servingsN(origView.servings)}</p> : null}
            {origView.ingredients.length > 0 && (
              <>
                <h4 className="recipe-original__h">{t.recipes.ingredients}</h4>
                {origIngGroups.map((g, gi) => (
                  <Fragment key={gi}>
                    {g.title && <h5 className="recipe-subsec-h">{g.title}</h5>}
                    <ul className="recipe-original__ings">
                      {g.items.map(({ text, idx }) => (
                        <li key={idx}>{text}</li>
                      ))}
                    </ul>
                  </Fragment>
                ))}
              </>
            )}
            {origView.steps.length > 0 && (
              <>
                <h4 className="recipe-original__h">{t.recipes.steps}</h4>
                {origStepGroups.map((g, gi) => (
                  <Fragment key={gi}>
                    {g.title && <h5 className="recipe-subsec-h">{g.title}</h5>}
                    <ol className="recipe-original__steps" start={g.start}>
                      {g.items.map(({ text, idx }) => (
                        <li key={idx}>{text}</li>
                      ))}
                    </ol>
                  </Fragment>
                ))}
              </>
            )}
            {origView.source && /^https?:\/\//i.test(origView.source) && (
              <p className="recipe-original__meta">
                <a href={origView.source} target="_blank" rel="noreferrer noopener">
                  {t.recipes.sourceLabel}
                </a>
              </p>
            )}
          </div>
        ) : (
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

          {timeParts.length > 0 && (
            <p className="recipe-view__times mono">
              <InlineIcon name="timer-bold" /> {timeParts.join(' · ')}
            </p>
          )}

          {recipe.tags?.length > 0 && (
            <div className="recipe-view__tags">
              {recipe.tags.map((tg) => {
                const hex = tagColor(tagColors, tg)
                return (
                  <span
                    key={tg}
                    className="chip recipe-view__tag"
                    style={hex ? { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) } : undefined}
                  >
                    {tg}
                  </span>
                )
              })}
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
                      {servLabel(serv)}
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
              {ingGroups.map((g, gi) => (
                <Fragment key={gi}>
                  {g.title && <h4 className="recipe-subsec-h">{g.title}</h4>}
                  <ul className="recipe-view__ings">
                    {g.items.map(({ text, idx }) => (
                      <li key={idx}>
                        <IngredientLine line={text} size="sm" />
                      </li>
                    ))}
                  </ul>
                </Fragment>
              ))}
            </>
          )}

          {recipe.steps.length > 0 && (
            <>
              <h3 className="recipe-sec-h">{t.recipes.steps}</h3>
              {stepGroups.map((g, gi) => (
                <Fragment key={gi}>
                  {g.title && <h4 className="recipe-subsec-h">{g.title}</h4>}
                  <ol className="recipe-view__steps" start={g.start}>
                    {g.items.map(({ text: raw, idx }, p) => {
                      // Drop a leading ordinal that just repeats this step's
                      // number (the <ol> already shows it) — see stripStepOrdinal.
                      const text = stripStepOrdinal(raw, g.start + p)
                      // Each step: its instruction as sentence bullets, then the
                      // ingredients (with scaled quantities) that step uses —
                      // matched within the step's own section when one exists.
                      const used = ingredientsForStep(text, scaledIngredients, g.title)
                      return (
                        <li key={idx}>
                          <ul className="recipe-step__sentences">
                            {stepSentences(text).map((sen, j) => (
                              <li key={j}>{sen}</li>
                            ))}
                          </ul>
                          {used.length > 0 && (
                            <details className="recipe-step__ings-wrap">
                              <summary className="recipe-step__ings-toggle mono">
                                {t.recipes.stepIngredients} ({used.length})
                              </summary>
                              <ul className="recipe-step__ings mono">
                                {used.map((ing, j) => (
                                  <li key={j}>
                                    <IngredientLine line={ing} size="sm" />
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </Fragment>
              ))}
            </>
          )}

          {recipe.notes && <p className="recipe-view__notes">{recipe.notes}</p>}
        </div>
        )}

        {/* "Which ingredients?" checklist — tick the few you're missing (it opens
            all-unticked, since most are staples you already have). */}
        {listPrompt && (
          <div className="recipe-list-pick">
            <div className="recipe-list-pick__head">
              <span className="recipe-list-pick__label mono">{t.recipes.addWhich}</span>
              <button type="button" className="chip recipe-list-pick__all" onClick={toggleAllList}>
                {allListOn ? t.recipes.selectNone : t.recipes.selectAll}
              </button>
            </div>
            <div className="recipe-list-pick__items">
              {listPrompt.map((o) => (
                <Chip key={o.item} selected={o.on} onClick={() => toggleListItem(o.item)}>
                  {o.on && (
                    <>
                      <InlineIcon name="check-bold" />{' '}
                    </>
                  )}
                  {o.item}
                </Chip>
              ))}
            </div>
            <div className="recipe-list-pick__actions">
              <button type="button" className="btn btn--ghost mono" onClick={() => setListPrompt(null)}>
                {t.common.cancel}
              </button>
              <button
                type="button"
                className="btn btn--primary mono"
                onClick={confirmAddToList}
                disabled={!listPrompt.some((o) => o.on)}
              >
                {t.recipes.addSelected(listPrompt.filter((o) => o.on).length)}
              </button>
            </div>
          </div>
        )}

        {/* Plan-a-supper day picker, anchored right above the actions so tapping
            "Planifier un souper" reveals the days next to the button (not lost up
            in the scrolled recipe body). */}
        {planning && (
          <MealPlanPicker band slot={planSlot} onSlot={setPlanSlot} week={week} onPickDay={planOn} />
        )}

        <div className="recipe-modal__foot recipe-actions">
          {canCook && (
            <button type="button" className="btn btn--primary" onClick={() => onCook(factor)}>
              <InlineIcon name="cooking-pot-bold" /> {t.recipes.cook}
            </button>
          )}
          {/* Share the recipe as plain text via the platform sheet — a read action,
              so it's available to guests too. The one home for sharing (moved off
              the cook-mode bar). Hidden where Web Share is unavailable. */}
          {typeof navigator !== 'undefined' && !!navigator.share && (
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() =>
                shareRecipe(recipe, {
                  ingredients: t.recipes.ingredients,
                  steps: t.recipes.steps,
                  notes: t.recipes.notes,
                })
              }
            >
              <InlineIcon name="arrow-up-right-bold" /> {t.recipes.shareRecipe}
            </button>
          )}
          {!ro && recipe.ingredients.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() => (listPrompt ? setListPrompt(null) : openAddToList())}
              disabled={added}
              aria-expanded={!!listPrompt}
            >
              {added ? t.recipes.addedToList : t.recipes.addToList}
            </button>
          )}
          {!ro && (
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() => setPlanning((p) => !p)}
              disabled={plannedDate != null}
            >
              {plannedDate != null ? t.recipes.planned : t.recipes.plan}
            </button>
          )}
          {!ro && (
            <button type="button" className="btn btn--ghost mono" onClick={onEdit}>
              {t.recipes.editBtn}
            </button>
          )}
          {!ro && (
            <button type="button" className="btn btn--ghost mono recipe-del" onClick={del}>
              {t.recipes.delete}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
