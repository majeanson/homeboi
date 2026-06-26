import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { isGuest } from '../../lib/device'
import { type Recipe } from '../../lib/recipes'
import { type MealSlot } from '../../lib/mealSlots'
import { type MealIdea, MEAL_IDEAS_KEY, MEALS_KEY } from './types'
import { BOARD_KEY } from '../../lib/queryKeys'
import { EntityCombobox } from '../EntityCombobox'
import { recipeOptions } from './comboOptions'
import { MealPlanPicker } from './MealPlanPicker'
import { Icon, InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { useInlineEdit } from '../../lib/useInlineEdit'
import { RowActions } from '../RowActions'
import { useSingleOpen } from '../Disclosure'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

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
  help,
}: {
  ideas: MealIdea[]
  recipes: Recipe[]
  week: { date: number; label: string }[]
  lowItems: string[]
  listItems: string[]
  profileId: string | null
  // The kitchen's page-level help mode (lib/helpMode) — makes the "Idées de repas"
  // heading tappable-to-explain while armed. Optional: plain heading without it.
  help?: HelpMode
}) {
  const t = useT()
  const write = useWrite()
  // Bulletproof calm-delete for this LIVE-POLLED pool (see useDeferredRemoval):
  // hide + filter the removed idea and await a refetch before un-hiding, so a poll
  // can't resurrect it mid-undo. Undo cancels the held DELETE — the idea keeps its
  // id (and recipe link) rather than coming back as a copy.
  const removal = useDeferredRemoval(MEAL_IDEAS_KEY)
  // Read-only guest: no add form / recipe-pick / plan-onto-day; chips read as inert
  // text. RowActions already hides its own ✏️/🗑️ for a guest.
  const ro = isGuest()
  const [text, setText] = useState('')
  // Tap an idea to reveal its plan-onto-a-day picker — one open at a time (shared
  // with Leftovers via useSingleOpen, the per-item sibling of <Disclosure>).
  const { isOpen, toggle, close } = useSingleOpen()
  // Recipes as combobox options — ranked by cookability, badged "Prêt / il manque N".
  const recipeOpts = useMemo(() => recipeOptions(recipes, lowItems, listItems, t), [recipes, lowItems, listItems, t])
  // Which meal a "plan it" lands on — souper by default, like everywhere else.
  const [planSlot, setPlanSlot] = useState<MealSlot>('supper')
  const [busy, setBusy] = useState(false)
  // Inline rename (✏️): which idea is being renamed + its draft (shared useInlineEdit).
  const edit = useInlineEdit()

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

  // Remove an idea, deferred behind the undo toast; the row is hidden + filtered out
  // (removal.visible) so the live poll can't resurrect it mid-undo.
  function removeIdea(idea: MealIdea) {
    removal.remove([idea.id], t.undo.mealIdeaRemoved(idea.title), () =>
      write('meal-ideas', { method: 'DELETE', body: { id: idea.id }, affectedKeys: [MEAL_IDEAS_KEY] }).catch(() => {}),
    )
  }

  async function renameIdea(idea: MealIdea, title: string) {
    const v = title.trim()
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
    close()
    await write('meals', {
      method: 'POST',
      body: { date, slot, title: idea.title, recipeId: idea.recipe_id ?? null, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY],
    }).catch(() => {})
  }

  return (
    <section className="kitchen__ideas">
      <div className="kitchen__head">
        <HelpTitle help={help} k="ideas">{t.kitchen.ideas}</HelpTitle>
      </div>
      {help?.bubbleFor('ideas')}

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

      {removal.visible(ideas).length === 0 ? (
        <p className="kitchen__ideas-empty mono">{t.kitchen.ideasEmpty}</p>
      ) : (
        <ul className="kitchen__ideas-list">
          {removal.visible(ideas).map((idea) => (
            <li key={idea.id} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {edit.editId === idea.id && !ro ? (
                  <EditField
                    value={edit.text}
                    onChange={edit.setText}
                    onSubmit={(v) => {
                      edit.cancel()
                      renameIdea(idea, v)
                    }}
                    onCancel={edit.cancel}
                    clearable={false}
                    ariaLabel={t.common.edit}
                    autoFocus
                  />
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
                        className={'chip kitchen__idea-name' + (isOpen(idea.id) ? ' is-open' : '')}
                        onClick={() => toggle(idea.id)}
                        aria-expanded={isOpen(idea.id)}
                      >
                        {idea.recipe_id && (
                          <>
                            <InlineIcon name="book-open-bold" size={14} color="var(--berry-deep)" />{' '}
                          </>
                        )}
                        {idea.title}
                        <span className="kitchen__idea-caret" aria-hidden="true">
                          <Icon name="caret-down-bold" size={12} />
                        </span>
                      </button>
                    )}
                    <RowActions
                      editLabel={t.common.edit}
                      deleteLabel={t.kitchen.removeIdea}
                      onEdit={() => edit.open(idea.id, idea.title)}
                      onDelete={() => removeIdea(idea)}
                    />
                  </>
                )}
              </div>
              {!ro && isOpen(idea.id) && (
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
