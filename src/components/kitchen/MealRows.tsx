import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { isGuest } from '../../lib/device'
import { Icon, InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { HeartButton } from '../HeartButton'
import { type MealRow } from './types'

// The planned meals in ONE slot (a slot is a list now — migration 0033). Each row
// shows its title (tap the title body itself to rename it in place — no separate
// ✏️), an optional recipe-link, ↑/↓ to reorder within the slot, and 🗑️ to remove
// just that one. Shared by the souper hero and the lighter side slots.
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
  onDragStart,
  draggingId,
  dragLabel,
}: {
  meals: MealRow[]
  recipeFor: (m: MealRow) => Recipe | undefined
  memberName: (id: string | null | undefined) => string
  // Tap the recipe glyph → peek the meal's recipe (photo + ingredient glance). The
  // meal rides along so the peek can title/attribute it, not just the recipe.
  onOpenRecipe: (r: Recipe, m: MealRow) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onRename: (id: string, title: string) => void
  onClearAll?: () => void // "clear this slot" — shown only when the slot holds several
  // "Il en reste ?" — announce that this cooked meal has leftovers (drops them into
  // the Restants pool). Omitted for slots/contexts that shouldn't offer it; never
  // shown on a row that is ALREADY a leftover.
  onLeftover?: (meal: MealRow) => void
  // Drag-to-move (touch-friendly). When provided, each row gets a grip handle that
  // starts a drag of that meal; the parent decides the drop (move it to another
  // slot). `draggingId` greys out the row currently being dragged. `dragLabel`
  // accessibly names the gesture.
  onDragStart?: (id: string, label: string, e: ReactPointerEvent) => void
  draggingId?: string | null
  dragLabel?: string
}) {
  const t = useT()
  // Read-only guest: render rows as calm inert text — no rename/reorder/remove/
  // drag/leftover, only the recipe-open (a read) survives. (Server 403s + writeWith
  // refuses too; this is the VISUAL half of the guarantee.)
  const ro = isGuest()
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
          <li
            key={m.id}
            className={'kitchen__meal-row' + (draggingId === m.id ? ' is-dragging' : '')}
          >
            {editId === m.id && !ro ? (
              <EditField
                value={editText}
                onChange={setEditText}
                onSubmit={() => commit(m.id)}
                onCancel={() => setEditId(null)}
                clearable={false}
                ariaLabel={t.common.edit}
                autoFocus
              />
            ) : (
              <>
                {onDragStart && !ro && (
                  <span
                    className="dnd-grip mono"
                    data-dnd-grip=""
                    onPointerDown={(e) => onDragStart(m.id, m.title, e)}
                    role="button"
                    aria-label={dragLabel}
                    title={dragLabel}
                  >
                    ⠿
                  </span>
                )}
                {/* The whole title body IS the edit affordance — tap it to rename in
                    place (no separate ✏️). The control cluster stays its own taps.
                    For a guest the body is INERT text (no rename), matching the calm
                    read-only treatment elsewhere. */}
                {ro ? (
                  <span className="kitchen__meal-main">
                    <span className="kitchen__meal-headline">
                      <span className="kitchen__meal-title">{m.title}</span>
                      {m.suggested_by != null && (
                        <span className="kitchen__day-sugg mono"><InlineIcon name="sparkle-bold" size={12} /> {memberName(m.suggested_by) || t.kitchen.suggested}</span>
                      )}
                    </span>
                    {m.is_leftover ? (
                      <span className="kitchen__meal-tag mono">
                        <InlineIcon name="arrow-counter-clockwise-bold" size={12} /> {t.kitchen.leftoversTag}
                      </span>
                    ) : null}
                  </span>
                ) : (
                <button
                  type="button"
                  className="kitchen__meal-main"
                  onClick={() => {
                    setEditId(m.id)
                    setEditText(m.title)
                  }}
                  aria-label={t.common.edit}
                  title={t.common.edit}
                >
                  <span className="kitchen__meal-headline">
                    <span className="kitchen__meal-title">{m.title}</span>
                    {m.suggested_by != null && (
                      <span className="kitchen__day-sugg mono">💡 {memberName(m.suggested_by) || t.kitchen.suggested}</span>
                    )}
                  </span>
                  {/* Planned leftovers read as "Restants" so the plan shows it's a
                      finish-the-fridge meal, not a fresh cook. Sits BELOW the title so
                      it never eats into the title's width. */}
                  {m.is_leftover ? (
                    <span className="kitchen__meal-tag mono">
                      <InlineIcon name="arrow-counter-clockwise-bold" size={12} /> {t.kitchen.leftoversTag}
                    </span>
                  ) : null}
                </button>
                )}
                <span className="kitchen__meal-ctl">
                  {/* A planned meal carries its linked recipe's ❤ (#21). */}
                  {r && <HeartButton recipeId={r.id} />}
                  {r && (
                    <button
                      type="button"
                      className="kitchen__meal-btn"
                      onClick={() => onOpenRecipe(r, m)}
                      aria-label={t.recipes.title}
                      title={t.recipes.title}
                    >
                      <Icon name="book-open-bold" size={16} />
                    </button>
                  )}
                  {/* Reorder only makes sense once there's another meal to swap with. */}
                  {!ro && meals.length > 1 && (
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
                  {!ro && onLeftover && !m.is_leftover && (
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
                  {!ro && (
                  <button
                    type="button"
                    className="kitchen__meal-btn kitchen__meal-remove"
                    onClick={() => onRemove(m.id)}
                    aria-label={t.kitchen.clearMeal}
                    title={t.kitchen.clearMeal}
                  >
                    <Icon name="trash-bold" size={15} />
                  </button>
                  )}
                </span>
              </>
            )}
          </li>
        )
      })}
      {!ro && onClearAll && meals.length > 1 && (
        <li className="kitchen__meal-clearall">
          <button type="button" className="btn btn--ghost mono" onClick={onClearAll}>
            <InlineIcon name="trash-bold" /> {t.kitchen.clearSlot}
          </button>
        </li>
      )}
    </ul>
  )
}
