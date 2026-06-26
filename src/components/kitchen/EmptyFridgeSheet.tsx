import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../Modal'
import { Chip } from '../Chip'
import { Icon, InlineIcon } from '../Icon'
import { api, isStatus } from '../../lib/api'
import { useT } from '../../i18n'
import { RECIPES_KEY } from '../../lib/recipes'
import { withoutHeadings } from '../../lib/recipeSections'
import { togglePick, MAX_FRIDGE_PICKS } from '../../lib/emptyFridge'

// « Vide-frigo » — turn what's about to spoil into supper, in two calm steps:
//   1. the AI proposes ~10 dish names that USE UP your « à utiliser bientôt » +
//      réserve items (one cheap call). You tick up to three.
//   2. each pick becomes a full recipe (≤3 calls). Keep one to the book or cook it now.
// The pre-filter (names first) means a full recipe is only generated for what you
// actually want — cheaper than drafting ten, and a calmer "decide" moment. The
// server reads only existing pantry tables; saving tags the recipe « Vide-frigo ».
interface FridgeRecipe {
  title: string
  ingredients: string[]
  steps: string[]
}

export function EmptyFridgeSheet({
  open,
  onClose,
  soonItems,
  reserveItems,
}: {
  open: boolean
  onClose: () => void
  soonItems: string[]
  reserveItems: string[]
}) {
  const t = useT()
  const f = t.kitchen.fridge
  const nav = useNavigate()
  const qc = useQueryClient()

  const [phase, setPhase] = useState<'ideas' | 'recipes'>('ideas')
  const [ideas, setIdeas] = useState<string[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false) // fetching step-1 ideas
  const [building, setBuilding] = useState(false) // fetching step-2 recipes
  const [recipes, setRecipes] = useState<FridgeRecipe[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, string>>({}) // title → new recipe id
  const [savingTitle, setSavingTitle] = useState<string | null>(null)

  // Step 1 — names that use up what's about to spoil. `avoid` carries the batch just
  // shown so a re-ask returns DIFFERENT dishes. 503 → AI is off (tile usually hidden).
  async function fetchIdeas(avoid: string[] = []) {
    setLoading(true)
    setError(null)
    try {
      const res = await api<{ ideas: string[] }>('empty-fridge', { method: 'POST', body: { avoid } })
      setIdeas(res.ideas)
      setPicked(new Set())
      setPhase('ideas')
    } catch (e) {
      setError(isStatus(e, 503) ? f.aiOff : f.failed)
    } finally {
      setLoading(false)
    }
  }

  // Auto-load a fresh batch the first time the sheet opens (the tile press is already
  // the intent — one fewer tap). Re-open after a close starts clean (reset below).
  useEffect(() => {
    if (open && !ideas.length && !loading && !error) fetchIdeas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Fully reset when closed, so a re-open isn't stuck on a stale batch/error.
  useEffect(() => {
    if (open) return
    setPhase('ideas')
    setIdeas([])
    setPicked(new Set())
    setRecipes([])
    setError(null)
    setSaved({})
    setSavingTitle(null)
  }, [open])

  // Step 2 — flesh the ticked names into full recipes (server biases each toward the
  // on-hand items). Bounded to MAX_FRIDGE_PICKS picks server-side too.
  async function buildRecipes() {
    if (!picked.size) return
    setBuilding(true)
    setError(null)
    try {
      const res = await api<{ recipes: FridgeRecipe[] }>('empty-fridge', {
        method: 'POST',
        body: { step: 'recipes', titles: [...picked] },
      })
      setRecipes(res.recipes)
      setPhase('recipes')
    } catch (e) {
      setError(isStatus(e, 503) ? f.aiOff : f.failed)
    } finally {
      setBuilding(false)
    }
  }

  // Save a generated recipe to the book, tagged « Vide-frigo » so it's findable.
  // Returns the new id (cached in `saved`) so « Cuisiner » can route straight to it.
  async function save(r: FridgeRecipe): Promise<string | null> {
    if (saved[r.title]) return saved[r.title]
    setSavingTitle(r.title)
    try {
      const res = await api<{ id: string }>('recipes', {
        method: 'POST',
        body: { title: r.title, ingredients: r.ingredients, steps: r.steps, tags: [f.tag] },
      })
      setSaved((p) => ({ ...p, [r.title]: res.id }))
      qc.invalidateQueries({ queryKey: RECIPES_KEY })
      return res.id
    } catch {
      return null
    } finally {
      setSavingTitle(null)
    }
  }

  async function cook(r: FridgeRecipe) {
    const id = await save(r)
    if (id) {
      onClose()
      nav(`/kitchen/recipe/${id}/cook`)
    }
  }

  // The items the rescue is built around — a calm "here's what we're using" subtitle.
  const context = [...soonItems, ...reserveItems]

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="fridge-modal"
      title={
        <>
          <InlineIcon name="carrot-bold" color="#6B8A52" /> {f.title}
        </>
      }
    >
      <div className="fridge-modal__body">
        {context.length > 0 && (
          <p className="fridge-modal__lead mono">
            {f.lead} {context.slice(0, 8).join(' · ')}
          </p>
        )}

        {error && (
          <div className="fridge-modal__status">
            <p className="mono">{error}</p>
            <button type="button" className="btn btn--ghost mono" onClick={() => fetchIdeas()}>
              <InlineIcon name="repeat-bold" /> {f.retry}
            </button>
          </div>
        )}

        {/* STEP 1 — pick a few ideas */}
        {!error && phase === 'ideas' && (
          <>
            {loading ? (
              <p className="fridge-modal__status mono" role="status">
                ⏳ {f.thinking}
              </p>
            ) : (
              <>
                <p className="fridge-modal__hint mono">{f.pickHint(MAX_FRIDGE_PICKS)}</p>
                <div className="fridge-modal__ideas">
                  {ideas.map((idea) => {
                    const on = picked.has(idea)
                    return (
                      <Chip
                        key={idea}
                        selected={on}
                        disabled={!on && picked.size >= MAX_FRIDGE_PICKS}
                        onClick={() => setPicked((p) => togglePick(p, idea))}
                        title={idea}
                      >
                        <InlineIcon name={on ? 'check-square-bold' : 'square-bold'} /> {idea}
                      </Chip>
                    )
                  })}
                </div>
                <div className="fridge-modal__actions">
                  <button
                    type="button"
                    className="btn btn--ghost mono"
                    onClick={() => fetchIdeas(ideas)}
                    disabled={loading}
                  >
                    <InlineIcon name="repeat-bold" /> {f.moreIdeas}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary mono"
                    onClick={buildRecipes}
                    disabled={picked.size === 0 || building}
                  >
                    {building ? f.cooking : f.seeRecipes(picked.size)}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* STEP 2 — the recipes, decide */}
        {!error && phase === 'recipes' && (
          <>
            {building ? (
              <p className="fridge-modal__status mono" role="status">
                ⏳ {f.cooking}
              </p>
            ) : (
              <>
                {recipes.map((r) => {
                  const ings = withoutHeadings(r.ingredients ?? [])
                  const steps = withoutHeadings(r.steps ?? [])
                  const recipeId = saved[r.title]
                  return (
                    <div key={r.title} className="fridge-recipe surface">
                      <h4 className="fridge-recipe__title">{r.title}</h4>
                      {ings.length > 0 && (
                        <ul className="fridge-recipe__ings mono">
                          {ings.map((it, i) => (
                            <li key={i}>{it}</li>
                          ))}
                        </ul>
                      )}
                      {steps.length > 0 && (
                        <ol className="fridge-recipe__steps mono">
                          {steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      )}
                      {ings.length === 0 && steps.length === 0 && (
                        <p className="fridge-modal__hint mono">{f.thinEmpty}</p>
                      )}
                      <div className="fridge-recipe__actions">
                        {recipeId ? (
                          <button
                            type="button"
                            className="btn btn--ghost mono"
                            onClick={() => {
                              onClose()
                              nav(`/kitchen/recipe/${recipeId}`)
                            }}
                          >
                            <InlineIcon name="book-open-bold" /> {f.savedSee}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost mono"
                            onClick={() => save(r)}
                            disabled={savingTitle === r.title}
                          >
                            <InlineIcon name="plus-bold" /> {f.keep}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--primary mono"
                          onClick={() => cook(r)}
                          disabled={savingTitle === r.title}
                        >
                          <InlineIcon name="cooking-pot-bold" /> {f.cook}
                        </button>
                      </div>
                    </div>
                  )
                })}
                <div className="fridge-modal__actions">
                  <button type="button" className="btn btn--ghost mono" onClick={() => setPhase('ideas')}>
                    <Icon name="arrow-left-bold" size={16} /> {f.backToIdeas}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
