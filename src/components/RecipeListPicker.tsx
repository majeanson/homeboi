import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { useT } from '../i18n'
import { useWrite } from '../lib/write'
import { withoutHeadings } from '../lib/recipeSections'
import { ingredientName } from '../lib/ingredient'
import { InlineIcon } from './Icon'
import type { Recipe } from '../lib/recipes'

// "Which ingredients?" picker for adding a recipe's ingredients to the shared
// grocery list — you rarely need EVERY ingredient (most are staples you already
// have), so this lets you tick the few you're missing instead of dumping them all.
// Mirrors the inline checklist inside RecipeSheet (same `recipe-list-pick` styles
// + i18n), but wrapped in the shared Modal so any surface that only has the recipe
// (e.g. the Kitchen recipe-peek) can offer the same selection. Opens all-unticked.
export function RecipeListPicker({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const t = useT()
  const write = useWrite()
  // The recipe's buyable names, deduped, section markers dropped. (recipe-to-list
  // reduces a measured line to its name anyway — "500 g de bœuf haché" → "Bœuf
  // haché" — so we show that directly.)
  const names = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const line of withoutHeadings(recipe.ingredients ?? [])) {
      const name = ingredientName(line)
      const k = name.toLowerCase()
      if (name && !seen.has(k)) {
        seen.add(k)
        out.push(name)
      }
    }
    return out
  }, [recipe.ingredients])
  const [on, setOn] = useState<Record<string, boolean>>({})
  const toggle = (item: string) => setOn((s) => ({ ...s, [item]: !s[item] }))
  const allOn = names.length > 0 && names.every((n) => on[n])
  const toggleAll = () => {
    const next = !allOn
    setOn(Object.fromEntries(names.map((n) => [n, next])))
  }
  const picked = names.filter((n) => on[n])

  async function confirm() {
    if (!picked.length) return
    onClose()
    await write('recipe-to-list', { method: 'POST', body: { items: picked }, affectedKeys: [['board'], ['list']] }).catch(
      () => {},
    )
  }

  return (
    <Modal open onClose={onClose} title={recipe.title}>
      <div className="recipe-list-pick">
        <div className="recipe-list-pick__head">
          <span className="recipe-list-pick__label mono">{t.recipes.addWhich}</span>
          <button type="button" className="chip recipe-list-pick__all" onClick={toggleAll}>
            {allOn ? t.recipes.selectNone : t.recipes.selectAll}
          </button>
        </div>
        <div className="recipe-list-pick__items">
          {names.map((item) => (
            <button
              key={item}
              type="button"
              className={'chip' + (on[item] ? ' is-on' : '')}
              onClick={() => toggle(item)}
              aria-pressed={!!on[item]}
            >
              {on[item] && (
                <>
                  <InlineIcon name="check-bold" />{' '}
                </>
              )}
              {item}
            </button>
          ))}
        </div>
        <div className="recipe-list-pick__actions">
          <button type="button" className="btn btn--ghost mono" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn btn--primary mono" onClick={confirm} disabled={!picked.length}>
            {t.recipes.addSelected(picked.length)}
          </button>
        </div>
      </div>
    </Modal>
  )
}
