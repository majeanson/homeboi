import { useSyncExternalStore } from 'react'

// createDeviceStore — the ONE per-device localStorage store primitive (P2-1).
//
// ~Every device-local preference (ambient/idle, board-card layout, the APOD / living-
// canvas / keep-awake band toggles, cook density + step-ingredients, OCR engine) was
// hand-rolling the SAME shape: a module `KEY`, a `listeners` Set, a lazy `cache`, and
// the read/snapshot/subscribe/`useSyncExternalStore` quartet — ~30–60 LOC each, only
// the key + default + (de)serialization differing. This collapses that boilerplate to
// one line per store while keeping each store's own domain logic (merge/clamp/reconcile)
// as a thin `read` function.
//
// These are DEVICE preferences (a wall kiosk and a phone keep their own), never
// household data — the shared, meaningful state lives server-side. Read live via
// useSyncExternalStore so a change in Réglages applies without a reload. Structural calm
// is untouched: a store only ever holds a display preference, never a count/streak.
//
//   const store = createDeviceStore('babillard-apod', true, {
//     read: (raw) => raw !== '0',          // unset / anything-but-"0" = ON
//     write: (v) => (v ? '1' : '0'),
//   })
//   export const useApod = store.use
//   export const setApod = store.set
//
// For an OBJECT store, omit `read`/`write` to get JSON + a shallow merge-over-defaults
// (so a field added to the defaults later is never `undefined` on an existing device);
// pass a custom `read` when you need reconcile-on-read or value clamping. `set` REPLACES
// the value — object stores wrap it with a thin `setX(patch)` that merges first.

export interface DeviceStore<T> {
  /** The current value (lazily read from localStorage once, then cached). */
  get: () => T
  /** Live React subscription — re-renders when the value changes on this device. */
  use: () => T
  /** Replace the stored value and notify subscribers. */
  set: (value: T) => void
  /** Clear back to the default (removes the key) and notify subscribers. */
  reset: () => void
}

export function createDeviceStore<T>(
  key: string,
  defaults: T,
  opts: {
    // Decode the raw localStorage string (null = unset) into a value. Default: JSON
    // parse + shallow merge over `defaults` for objects; the bare default when unset.
    read?: (raw: string | null) => T
    // Encode the value for storage. Default: JSON.stringify.
    write?: (value: T) => string
  } = {},
): DeviceStore<T> {
  const decode =
    opts.read ??
    ((raw: string | null): T =>
      raw == null ? defaults : ({ ...(defaults as object), ...(JSON.parse(raw) as object) } as T))
  const encode = opts.write ?? ((v: T) => JSON.stringify(v))

  const listeners = new Set<() => void>()
  let cache: T
  let loaded = false

  const load = (): T => {
    try {
      return decode(localStorage.getItem(key))
    } catch {
      return defaults
    }
  }
  const get = (): T => {
    if (!loaded) {
      cache = load()
      loaded = true
    }
    return cache
  }
  const emit = () => listeners.forEach((l) => l())
  // Cross-document liveness: `storage` fires only in OTHER documents sharing the
  // origin (the installed PWA vs a browser tab, two open tabs). Without this, a
  // pref flipped in one document stays stale in the rest until a full reload.
  // Attached only while someone subscribes, so idle stores cost nothing.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== key) return // null = storage.clear()
    loaded = false // drop the cache; the next get() re-reads localStorage
    emit()
  }
  const subscribe = (cb: () => void): (() => void) => {
    if (listeners.size === 0) window.addEventListener('storage', onStorage)
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
      if (listeners.size === 0) window.removeEventListener('storage', onStorage)
    }
  }

  return {
    get,
    use: () => useSyncExternalStore(subscribe, get, () => defaults),
    set: (value: T) => {
      cache = value
      loaded = true
      try {
        localStorage.setItem(key, encode(value))
      } catch {
        /* private mode — the change still holds for this session via the cache */
      }
      emit()
    },
    reset: () => {
      cache = defaults
      loaded = true
      try {
        localStorage.removeItem(key)
      } catch {
        /* noop */
      }
      emit()
    },
  }
}
