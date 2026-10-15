import { type Dispatch, type SetStateAction, useState } from 'react'

// `useState` that survives the component unmounting — a scene route (open a recipe,
// press back) tears the hub tab down, and with it every filter the reader had set.
// Module memory only: it outlives navigation, not a reload, so nothing stale lingers.
const kept = new Map<string, unknown>()

export function useKept<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (kept.has(key) ? (kept.get(key) as T) : typeof initial === 'function' ? (initial as () => T)() : initial))
  const set: Dispatch<SetStateAction<T>> = (next) =>
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      kept.set(key, v)
      return v
    })
  return [value, set]
}
