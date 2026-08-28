import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { withoutHeadings } from '../lib/recipeSections'
import { ingredientName } from '../lib/ingredient'
import { InlineIcon } from './Icon'
import { Chip } from './Chip'

// THE « quels ingrédients ? » checklist — tick the few you're missing before a
// recipe's ingredients go on the shared grocery list. You rarely need EVERY line
// (most are staples you already have), so it opens **all-unticked**: "pick the few
// I'm missing", never "untick the many I have". Section markers (`## Titre`) are
// dropped and names are deduped case-insensitively.
//
// It was written twice — here and, until 2026-08-28, in a `RecipeListPicker` modal —
// down to the same `.recipe-list-pick*` classes and the same i18n keys, each with its
// own dedup loop and its own tick state. This is that body, once.
//
// THE HOST OWNS THE COMMIT, and that is not laziness — it is the actual rule.
// `onConfirm` hands back the picked names and the caller does the write, because
// whether an undo is REACHABLE is a property of the surface, not of the checklist.
// Today's only caller, `RecipeSheet`, stays open inside `.recipe-modal` (z-index 80)
// while `.undo-toast` sits at 40, so an « Annuler » offered from there would be
// painted underneath — it POSTs at once and flips its label instead (the cook-mode
// lesson of 2026-08-27, third time). The deleted modal host did the opposite and was
// right to: it CLOSED before committing, so its toast landed on a clear page and the
// POST could be deferred behind « Annuler » honestly.
//
// If a new surface ever needs that deferred variant, it is a ~20-line Modal wrapper
// around this component — which is the whole point of the split. The modal was
// removed because its niche was closed on purpose, not because it was wrong: the
// recipe PEEK it existed for was deleted under the rule in `detail/adapters.ts`
// ("a peek that is really just a MENU of 'go to page X' is an inter-tap"), so every
// path to a recipe now lands on `RecipeSheet`, which already carries this checklist.
export function RecipeIngredientPick({
  lines,
  onCancel,
  onConfirm,
}: {
  /** Raw ingredient lines — measured or scaled; `ingredientName` reduces each to its
   *  buyable name ("500 g de bœuf haché" → "Bœuf haché"), which is what the list
   *  stores anyway, so a scaled and an unscaled line yield the same entry. */
  lines: string[]
  onCancel: () => void
  /** The ticked names, in recipe order. The host owns the write AND its undo tier. */
  onConfirm: (items: string[]) => void
}) {
  const t = useT()
  // Buyable names, deduped case-insensitively, section markers (`## Titre`) dropped.
  const names = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const line of withoutHeadings(lines)) {
      const name = ingredientName(line)
      const k = name.toLowerCase()
      if (name && !seen.has(k)) {
        seen.add(k)
        out.push(name)
      }
    }
    return out
  }, [lines])

  const [on, setOn] = useState<Record<string, boolean>>({})
  const allOn = names.length > 0 && names.every((n) => on[n])
  const picked = names.filter((n) => on[n])

  return (
    <div className="recipe-list-pick">
      <div className="recipe-list-pick__head">
        <span className="recipe-list-pick__label mono">{t.recipes.addWhich}</span>
        <button
          type="button"
          className="chip recipe-list-pick__all"
          onClick={() => setOn(Object.fromEntries(names.map((n) => [n, !allOn])))}
        >
          {allOn ? t.recipes.selectNone : t.recipes.selectAll}
        </button>
      </div>
      <div className="recipe-list-pick__items">
        {names.map((item) => (
          <Chip key={item} selected={!!on[item]} onClick={() => setOn((s) => ({ ...s, [item]: !s[item] }))}>
            {on[item] && (
              <>
                <InlineIcon name="check-bold" />{' '}
              </>
            )}
            {item}
          </Chip>
        ))}
      </div>
      <div className="recipe-list-pick__actions">
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className="btn btn--primary mono"
          onClick={() => picked.length && onConfirm(picked)}
          disabled={!picked.length}
        >
          {t.recipes.addSelected(picked.length)}
        </button>
      </div>
    </div>
  )
}
