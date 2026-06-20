import { useEffect, useRef } from 'react'

// Hold a Screen Wake Lock for the lifetime of the calling component, re-acquiring
// when the tab becomes visible again (locks drop on hide). Silent no-op where the
// API is missing or denied — the screen just behaves normally. Used by the
// full-screen cook surfaces (CookMode, MultiCookMode) so a wall tablet doesn't
// sleep mid-recipe. Extracted from CookMode so every cook surface shares it.
export function useWakeLock(): void {
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null)
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    let cancelled = false
    async function acquire() {
      try {
        if (!nav.wakeLock) return
        const lock = await nav.wakeLock.request('screen')
        if (cancelled) {
          lock.release().catch(() => {})
          return
        }
        lockRef.current = lock
      } catch {
        /* denied / unsupported — fine, behave like a normal screen */
      }
    }
    acquire()
    const onVis = () => {
      if (document.visibilityState === 'visible' && !lockRef.current) acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [])
}
