import { useMemo, useState } from 'react'
import { api, isStatus } from '../../lib/api'
import { rankCookable } from '../../lib/cookable'
import { type Recipe } from '../../lib/recipes'
import { type AiWake } from './useAiWake'

// Two DISTINCT supper-idea sources, never blended (the old version silently fell
// back from AI to the book, which muddied "where did this come from?"):
//   • suggestAi()         — fresh AI dishes (suggest-meal, a batch of 10 shown
//                           one per click; only re-asks when exhausted → 1 call).
//   • suggestFromRecipes() — the family's OWN recipes, ranked by what's in stock
//                           now (rankCookable: fewest missing staples first). No
//                           AI, no network — just surfaces a real recipe you can
//                           open + plan, with how many staples it's missing.
// Each click shows ONE suggestion; `current.source` says which button made it.
export type SuggestSource = 'ai' | 'book'
export interface MealSuggestion {
  title: string
  source: SuggestSource
  recipe?: Recipe // present for 'book' — so the line can open/plan the real card
  missing?: number // 'book' only: how many staples it's short
}

export function useMealSuggest(recipes: Recipe[], ai: AiWake, lowItems: string[], listItems: string[]) {
  const [current, setCurrent] = useState<MealSuggestion | null>(null)
  // AI batch + a cursor into it.
  const [aiBatch, setAiBatch] = useState<string[]>([])
  const [aiIdx, setAiIdx] = useState(0)
  const [aiBusy, setAiBusy] = useState(false)
  // Book cursor (into the cookable-ranked list).
  const [bookIdx, setBookIdx] = useState(-1)

  // Fresh AI ideas. Advance through the current batch first; only hit the API
  // once it's used up (NFR-COST). 503 → mark AI off; the button then disables.
  async function suggestAi() {
    if (aiBatch.length && aiIdx < aiBatch.length - 1) {
      const i = aiIdx + 1
      setAiIdx(i)
      setCurrent({ title: aiBatch[i], source: 'ai' })
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
        setCurrent({ title: res.suggestions[0], source: 'ai' })
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
    const i = current?.source === 'book' ? (bookIdx + 1) % cookable.length : 0
    setBookIdx(i)
    const { recipe, missing } = cookable[i]
    setCurrent({ title: recipe.title, source: 'book', recipe, missing: missing.length })
  }

  function clear() {
    setCurrent(null)
  }

  return {
    current,
    aiBusy,
    aiOff: ai.aiUnavailable,
    hasRecipes: recipes.length > 0,
    suggestAi,
    suggestFromRecipes,
    clear,
  }
}
