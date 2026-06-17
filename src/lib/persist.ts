// Cold-reboot offline (NFR-OFFLINE-1): persist the TanStack Query cache to
// IndexedDB so a kiosk that reboots with NO network still shows the last-known
// board, agenda, lists and recipes — not just the empty shell. The service worker
// caches the app shell + images; this caches the DATA behind them.
//
// Dependency-free on purpose: TanStack ships dehydrate/hydrate, and a one-key IDB
// store is a few lines. We snapshot on cache changes (debounced) and restore once
// at boot, before first paint. Cleared on auth-loss so a revoked device keeps no
// household snapshot on disk.
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'

const DB = 'babillard'
const STORE = 'cache'
const KEY = 'rq'
const MAX_AGE = 24 * 60 * 60 * 1000 // don't restore data older than a day

interface Snapshot {
  at: number
  state: unknown
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function idbGet(): Promise<Snapshot | null> {
  return idb().then(
    (db) =>
      new Promise<Snapshot | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
          req.onsuccess = () => resolve((req.result as Snapshot) ?? null)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

function idbSet(value: Snapshot): Promise<void> {
  return idb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve()
        try {
          const tx = db.transaction(STORE, 'readwrite')
          tx.objectStore(STORE).put(value, KEY)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch {
          resolve()
        }
      }),
  )
}

function idbDel(): Promise<void> {
  return idb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve()
        try {
          const tx = db.transaction(STORE, 'readwrite')
          tx.objectStore(STORE).delete(KEY)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch {
          resolve()
        }
      }),
  )
}

// Restore a previous snapshot into the client. Call BEFORE first render so cached
// data paints immediately on a cold offline boot. No-op if absent / too old /
// shape-drifted across a deploy (the live queries refill once back online).
export async function restorePersistedCache(qc: QueryClient): Promise<void> {
  const snap = await idbGet()
  if (!snap || typeof snap.at !== 'number' || Date.now() - snap.at > MAX_AGE) return
  try {
    hydrate(qc, snap.state as never)
  } catch {
    /* ignore — stale shape, queries will refill */
  }
}

// Snapshot the cache on changes, debounced. Dehydrates only SUCCESSFUL queries so
// we never persist a loading/error frame as if it were good data.
export function startPersistingCache(qc: QueryClient): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    timer = null
    try {
      const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === 'success' })
      void idbSet({ at: Date.now(), state })
    } catch {
      /* noop */
    }
  }
  qc.getQueryCache().subscribe(() => {
    if (timer) return
    timer = setTimeout(save, 1500)
  })
}

// Wipe persisted data — call when this device loses auth, so a revoked kiosk or a
// logged-out phone keeps no household snapshot on disk.
export function clearPersistedCache(): void {
  void idbDel()
}
