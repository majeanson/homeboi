import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { BOARD_KEY } from '../../lib/queryKeys'
import { type MealSlot } from '../../lib/mealSlots'
import { type Leftover, type MealRow, LEFTOVERS_KEY, MEALS_KEY } from './types'
import { EntityCombobox } from '../EntityCombobox'
import { mealOptions } from './comboOptions'
import { MealPlanPicker } from './MealPlanPicker'
import { Icon, InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'

// "Restants" — the leftovers pool under the week grid. A cooked dish with extra
// that isn't pinned to a day yet: a calm "eat these first" nudge. Add by typing,
// or quick-pick one of today's planned meals ("we ate this, there's some left").
// Tap a leftover to PLAN it onto a day (it becomes a real meal, badged Restants,
// and leaves the pool — you eat leftovers once); ✏️ rename / 🗑️ Fini otherwise.
// Mirrors MealIdeas; like À utiliser bientôt it never touches the shopping list.
export function Leftovers({
  leftovers,
  recentMeals,
  week,
}: {
  leftovers: Leftover[]
  recentMeals: MealRow[]
  week: { date: number; label: string }[]
}) {
  const t = useT()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  // Read-only guest: no add / recent quick-pick / plan-onto-day; chips read inert.
  const ro = isGuest()
  const [text, setText] = useState('')
  const [planFor, setPlanFor] = useState<string | null>(null)
  const [planSlot, setPlanSlot] = useState<MealSlot>('supper')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Recent meals (the last few days) become "we ate this, there's some left"
  // suggestions in the combobox — pick one to carry its recipe link + source meal.
  const recentOpts = useMemo(() => mealOptions(recentMeals), [recentMeals])

  async function addLeftover(title: string, recipeId?: string | null, sourceMealId?: string | null) {
    const v = title.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await write('meal-leftovers', {
        method: 'POST',
        body: { title: v, recipeId, sourceMealId },
        affectedKeys: [LEFTOVERS_KEY],
      })
      setText('')
    } catch {
      /* keep the typed text so it can be retried */
    } finally {
      setBusy(false)
    }
  }

  // Fini / mangé — remove it. Compensating undo (the pool is live-polled, so a held
  // delete would be resurrected): re-add the leftover from its snapshot. New id.
  async function removeLeftover(l: Leftover) {
    await write('meal-leftovers', { method: 'DELETE', body: { id: l.id }, affectedKeys: [LEFTOVERS_KEY] }).catch(() => {})
    recordUndo({
      message: t.undo.leftoverRemoved(l.title),
      onUndo: () =>
        void write('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
          affectedKeys: [LEFTOVERS_KEY],
        }).catch(() => {}),
    })
  }

  async function renameLeftover(l: Leftover, title: string) {
    const v = title.trim()
    setEditId(null)
    if (!v || v === l.title) return
    await write('meal-leftovers', {
      method: 'PATCH',
      body: { id: l.id, title: v },
      affectedKeys: [LEFTOVERS_KEY],
      optimistic: (c) =>
        c.setQueryData<{ leftovers: Leftover[] }>(LEFTOVERS_KEY, (d) =>
          d ? { leftovers: d.leftovers.map((x) => (x.id === l.id ? { ...x, title: v } : x)) } : d,
        ),
    }).catch(() => {})
  }

  // Plan it onto a day → a real meal tagged is_leftover; the pool row is consumed
  // server-side. Refresh the plan + board (today's supper headline may change).
  // Compensating undo (the caches are live-polled): delete the created meal AND
  // re-insert the pool row, so Annuler fully reverses the plan.
  async function planLeftover(l: Leftover, date: number, slot: MealSlot) {
    setPlanFor(null)
    const keys = [LEFTOVERS_KEY, MEALS_KEY, BOARD_KEY]
    const res = await write<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id: l.id, date, slot },
      affectedKeys: keys,
    }).catch(() => null)
    const mealId = res && !res.queued ? res.data?.mealId : undefined
    recordUndo({
      message: t.undo.leftoverPlanned(l.title),
      onUndo: async () => {
        if (mealId) await write('meals', { method: 'DELETE', body: { id: mealId }, affectedKeys: keys }).catch(() => {})
        await write('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
          affectedKeys: keys,
        }).catch(() => {})
      },
    })
  }

  return (
    <section className="kitchen__ideas">
      <div className="kitchen__head">
        <h2>{t.kitchen.leftovers}</h2>
      </div>

      {!ro && (
        // Type a free-text leftover OR pick one of the last few days' meals
        // ("we ate this, there's some left") from the same box.
        <EntityCombobox
          value={text}
          onChange={setText}
          options={recentOpts}
          onPick={(o) => addLeftover(o.data.title, o.data.recipe_id ?? null, o.data.id)}
          onSubmit={(v) => addLeftover(v)}
          submitIcon="plus-bold"
          placeholder={t.kitchen.leftoversAdd}
          ariaLabel={t.kitchen.leftoversAdd}
          busy={busy}
          className="kitchen__ideas-combo"
        />
      )}

      {leftovers.length === 0 ? (
        <p className="kitchen__ideas-empty mono">{t.kitchen.leftoversEmpty}</p>
      ) : (
        <ul className="kitchen__ideas-list">
          {leftovers.map((l) => (
            <li key={l.id} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {editId === l.id && !ro ? (
                  <form
                    className="kitchen__idea-edit"
                    onSubmit={(e) => {
                      e.preventDefault()
                      renameLeftover(l, editText)
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
                        <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />{' '}
                        {l.title}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="chip kitchen__idea-name"
                        onClick={() => setPlanFor(planFor === l.id ? null : l.id)}
                        aria-expanded={planFor === l.id}
                      >
                        <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />{' '}
                        {l.title}
                      </button>
                    )}
                    <RowActions
                      editLabel={t.common.edit}
                      deleteLabel={t.kitchen.removeLeftover}
                      onEdit={() => {
                        setEditId(l.id)
                        setEditText(l.title)
                      }}
                      onDelete={() => removeLeftover(l)}
                    />
                  </>
                )}
              </div>
              {!ro && planFor === l.id && (
                <MealPlanPicker
                  slot={planSlot}
                  onSlot={setPlanSlot}
                  week={week}
                  onPickDay={(date) => planLeftover(l, date, planSlot)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
