import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useRecordUndo } from '../../lib/toast'
import { BOARD_KEY } from '../../lib/queryKeys'
import { type MealSlot } from '../../lib/mealSlots'
import { type Leftover, type MealRow, LEFTOVERS_KEY, MEALS_KEY } from './types'
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
  const qc = useQueryClient()
  const recordUndo = useRecordUndo()
  const [text, setText] = useState('')
  const [planFor, setPlanFor] = useState<string | null>(null)
  const [planSlot, setPlanSlot] = useState<MealSlot>('supper')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Recent-meal suggestions (the last few days) stay folded away by default — open
  // them deliberately, so they never read as restants already in the pool below.
  const [showRecent, setShowRecent] = useState(false)

  async function addLeftover(title: string, recipeId?: string | null, sourceMealId?: string | null) {
    const v = title.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await api('meal-leftovers', { method: 'POST', body: { title: v, recipeId, sourceMealId } })
      setText('')
    } catch {
      /* keep the typed text so it can be retried */
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
    }
  }

  // Fini / mangé — remove it. Compensating undo (the pool is live-polled, so a held
  // delete would be resurrected): re-add the leftover from its snapshot. New id.
  async function removeLeftover(l: Leftover) {
    await api('meal-leftovers', { method: 'DELETE', body: { id: l.id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
    recordUndo({
      message: t.undo.leftoverRemoved(l.title),
      onUndo: async () => {
        await api('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
        }).catch(() => {})
        qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
      },
    })
  }

  async function renameLeftover(l: Leftover, title: string) {
    const v = title.trim()
    setEditId(null)
    if (!v || v === l.title) return
    qc.setQueryData<{ leftovers: Leftover[] }>(LEFTOVERS_KEY, (d) =>
      d ? { leftovers: d.leftovers.map((x) => (x.id === l.id ? { ...x, title: v } : x)) } : d,
    )
    await api('meal-leftovers', { method: 'PATCH', body: { id: l.id, title: v } }).catch(() => {})
    qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
  }

  // Plan it onto a day → a real meal tagged is_leftover; the pool row is consumed
  // server-side. Refresh the plan + board (today's supper headline may change).
  // Compensating undo (the caches are live-polled): delete the created meal AND
  // re-insert the pool row, so Annuler fully reverses the plan.
  async function planLeftover(l: Leftover, date: number, slot: MealSlot) {
    setPlanFor(null)
    const res = await api<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id: l.id, date, slot },
    }).catch(() => null)
    qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    qc.invalidateQueries({ queryKey: BOARD_KEY })
    const mealId = res?.mealId
    recordUndo({
      message: t.undo.leftoverPlanned(l.title),
      onUndo: async () => {
        if (mealId) await api('meals', { method: 'DELETE', body: { id: mealId } }).catch(() => {})
        await api('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
        }).catch(() => {})
        qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
        qc.invalidateQueries({ queryKey: MEALS_KEY })
        qc.invalidateQueries({ queryKey: BOARD_KEY })
      },
    })
  }

  return (
    <section className="kitchen__ideas">
      <div className="kitchen__head">
        <h2>{t.kitchen.leftovers}</h2>
      </div>
      <p className="kitchen__ideas-hint mono">{t.kitchen.leftoversHint}</p>

      <form
        className="kitchen__ideas-add"
        onSubmit={(e) => {
          e.preventDefault()
          addLeftover(text)
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.kitchen.leftoversAdd}
          aria-label={t.kitchen.leftoversAdd}
        />
        <button type="submit" className="btn btn--ghost mono" disabled={!text.trim() || busy}>
          ＋
        </button>
      </form>

      {/* Quick-pick from the last few days' meals — "we ate this, there's some left".
          Folded under a "Suggestions" disclosure so these candidates don't blur into
          the actual restants already pooled below. */}
      {recentMeals.length > 0 && (
        <div className="kitchen__leftovers-recent">
          <button
            type="button"
            className="kitchen__leftovers-recent-toggle mono"
            onClick={() => setShowRecent((v) => !v)}
            aria-expanded={showRecent}
          >
            <InlineIcon name={showRecent ? 'caret-down-bold' : 'caret-right-bold'} size={13} />{' '}
            {t.kitchen.leftoversRecentToggle}
          </button>
          {showRecent && (
            <>
              <p className="kitchen__leftovers-recent-label mono">{t.kitchen.leftoversRecent}</p>
              <div className="kitchen__leftovers-recent-chips">
                {recentMeals.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip"
                    onClick={() => addLeftover(m.title, m.recipe_id ?? null, m.id)}
                    disabled={busy}
                  >
                    <InlineIcon name="arrow-counter-clockwise-bold" size={13} /> {m.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {leftovers.length === 0 ? (
        <p className="kitchen__ideas-empty mono">{t.kitchen.leftoversEmpty}</p>
      ) : (
        <ul className="kitchen__ideas-list">
          {leftovers.map((l) => (
            <li key={l.id} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {editId === l.id ? (
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
                    <button
                      type="button"
                      className="chip kitchen__idea-name"
                      onClick={() => setPlanFor(planFor === l.id ? null : l.id)}
                      aria-expanded={planFor === l.id}
                    >
                      <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />{' '}
                      {l.title}
                    </button>
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
              {planFor === l.id && (
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
