import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { Icon } from '../Icon'
import { type MealRow } from './types'

// The planned meals in ONE slot (a slot is a list now — migration 0033). Each row
// shows its title, an optional recipe-link, ↑/↓ to reorder within the slot, and a
// ✕ to remove just that one. Shared by the souper hero and the lighter side slots.
export function MealRows({
  meals,
  recipeFor,
  memberName,
  onOpenRecipe,
  onRemove,
  onMove,
  onClearAll,
}: {
  meals: MealRow[]
  recipeFor: (m: MealRow) => Recipe | undefined
  memberName: (id: string | null | undefined) => string
  onOpenRecipe: (r: Recipe) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onClearAll?: () => void // "clear this slot" — shown only when the slot holds several
}) {
  const t = useT()
  if (!meals.length) return null
  return (
    <ul className="kitchen__meal-list">
      {meals.map((m, i) => {
        const r = recipeFor(m)
        return (
          <li key={m.id} className="kitchen__meal-row">
            <span className="kitchen__meal-main">
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
              <button
                type="button"
                className="kitchen__meal-btn kitchen__meal-remove"
                onClick={() => onRemove(m.id)}
                aria-label={t.kitchen.clearMeal}
                title={t.kitchen.clearMeal}
              >
                <Icon name="x-bold" size={15} />
              </button>
            </span>
          </li>
        )
      })}
      {onClearAll && meals.length > 1 && (
        <li className="kitchen__meal-clearall">
          <button type="button" className="btn btn--ghost mono" onClick={onClearAll}>
            🗑 {t.kitchen.clearSlot}
          </button>
        </li>
      )}
    </ul>
  )
}
