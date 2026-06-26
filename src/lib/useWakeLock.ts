import { useEffect, useRef } from 'react'

// Hold a Screen Wake Lock for the lifetime of the calling component, re-acquiring
// when the tab becomes visible again (locks drop on hide). Silent no-op where the
// API is missing or denied — the screen just behaves normally. Used by the
// full-screen cook surfaces (CookMode, MultiCookMode) so a wall tablet doesn't
// sleep mid-recipe, AND by the hub shell (HubLayout) so the board glance stays lit —
// there gated by the per-device « Keep awake » setting (lib/keepAwake), passed as
// `enabled`. When `enabled` flips false the effect re-runs and the prior run's cleanup
// has already released the lock. Defaults true so the cook surfaces keep their
// unconditional behaviour. Extracted from CookMode so every surface shares it.
export function useWakeLock(enabled: boolean = true): void {
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null)
  useEffect(() => {
    if (!enabled) return // releasing is handled by the previous run's cleanup
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
  }, [enabled])
}
