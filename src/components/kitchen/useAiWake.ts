import { useRef, useState } from 'react'

// Workers AI session health, shared by every AI-backed kitchen flow (the staples
// step and the supper suggestions) so the page shows ONE truth:
//   - aiWaking: the first call of a session cold-starts the model (10-30 s); after
//     a short wait we surface "the model's waking up" so it reads as warming, not
//     frozen. Warm calls finish before the timer fires.
//   - aiUnavailable: a 503 means no AI binding — flows fall back (recipe book,
//     plain save) instead of hiding (NFR-DEGRADE-1). Sticky for the session.
export function useAiWake() {
  const [aiWaking, setAiWaking] = useState(false)
  const [aiUnavailable, setAiUnavailable] = useState(false)
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function aiStart() {
    if (wakeTimer.current) clearTimeout(wakeTimer.current)
    wakeTimer.current = setTimeout(() => setAiWaking(true), 3500)
  }
  function aiDone() {
    if (wakeTimer.current) clearTimeout(wakeTimer.current)
    setAiWaking(false)
  }
  return { aiWaking, aiUnavailable, markAiUnavailable: () => setAiUnavailable(true), aiStart, aiDone }
}
export type AiWake = ReturnType<typeof useAiWake>
