import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { type Recipe } from '../../lib/recipes'
import { type MealSlot } from '../../lib/mealSlots'
import { type MealIdea, MEAL_IDEAS_KEY, MEALS_KEY } from './types'
import { EntityCombobox } from '../EntityCombobox'
import { recipeOptions } from './comboOptions'
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
  const recordUndo = useRecordUndo()
  const write = useWrite()
  // Read-only guest: no add form / recipe-pick / plan-onto-day; chips read as inert
  // text. RowActions already hides its own ✏️/🗑️ for a guest.
  const ro = isGuest()
  const [text, setText] = useState('')
  const [planFor, setPlanFor] = useState<string | null>(null)
  // Recipes as combobox options — ranked by cookability, badged "Prêt / il manque N".
  const recipeOpts = useMemo(() => recipeOptions(recipes, lowItems, listItems, t), [recipes, lowItems, listItems, t])
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
      await write('meal-ideas', {
        method: 'POST',
        body: { title: v, recipeId, suggestedBy: profileId },
        affectedKeys: [MEAL_IDEAS_KEY],
      })
      setText('')
    } catch {
      /* keep the typed text so it can be retried */
    } finally {
      setBusy(false)
    }
  }

  async function removeIdea(idea: MealIdea) {
    await write('meal-ideas', { method: 'DELETE', body: { id: idea.id }, affectedKeys: [MEAL_IDEAS_KEY] }).catch(() => {})
    // Compensating undo: re-add the idea from its snapshot (the pool is live-polled,
    // so holding the delete would let the poll resurrect it). New id, same idea.
    recordUndo({
      message: t.undo.mealIdeaRemoved(idea.title),
      onUndo: () =>
        void write('meal-ideas', {
          method: 'POST',
          body: { title: idea.title, recipeId: idea.recipe_id ?? null, suggestedBy: idea.suggested_by ?? null },
          affectedKeys: [MEAL_IDEAS_KEY],
        }).catch(() => {}),
    })
  }

  async function renameIdea(idea: MealIdea, title: string) {
    const v = title.trim()
    setEditId(null)
    if (!v || v === idea.title) return
    // Optimistic rename, then persist (the pool is live-polled, so reflect it now).
    await write('meal-ideas', {
      method: 'PATCH',
      body: { id: idea.id, title: v },
      affectedKeys: [MEAL_IDEAS_KEY],
      optimistic: (c) =>
        c.setQueryData<{ ideas: MealIdea[] }>(MEAL_IDEAS_KEY, (d) =>
          d ? { ideas: d.ideas.map((x) => (x.id === idea.id ? { ...x, title: v } : x)) } : d,
        ),
    }).catch(() => {})
  }

  // Place an idea onto a day + meal — same shape as a recipe quick-add, so a
  // recipe-linked idea keeps its link and a free-text idea stays plain text.
  async function planIdea(idea: MealIdea, date: number, slot: MealSlot) {
    setPlanFor(null)
    await write('meals', {
      method: 'POST',
      body: { date, slot, title: idea.title, recipeId: idea.recipe_id ?? null, staples: [] },
      affectedKeys: [MEALS_KEY, ['board']],
    }).catch(() => {})
  }

  return (
    <section className="kitchen__ideas">
      <div className="kitchen__head">
        <h2>{t.kitchen.ideas}</h2>
      </div>

      {!ro && (
        // Type a free-text idea OR pick a saved recipe from the same box — the
        // dropdown filters as you type, the caret opens the full book.
        <EntityCombobox
          value={text}
          onChange={setText}
          options={recipeOpts}
          onPick={(o) => addIdea(o.data.title, o.data.id)}
          onSubmit={(v) => addIdea(v)}
          submitIcon="plus-bold"
          placeholder={recipes.length > 0 ? t.combo.typeOrPick : t.kitchen.addIdea}
          ariaLabel={t.kitchen.addIdea}
          noMatchLabel={t.recipes.noMatch}
          busy={busy}
          className="kitchen__ideas-combo"
        />
      )}

      {ideas.length === 0 ? (
        <p className="kitchen__ideas-empty mono">{t.kitchen.ideasEmpty}</p>
      ) : (
        <ul className="kitchen__ideas-list">
          {ideas.map((idea) => (
            <li key={idea.id} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {editId === idea.id && !ro ? (
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
                    {ro ? (
                      <span className="chip kitchen__idea-name" aria-disabled="true">
                        {idea.recipe_id && (
                          <>
                            <InlineIcon name="book-open-bold" size={14} color="var(--berry-deep)" />{' '}
                          </>
                        )}
                        {idea.title}
                      </span>
                    ) : (
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
                    )}
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
              {!ro && planFor === idea.id && (
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
