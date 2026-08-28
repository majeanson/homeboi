import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { withoutHeadings } from '../lib/recipeSections'
import { ingredientName } from '../lib/ingredient'
import { InlineIcon } from './Icon'
import { Chip } from './Chip'

// THE « quels ingrédients ? » checklist — tick the few you're missing before a
// recipe's ingredients go on the shared grocery list. You rarely need EVERY line
// (most are staples you already have), so it opens **all-unticked**: "pick the few
// I'm missing", never "untick the many I have".
//
// It existed twice — the `RecipeListPicker` modal and an inline copy inside
// `RecipeSheet` — down to the same `.recipe-list-pick*` classes and the same i18n
// keys, each with its own dedup loop and its own tick state. This is that body,
// once. Both hosts keep their own shell (a Modal / an inline panel).
//
// WHAT THE HOST KEEPS, deliberately: the commit. The two callers really do differ,
// and not by accident —
//
//   • `RecipeListPicker` CLOSES itself on confirm, so nothing is left painted above
//     the undo toast; it can and does DEFER the POST behind « Annuler » (the write
//     only fires if you don't take it back, so undo is conflict-free — nothing to
//     reverse).
//   • `RecipeSheet` stays open inside `.recipe-modal` (z-index 80) while the toast
//     sits at 40, so an « Annuler » offered from there would be painted underneath
//     and unreachable. It POSTs immediately and flips its label to « Ajouté à la
//     liste » — the same call cook mode's « Il en manque » and this sheet's own
//     leftovers button already made (2026-08-27).
//
// So the undo TIER is a property of the SURFACE, not of the checklist, and pushing
// one behaviour down into the shared body would either lose an undo that works or
// paint one nobody can tap. `onConfirm` hands the host the picked names and lets it
// decide. (ACTIONS.md models exactly this: undo tier is per door.)
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
