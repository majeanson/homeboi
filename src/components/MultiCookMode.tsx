import { useState } from 'react'
import { type Recipe } from '../lib/recipes'
import { CookMode } from './CookMode'

// #43 — "Cuisiner ensemble": cook SEVERAL of today's planned dishes at once. Rather
// than cramped side-by-side columns (which read poorly on a tablet), each dish gets
// the FULL cook mode — its own layout (Recette / Côte à côte / Focus), text size,
// read-aloud, gather checklist and timer rail — and you flip between them with a
// small sub-tab row under the display controls (rendered by CookMode's `siblings`).
//
// Every dish stays MOUNTED (hidden, not unmounted), so switching tabs never loses
// your place or kills a running timer: a countdown you started on dish A keeps
// ticking and still chimes aloud while you read dish B. Reuse over reinvention —
// this is just CookMode wired up N times.
export function MultiCookMode({ recipes, onClose }: { recipes: Recipe[]; onClose: () => void }) {
  const [active, setActive] = useState(0)
  const titles = recipes.map((r) => r.title)
  return (
    <>
      {recipes.map((r, i) => (
        <CookMode
          key={r.id}
          recipe={r}
          onClose={onClose}
          hidden={i !== active}
          siblings={{ titles, active, onSwitch: setActive }}
        />
      ))}
    </>
  )
}
