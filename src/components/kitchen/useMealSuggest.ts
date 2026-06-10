import { useState } from 'react'
import { api, isStatus } from '../../lib/api'
import { type Recipe } from '../../lib/recipes'
import { type AiWake } from './useAiWake'

// Supper ideas, extracted from the Kitchen page: a batch of AI suggestions + a
// cursor into it — each click shows the next without re-asking, until the batch
// (10) is used up, then a click fetches a new one. AI off → cycle the family's
// own recipe book instead of hiding (NFR-DEGRADE-1). The button never dead-ends.
export function useMealSuggest(recipes: Recipe[], ai: AiWake) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestIdx, setSuggestIdx] = useState(0)
  const [suggesting, setSuggesting] = useState(false)

  const suggestion = suggestions[suggestIdx] ?? null

  // Cycle the family's own recipe titles as suggestions (the AI-off fallback, and
  // a way to resurface the book). Returns true if it had anything to show.
  function suggestFromBook(): boolean {
    if (!recipes.length) return false
    setSuggestions(recipes.map((r) => r.title))
    setSuggestIdx(0)
    return true
  }

  async function suggest() {
    // Still ideas left in the batch? Just advance — no new AI call.
    if (suggestions.length && suggestIdx < suggestions.length - 1) {
      setSuggestIdx((i) => i + 1)
      return
    }
    // AI already known off → just cycle the recipe book (or re-loop the batch).
    if (ai.aiUnavailable) {
      if (!suggestFromBook()) setSuggestIdx(0)
      return
    }
    setSuggesting(true)
    ai.aiStart()
    try {
      // Send the batch just seen so the model returns DIFFERENT dishes.
      const res = await api<{ suggestions: string[] }>('suggest-meal', {
        method: 'POST',
        body: { avoid: suggestions },
      })
      if (res.suggestions.length) {
        setSuggestions(res.suggestions)
        setSuggestIdx(0)
      } else if (!suggestFromBook()) {
        // Nothing new came back — re-loop the current batch so the button never
        // dead-ends after the tenth idea.
        setSuggestIdx(0)
      }
    } catch (e) {
      // No AI binding → fall back to the household's own recipes instead of hiding.
      if (isStatus(e, 503)) {
        ai.markAiUnavailable()
        if (!suggestFromBook()) setSuggestIdx(0)
      } else {
        // Other hiccup → don't strand the user; re-loop what we have.
        setSuggestIdx(0)
      }
    } finally {
      setSuggesting(false)
      ai.aiDone()
    }
  }

  return { suggestion, suggesting, suggest }
}
