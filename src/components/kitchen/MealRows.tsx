import { useState } from 'react'
import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { Icon, InlineIcon } from '../Icon'
import { type MealRow } from './types'

// The planned meals in ONE slot (a slot is a list now — migration 0033). Each row
// shows its title, an optional recipe-link, ↑/↓ to reorder within the slot, ✏️ to
// rename it in place, and 🗑️ to remove just that one. Shared by the souper hero
// and the lighter side slots.
export function MealRows({
  meals,
  recipeFor,
  memberName,
  onOpenRecipe,
  onRemove,
  onMove,
  onRename,
  onClearAll,
  onLeftover,
}: {
  meals: MealRow[]
  recipeFor: (m: MealRow) => Recipe | undefined
  memberName: (id: string | null | undefined) => string
  onOpenRecipe: (r: Recipe) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onRename: (id: string, title: string) => void
  onClearAll?: () => void // "clear this slot" — shown only when the slot holds several
  // "Il en reste ?" — announce that this cooked meal has leftovers (drops them into
  // the Restants pool). Omitted for slots/contexts that shouldn't offer it; never
  // shown on a row that is ALREADY a leftover.
  onLeftover?: (meal: MealRow) => void
}) {
  const t = useT()
  // Inline rename: which row is being edited, and its draft title.
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  function commit(id: string) {
    onRename(id, editText)
    setEditId(null)
  }
  if (!meals.length) return null
  return (
    <ul className="kitchen__meal-list">
      {meals.map((m, i) => {
        const r = recipeFor(m)
        return (
          <li key={m.id} className="kitchen__meal-row">
            {editId === m.id ? (
              <form
                className="kitchen__meal-edit"
                onSubmit={(e) => {
                  e.preventDefault()
                  commit(m.id)
                }}
              >
                <input
                  className="input"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  aria-label={t.common.edit}
                  autoFocus
                />
                <button
                  type="submit"
                  className="kitchen__meal-btn"
                  aria-label={t.common.save}
                  title={t.common.save}
                  disabled={!editText.trim()}
                >
                  <Icon name="check-bold" size={16} />
                </button>
                <button
                  type="button"
                  className="kitchen__meal-btn"
                  onClick={() => setEditId(null)}
                  aria-label={t.common.cancel}
                  title={t.common.cancel}
                >
                  <Icon name="x-bold" size={15} />
                </button>
              </form>
            ) : (
              <>
                <span className="kitchen__meal-main">
                  {/* Planned leftovers read as "Restants" so the plan shows it's a
                      finish-the-fridge meal, not a fresh cook. */}
                  {m.is_leftover ? (
                    <span className="kitchen__meal-tag mono">
                      <InlineIcon name="arrow-counter-clockwise-bold" size={12} /> {t.kitchen.leftoversTag}
                    </span>
                  ) : null}
                  <span className="kitchen__meal-title">{m.title}</span>
                  {m.suggested_by != null && (
                    <span className="kitchen__day-sugg mono">💡 {memberName(m.suggested_by) || t.kitchen.suggested}</span>
                  )}
                </span>
                <span className="kitchen__meal-ctl">
                  {r && (
                    <button
                      type="button"
                      className="kitchen__meal-btn"
                      onClick={() => onOpenRecipe(r)}
                      aria-label={t.recipes.title}
                      title={t.recipes.title}
                    >
                      <Icon name="book-open-bold" size={16} />
                    </button>
                  )}
                  {/* Reorder only makes sense once there's another meal to swap with. */}
                  {meals.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="kitchen__meal-btn"
                        onClick={() => onMove(m.id, 'up')}
                        disabled={i === 0}
                        aria-label={t.kitchen.moveUp}
                        title={t.kitchen.moveUp}
                      >
                        <Icon name="caret-up-bold" size={16} />
                      </button>
                      <button
                        type="button"
                        className="kitchen__meal-btn"
                        onClick={() => onMove(m.id, 'down')}
                        disabled={i === meals.length - 1}
                        aria-label={t.kitchen.moveDown}
                        title={t.kitchen.moveDown}
                      >
                        <Icon name="caret-down-bold" size={16} />
                      </button>
                    </>
                  )}
                  {/* "Il en reste ?" — announce leftovers from this cooked meal. Not
                      offered on a row that is itself already a leftover. */}
                  {onLeftover && !m.is_leftover && (
                    <button
                      type="button"
                      className="kitchen__meal-btn"
                      onClick={() => onLeftover(m)}
                      aria-label={t.kitchen.leftoversFromMeal}
                      title={t.kitchen.leftoversFromMeal}
                    >
                      <Icon name="arrow-counter-clockwise-bold" size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="kitchen__meal-btn"
                    onClick={() => {
                      setEditId(m.id)
                      setEditText(m.title)
                    }}
                    aria-label={t.common.edit}
                    title={t.common.edit}
                  >
                    <Icon name="pencil-simple-bold" size={15} />
                  </button>
                  <button
                    type="button"
                    className="kitchen__meal-btn kitchen__meal-remove"
                    onClick={() => onRemove(m.id)}
                    aria-label={t.kitchen.clearMeal}
                    title={t.kitchen.clearMeal}
                  >
                    <Icon name="trash-bold" size={15} />
                  </button>
                </span>
              </>
            )}
          </li>
        )
      })}
      {onClearAll && meals.length > 1 && (
        <li className="kitchen__meal-clearall">
          <button type="button" className="btn btn--ghost mono" onClick={onClearAll}>
            <InlineIcon name="trash-bold" /> {t.kitchen.clearSlot}
          </button>
        </li>
      )}
    </ul>
  )
}
