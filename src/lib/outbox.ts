import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { api, ApiError } from './api'
import { emitAuthLost } from './authEvents'

// The offline write queue (NFR-OFFLINE-1). Writes made while offline are appended
// here (IndexedDB, survives reboot) and REPLAYED in order on reconnect. Each entry
// carries the Idempotency-Key the server dedups on (functions/_lib/idempotency.ts),
// so a replay never double-applies. Its own IndexedDB (separate from the query-
// cache DB in persist.ts) to avoid version-coordination between the two stores.
const DB = 'babillard-outbox'
const STORE = 'q'

export interface OutboxEntry {
  id: string // queue entry id (FIFO by createdAt)
  key: string // idempotency key sent on replay
  path: string
  method: string
  body?: unknown
  affectedKeys: QueryKey[] // invalidated once the write lands (after replay)
  createdAt: number
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return idb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result as T)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

// Tiny pub/sub so the offline banner can reflect the pending count live.
const listeners = new Set<() => void>()
export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const notify = () => listeners.forEach((l) => l())

export async function enqueue(e: OutboxEntry): Promise<void> {
  await tx('readwrite', (s) => s.put(e))
  notify()
}

export async function allEntries(): Promise<OutboxEntry[]> {
  const r = await tx<OutboxEntry[]>('readonly', (s) => s.getAll())
  return (r ?? []).sort((a, b) => a.createdAt - b.createdAt)
}

export async function outboxCount(): Promise<number> {
  return (await allEntries()).length
}

async function remove(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
  notify()
}

export async function clearOutbox(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
  notify()
}

// Replay the queue in FIFO order. Stops (keeping order) on a transient failure so
// it can resume next trigger; drops an entry the server rejects as moot (4xx — the
// row's gone/forbidden/conflicting), since the live poll will reconcile the cache.
let replaying = false
export async function replayOutbox(qc: QueryClient): Promise<void> {
  if (replaying) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  replaying = true
  const touched = new Set<string>()
  try {
    for (const e of await allEntries()) {
      try {
        await api(e.path, { method: e.method, body: e.body, idempotencyKey: e.key })
        await remove(e.id)
        e.affectedKeys.forEach((k) => touched.add(JSON.stringify(k)))
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // Device/session revoked — these will never succeed. Let the auth-lost
          // path handle it (it clears the outbox); stop here.
          emitAuthLost()
          break
        }
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          await remove(e.id) // moot write; cache reconciles on the next poll
          e.affectedKeys.forEach((k) => touched.add(JSON.stringify(k)))
          continue
        }
        break // 5xx / network — keep order, retry on the next trigger
      }
    }
  } finally {
    replaying = false
    touched.forEach((k) => qc.invalidateQueries({ queryKey: JSON.parse(k) as QueryKey }))
  }
}

// Replay on reconnect, on tab re-focus, and once at startup (drain a prior session).
export function startOutbox(qc: QueryClient): void {
  if (typeof window === 'undefined') return
  const trigger = () => void replayOutbox(qc)
  window.addEventListener('online', trigger)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') trigger()
  })
  trigger()
}
