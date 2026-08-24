import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// Persist an in-page sub-tab selection in the URL (?<key>=<value>), so the tab
// survives a remount. The case this fixes: opening a full-screen add/edit scene
// from a sub-tab (e.g. add a recipe from La cuisine → Recettes) and coming back.
// useSceneClose pops history (nav(-1)), which restores this exact URL — including
// the tab — instead of the page remounting to its default tab. Deep links
// (/kitchen?tab=recipes, /settings?tab=maison) and the browser back/forward
// button work for free.
//
// Writes use { replace: true } so flipping between tabs doesn't pile entries into
// history (the back button leaves the page, it doesn't walk back through tabs).
// The default value is stored as NO param, keeping the common URL clean and
// making a paramless visit land on the default tab.
export function useTabParam<T extends string>(
  key: string,
  fallback: T,
  valid: readonly T[],
): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const value = (raw && (valid as readonly string[]).includes(raw) ? raw : fallback) as T
  const setValue = useCallback(
    (v: T) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (v === fallback) next.delete(key)
          else next.set(key, v)
          return next
        },
        { replace: true },
      )
    },
    [key, fallback, setParams],
  )
  return [value, setValue]
}
