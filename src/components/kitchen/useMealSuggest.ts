import { useMemo, useState } from 'react'
import { api, isStatus } from '../../lib/api'
import { rankCookable, rankUseSoon } from '../../lib/cookable'
import { type Recipe } from '../../lib/recipes'
import { type AiWake } from './useAiWake'

// Three DISTINCT supper-idea sources, never blended (the old version silently fell
// back from AI to the book, which muddied "where did this come from?"):
//   • suggestAi()         — fresh AI dishes (suggest-meal, a batch of 10 shown
//                           one per click; only re-asks when exhausted → 1 call).
//   • suggestFromRecipes() — the family's OWN recipes, ranked by what's in stock
//                           now (rankCookable: fewest missing staples first). No
//                           AI, no network — just surfaces a real recipe you can
//                           open + plan, with how many staples it's missing.
//   • suggestUseUp()       — the OWN recipes again, but ranked by how many of your
//                           "à utiliser bientôt" items they'd finish (rankUseSoon,
//                           most first). A "this uses up the spinach + the cream"
//                           nudge; only recipes that use ≥1 soon item are offered.
// Each source keeps its OWN card now (`bySource`), so pressing AI then Book shows
// BOTH answers stacked, instead of the second silently replacing the first — you
// can compare ideas. again(source) re-runs just that source's card; clear(source)
// dismisses just it. The AI batch/cursor + each book/use-up cursor stay internal.
export type SuggestSource = 'ai' | 'book' | 'useup'
export interface MealSuggestion {
  title: string
  source: SuggestSource
  recipe?: Recipe // present for 'book'/'useup' — so the line can open/plan the real card
  missing?: number // 'book' only: how many staples it's short
  uses?: number // 'useup' only: how many soon-to-use items it finishes
}

// Stable display order for the stacked cards, regardless of which was asked first.
const ORDER: SuggestSource[] = ['ai', 'book', 'useup']

export function useMealSuggest(
  recipes: Recipe[],
  ai: AiWake,
  lowItems: string[],
  listItems: string[],
  soonItems: string[],
) {
  // One card slot per source — null until that source is asked, so several can
  // coexist on screen at once.
  const [bySource, setBySource] = useState<Record<SuggestSource, MealSuggestion | null>>({
    ai: null,
    book: null,
    useup: null,
  })
  const setOne = (s: SuggestSource, v: MealSuggestion | null) => setBySource((p) => ({ ...p, [s]: v }))
  // AI batch + a cursor into it.
  const [aiBatch, setAiBatch] = useState<string[]>([])
  const [aiIdx, setAiIdx] = useState(0)
  const [aiBusy, setAiBusy] = useState(false)
  // Book cursor (into the cookable-ranked list).
  const [bookIdx, setBookIdx] = useState(-1)
  // Use-it-up cursor (into the use-soon-ranked list).
  const [useUpIdx, setUseUpIdx] = useState(-1)

  // Fresh AI ideas. Advance through the current batch first; only hit the API
  // once it's used up (NFR-COST). 503 → mark AI off; the button then disables.
  async function suggestAi() {
    if (aiBatch.length && aiIdx < aiBatch.length - 1) {
      const i = aiIdx + 1
      setAiIdx(i)
      setOne('ai', { title: aiBatch[i], source: 'ai' })
      return
    }
    if (ai.aiUnavailable) return
    setAiBusy(true)
    ai.aiStart()
    try {
      const res = await api<{ suggestions: string[] }>('suggest-meal', { method: 'POST', body: { avoid: aiBatch } })
      if (res.suggestions.length) {
        setAiBatch(res.suggestions)
        setAiIdx(0)
        setOne('ai', { title: res.suggestions[0], source: 'ai' })
      }
    } catch (e) {
      if (isStatus(e, 503)) ai.markAiUnavailable()
    } finally {
      setAiBusy(false)
      ai.aiDone()
    }
  }

  // Ranked once per stock change; each click steps to the next cookable recipe.
  const cookable = useMemo(() => rankCookable(recipes, lowItems, listItems), [recipes, lowItems, listItems])
  function suggestFromRecipes() {
    if (!cookable.length) return
    const i = bySource.book ? (bookIdx + 1) % cookable.length : 0
    setBookIdx(i)
    const { recipe, missing } = cookable[i]
    setOne('book', { title: recipe.title, source: 'book', recipe, missing: missing.length })
  }

  // Recipes that would finish what you flagged "à utiliser bientôt", most first.
  // Only those that use ≥1 soon item are worth offering — the rest are noise here
  // (use the plain book button for those). Re-ranked per stock/soon change.
  const useable = useMemo(
    () => rankUseSoon(recipes, soonItems).filter((r) => r.uses.length > 0),
    [recipes, soonItems],
  )
  function suggestUseUp() {
    if (!useable.length) return
    const i = bySource.useup ? (useUpIdx + 1) % useable.length : 0
    setUseUpIdx(i)
    const { recipe, uses } = useable[i]
    setOne('useup', { title: recipe.title, source: 'useup', recipe, uses: uses.length })
  }

  // Re-ask ONE source for another idea (the card's own "Encore" affordance, so a
  // next idea doesn't mean re-opening the ＋ Add sheet).
  function again(source: SuggestSource) {
    if (source === 'ai') suggestAi()
    else if (source === 'useup') suggestUseUp()
    else suggestFromRecipes()
  }

  // Dismiss one card; the others (and their cursors) stay put.
  function clear(source: SuggestSource) {
    setOne(source, null)
  }

  // The visible cards, in a stable source order (not ask order) so the stack
  // doesn't reshuffle as you press buttons.
  const cards = ORDER.map((s) => bySource[s]).filter(Boolean) as MealSuggestion[]

  return {
    cards,
    aiBusy,
    aiOff: ai.aiUnavailable,
    hasRecipes: recipes.length > 0,
    hasUseUp: useable.length > 0,
    suggestAi,
    suggestFromRecipes,
    suggestUseUp,
    again,
    clear,
  }
}
