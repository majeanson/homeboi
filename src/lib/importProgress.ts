import { useEffect, useState } from 'react'

// The recipe form's « something is happening » line (RecipeForm, 2026-10-27). An import
// is ONE request the server spends up to 45 s on, so there is no progress to measure —
// but there IS an honest thing to say about each stretch of it, because the server's
// doors run in a known order (functions/api/recipe-import.ts): our own fetch, given up
// after 15 s → Browser Run (a real headless browser) → the text organised, by a model
// when the page carries no recipe data. The phases below are named after that order and
// the time spent, never after a result we do not have yet.

/** What the import was given: a link, pasted text, or a page the bookmark captured. */
export type ImportKind = 'url' | 'text' | 'page'
/** The stage line's phase — each one a `t.recipes.stage*` string. */
export type ImportStage = 'linkFetch' | 'linkRead' | 'linkSlow' | 'pasteAi' | 'paste' | 'bookmark' | 'long'

/** The phase after `s` whole seconds. `ai`: whether a model can be organising the text at
 *  all — with AI off the paste/bookmark reads are a heuristic, and saying « l'IA » there
 *  would be the one dishonest line. */
export function importStage(kind: ImportKind, s: number, ai: boolean): ImportStage {
  if (s >= 30) return 'long'
  if (kind === 'url') return s < 4 ? 'linkFetch' : s < 16 ? 'linkRead' : 'linkSlow'
  if (s >= 8 && ai) return 'pasteAi'
  return kind === 'text' ? 'paste' : 'bookmark'
}

/** Whole seconds since `active` last turned true; 0 while inactive. One 1 s interval
 *  while active, none otherwise. */
export function useElapsed(active: boolean): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    const id = setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => {
      clearInterval(id)
      setS(0)
    }
  }, [active])
  return active ? s : 0
}
