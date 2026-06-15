import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { type Leftover } from './types'
import { InlineIcon } from '../Icon'

// The Restants counterpart to RecipePickerMenu — a small picker over the
// leftovers pool, so planning a leftover onto a slot from the day editor reads
// the same as picking a recipe ("Choisir un reste" beside "Choisir une
// recette"). No cookability ranking (a leftover is already cooked); just a
// filter-as-you-type once the pool is long enough to need it. onPick consumes
// the chosen leftover into the slot (it leaves the pool, badged Restants).
export function LeftoverPickerMenu({
  leftovers,
  onPick,
}: {
  leftovers: Leftover[]
  onPick: (leftover: Leftover) => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return leftovers
    return leftovers.filter((l) => l.title.toLowerCase().includes(needle))
  }, [leftovers, q])

  return (
    <div className="recipe-picker">
      {/* The pool is usually short — only surface a search box once it isn't. */}
      {leftovers.length > 6 && (
        <input
          className="input recipe-picker__search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.recipes.search}
          aria-label={t.recipes.search}
        />
      )}
      {shown.length === 0 ? (
        <p className="recipe-picker__empty mono">{t.kitchen.leftoversEmpty}</p>
      ) : (
        <ul className="recipe-picker__list">
          {shown.map((l) => (
            <li key={l.id}>
              <button type="button" className="recipe-picker__row" onClick={() => onPick(l)}>
                <span className="recipe-picker__title">
                  <InlineIcon name="arrow-counter-clockwise-bold" size={13} color="var(--terracotta-deep)" /> {l.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
