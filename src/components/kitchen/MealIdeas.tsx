import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useRecordUndo } from '../../lib/toast'
import { type Recipe } from '../../lib/recipes'
import { type MealSlot } from '../../lib/mealSlots'
import { type MealIdea, MEAL_IDEAS_KEY, MEALS_KEY } from './types'
import { RecipePickerMenu } from './RecipePickerMenu'
import { MealPlanPicker } from './MealPlanPicker'
import { Icon, InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'

// The "general ideas" pool under the week grid: a reusable shortlist of meal
// ideas — free text ("tacos") or a saved-recipe shortcut. Add by typing or
// picking from the book; tap an idea to drop it onto a chosen day + meal. Planning
// an idea leaves it in the pool (reusable). Generalizes the toddler "suggest a
// meal" path so anyone can stash an idea and place it later. Calm, low-chrome.
export function MealIdeas({
  ideas,
  recipes,
  week,
  lowItems,
  listItems,
  profileId,
}: {
  ideas: MealIdea[]
  recipes: Recipe[]
  week: { date: number; label: string }[]
  lowItems: string[]
  listItems: string[]
  profileId: string | null
}) {
  const t = useT()
  const qc = useQueryClient()
  const recordUndo = useRecordUndo()
  const [text, setText] = useState('')
  const [pickRecipe, setPickRecipe] = useState(false)
  const [planFor, setPlanFor] = useState<string | null>(null)
  // Which meal a "plan it" lands on — souper by default, like everywhere else.
  const [planSlot, setPlanSlot] = useState<MealSlot>('supper')
  const [busy, setBusy] = useState(false)
  // Inline rename (✏️): which idea is being renamed, and its draft text.
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  async function addIdea(title: string, recipeId?: string | null) {
    const v = title.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await api('meal-ideas', { method: 'POST', body: { title: v, recipeId, suggestedBy: profileId } })
      setText('')
      setPickRecipe(false)
    } catch {
      /* keep the typed text so it can be retried */
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: MEAL_IDEAS_KEY })
    }
  }

  async function removeIdea(idea: MealIdea) {
    await api('meal-ideas', { method: 'DELETE', body: { id: idea.id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEAL_IDEAS_KEY })
    // Compensating undo: re-add the idea from its snapshot (the pool is live-polled,
    // so holding the delete would let the poll resurrect it). New id, same idea.
    recordUndo({
      message: t.undo.mealIdeaRemoved(idea.title),
      onUndo: async () => {
        await api('meal-ideas', {
          method: 'POST',
          body: { title: idea.title, recipeId: idea.recipe_id ?? null, suggestedBy: idea.suggested_by ?? null },
        }).catch(() => {})
        qc.invalidateQueries({ queryKey: MEAL_IDEAS_KEY })
      },
    })
  }

  async function renameIdea(idea: MealIdea, title: string) {
    const v = title.trim()
    setEditId(null)
    if (!v || v === idea.title) return
    // Optimistic rename, then persist (the pool is live-polled, so reflect it now).
    qc.setQueryData<{ ideas: MealIdea[] }>(MEAL_IDEAS_KEY, (d) =>
      d ? { ideas: d.ideas.map((x) => (x.id === idea.id ? { ...x, title: v } : x)) } : d,
    )
    await api('meal-ideas', { method: 'PATCH', body: { id: idea.id, title: v } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEAL_IDEAS_KEY })
  }

  // Place an idea onto a day + meal — same shape as a recipe quick-add, so a
  // recipe-linked idea keeps its link and a free-text idea stays plain text.
  async function planIdea(idea: MealIdea, date: number, slot: MealSlot) {
    setPlanFor(null)
    await api('meals', {
      method: 'POST',
      body: { date, slot, title: idea.title, recipeId: idea.recipe_id ?? null, staples: [] },
    }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  return (
    <section className="kitchen__ideas">
      <div className="kitchen__head">
        <h2>{t.kitchen.ideas}</h2>
      </div>
      <p className="kitchen__ideas-hint mono">{t.kitchen.ideasHint}</p>

      <form
        className="kitchen__ideas-add"
        onSubmit={(e) => {
          e.preventDefault()
          addIdea(text)
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.kitchen.addIdea}
          aria-label={t.kitchen.addIdea}
        />
        <button type="submit" className="btn btn--ghost mono" disabled={!text.trim() || busy}>
          ＋
        </button>
        {recipes.length > 0 && (
          <button
            type="button"
            className={'btn btn--ghost mono' + (pickRecipe ? ' is-on' : '')}
            onClick={() => setPickRecipe((s) => !s)}
            aria-expanded={pickRecipe}
            aria-label={t.kitchen.fromRecipe}
            title={t.kitchen.fromRecipe}
          >
            <Icon name="book-open-bold" size={18} />
          </button>
        )}
      </form>

      {pickRecipe && (
        <RecipePickerMenu
          recipes={recipes}
          lowItems={lowItems}
          listItems={listItems}
          onPick={(r) => addIdea(r.title, r.id)}
        />
      )}

      {ideas.length === 0 ? (
        <p className="kitchen__ideas-empty mono">{t.kitchen.ideasEmpty}</p>
      ) : (
        <ul className="kitchen__ideas-list">
          {ideas.map((idea) => (
            <li key={idea.id} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {editId === idea.id ? (
                  <form
                    className="kitchen__idea-edit"
                    onSubmit={(e) => {
                      e.preventDefault()
                      renameIdea(idea, editText)
                    }}
                  >
                    <input
                      className="input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label={t.common.edit}
                      autoFocus
                    />
                    <button type="submit" className="btn" aria-label={t.common.save} disabled={!editText.trim()}>
                      <Icon name="check-bold" size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost mono"
                      aria-label={t.common.cancel}
                      onClick={() => setEditId(null)}
                    >
                      <Icon name="x-bold" size={15} />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="chip kitchen__idea-name"
                      onClick={() => setPlanFor(planFor === idea.id ? null : idea.id)}
                      aria-expanded={planFor === idea.id}
                    >
                      {idea.recipe_id && (
                        <>
                          <InlineIcon name="book-open-bold" size={14} color="var(--berry-deep)" />{' '}
                        </>
                      )}
                      {idea.title}
                    </button>
                    <RowActions
                      editLabel={t.common.edit}
                      deleteLabel={t.kitchen.removeIdea}
                      onEdit={() => {
                        setEditId(idea.id)
                        setEditText(idea.title)
                      }}
                      onDelete={() => removeIdea(idea)}
                    />
                  </>
                )}
              </div>
              {planFor === idea.id && (
                <MealPlanPicker
                  slot={planSlot}
                  onSlot={setPlanSlot}
                  week={week}
                  onPickDay={(date) => planIdea(idea, date, planSlot)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
