import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Closing a routed full-screen scene (cashier, circulaires, recipe, cook…). The
// old overlay onClose just unmounted; a route has to navigate. Pop history when
// there's something in-app to pop back to — so the ✕ button and the iOS
// back-swipe agree — and fall back to the parent route on a cold deep-link entry
// (react-router stamps `location.key === 'default'` on the first in-app entry,
// i.e. nothing was pushed before it).
export function useSceneClose(fallback: string): () => void {
  const nav = useNavigate()
  const loc = useLocation()
  return useCallback(() => {
    if (loc.key !== 'default') nav(-1)
    else nav(fallback, { replace: true })
  }, [nav, loc.key, fallback])
}

// Escape closes a routed scene (the ✕ / back-swipe are the touch paths; this is
// the keyboard one). `enabled` lets a scene defer to a nested overlay that owns
// Escape itself (e.g. DealsBrowser while its FlyerViewer is open) so one keypress
// doesn't collapse both layers at once.
export function useEscapeKey(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, enabled])
}
