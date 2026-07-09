import { useState } from 'react'
import { api, isStatus } from '../../lib/api'
import { type AiWake } from './useAiWake'

// « Idées de l'IA » (C-14, bmad/10) — a batch of fresh AI supper names, shown as
// ROWS in the IdeasDrawer's 🤖 chip (not the old one-card-at-a-time cursor: the
// whole batch is worth glancing at once). `refresh` asks for a NEW batch (avoiding
// the titles already shown, so "Une autre" never repeats); the batch stays until
// the drawer/chip re-asks. 503 → AI is off for the session; the caller degrades
// (the chip hides — NFR-DEGRADE-1). This used to also rank the family's OWN
// recipes (book/useup) — that's dropped now: "Quoi cuisiner ?" already covers
// cookable-ranked recipes on the Recettes tab, and the 🧊 "À écouler" chip computes
// its own `rankUseSoon` shortlist directly, so a THIRD ranking mechanism here was
// pure duplication.
export function useMealSuggest(ai: AiWake) {
  const [batch, setBatch] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function refresh() {
    if (ai.aiUnavailable) return
    setBusy(true)
    ai.aiStart()
    try {
      const res = await api<{ suggestions: string[] }>('suggest-meal', { method: 'POST', body: { avoid: batch } })
      setBatch(res.suggestions)
    } catch (e) {
      if (isStatus(e, 503)) ai.markAiUnavailable()
    } finally {
      setBusy(false)
      ai.aiDone()
    }
  }

  return { batch, busy, aiOff: ai.aiUnavailable, refresh }
}
