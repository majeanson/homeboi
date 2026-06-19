import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { isGuest } from '../../lib/device'
import { BOARD_KEY } from '../../lib/queryKeys'
import { type MealSlot } from '../../lib/mealSlots'
import { type Leftover, type MealRow, LEFTOVERS_KEY, MEALS_KEY } from './types'
import { EntityCombobox } from '../EntityCombobox'
import { mealOptions } from './comboOptions'
import { MealPlanPicker } from './MealPlanPicker'
import { Icon, InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { useInlineEdit } from '../../lib/useInlineEdit'
import { RowActions } from '../RowActions'
import { useSingleOpen } from '../Disclosure'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

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
  help,
}: {
  leftovers: Leftover[]
  recentMeals: MealRow[]
  week: { date: number; label: string }[]
  // Kitchen's page-level help mode — makes the "Restants" heading explainable while
  // armed (lib/helpMode). Optional: a plain heading without it.
  help?: HelpMode
}) {
  const t = useT()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  // Bulletproof calm-delete for this LIVE-POLLED pool (see useDeferredRemoval):
  // hide + filter the removed row and await a refetch before un-hiding, so a poll
  // can't resurrect it mid-undo. Undo just cancels the held DELETE — no re-POST, so
  // the row keeps its id (and recipe/source links) instead of coming back as a copy.
  const removal = useDeferredRemoval(LEFTOVERS_KEY)
  // Read-only guest: no add / recent quick-pick / plan-onto-day; chips read inert.
  const ro = isGuest()
  const [text, setText] = useState('')
  // Tap a leftover to reveal its plan-onto-a-day picker — one open at a time
  // (shared with MealIdeas via useSingleOpen, the per-item sibling of <Disclosure>).
  const { isOpen, toggle, close } = useSingleOpen()
  const [planSlot, setPlanSlot] = useState<MealSlot>('supper')
  const [busy, setBusy] = useState(false)
  // Inline rename (✏️): which leftover is open + its draft (shared useInlineEdit).
  const edit = useInlineEdit()
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

  // Fini / mangé — remove it. Deferred behind the undo toast; the row is hidden +
  // filtered out (removal.visible) so the live poll can't resurrect it mid-undo.
  function removeLeftover(l: Leftover) {
    removal.remove([l.id], t.undo.leftoverRemoved(l.title), () =>
      write('meal-leftovers', { method: 'DELETE', body: { id: l.id }, affectedKeys: [LEFTOVERS_KEY] }).catch(() => {}),
    )
  }

  async function renameLeftover(l: Leftover, title: string) {
    const v = title.trim()
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
    close()
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
        <HelpTitle help={help} k="leftovers">{t.kitchen.leftovers}</HelpTitle>
      </div>
      {help?.bubbleFor('leftovers')}

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
          placeholder={recentMeals.length > 0 ? t.combo.typeOrPick : t.kitchen.leftoversAdd}
          ariaLabel={t.kitchen.leftoversAdd}
          busy={busy}
          className="kitchen__ideas-combo"
        />
      )}

      {removal.visible(leftovers).length === 0 ? (
        <p className="kitchen__ideas-empty mono">{t.kitchen.leftoversEmpty}</p>
      ) : (
        <ul className="kitchen__ideas-list">
          {removal.visible(leftovers).map((l) => (
            <li key={l.id} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {edit.editId === l.id && !ro ? (
                  <EditField
                    value={edit.text}
                    onChange={edit.setText}
                    onSubmit={(v) => {
                      edit.cancel()
                      renameLeftover(l, v)
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
                        <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />{' '}
                        {l.title}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={'chip kitchen__idea-name' + (isOpen(l.id) ? ' is-open' : '')}
                        onClick={() => toggle(l.id)}
                        aria-expanded={isOpen(l.id)}
                      >
                        <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />{' '}
                        {l.title}
                        <span className="kitchen__idea-caret" aria-hidden="true">
                          <Icon name="caret-down-bold" size={12} />
                        </span>
                      </button>
                    )}
                    <RowActions
                      editLabel={t.common.edit}
                      deleteLabel={t.kitchen.removeLeftover}
                      onEdit={() => edit.open(l.id, l.title)}
                      onDelete={() => removeLeftover(l)}
                    />
                  </>
                )}
              </div>
              {!ro && isOpen(l.id) && (
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
