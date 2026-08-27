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
  // Idempotency key sent on replay — B-9 (bmad/10): the SAME key writeWith already
  // tried on its (failed) online attempt, not a fresh one minted here, so a replay
  // after a lost response dedups against that attempt instead of double-applying.
  key: string
  path: string
  method: string
  body?: unknown
  affectedKeys: QueryKey[] // invalidated once the write lands (after replay)
  createdAt: number
  // E-41 (temp-id chain): the optimistic `tmp-…` row id this CREATE stood in for.
  // When the create replays and the server answers with the real id, every later
  // queued op that still targets the tmp id is rewritten to the real one — so
  // "add offline, then check/edit/delete it offline" no longer drops the follow-up.
  tmpId?: string
  // How many times the SERVER has answered this entry with a 5xx. Only server
  // failures count (a network failure is the connection's fault, not this
  // entry's), and past MAX_ATTEMPTS the entry is dead-lettered — see replayVerdict.
  // Absent on entries queued before this field existed; read as 0.
  attempts?: number
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    // Settle once. On iOS/WebKit a fresh-launch open can hang with no callback, or
    // fire `onblocked` and stall — resolve either way so replay is never wedged
    // (mirrors the guard in persist.ts).
    let settled = false
    const done = (db: IDBDatabase | null) => {
      if (settled) return
      settled = true
      resolve(db)
    }
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => done(req.result)
      req.onerror = () => done(null)
      req.onblocked = () => done(null)
      setTimeout(() => done(null), 3000)
    } catch {
      done(null)
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

async function allEntries(): Promise<OutboxEntry[]> {
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

// E-41 helpers — pure + exported for unit tests.
// The created row's server id, from the create endpoint's response. Every create
// here answers `{ id }` at the top level (list, todos); tolerate one level of
// nesting (`{ item: { id } }`) for future endpoints. Null → no rewrite (status quo).
export function extractCreatedId(res: unknown): string | null {
  if (!res || typeof res !== 'object') return null
  const o = res as Record<string, unknown>
  if (typeof o.id === 'string') return o.id
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string')
      return (v as { id: string }).id
  }
  return null
}

// Substitute the tmp id for the real one wherever a queued op references it — the
// path (`list/tmp-…`) or anywhere in the body (`{id: 'tmp-…'}`, ids arrays). Tmp
// ids are `tmp-[a-z0-9-]+` (no JSON-special characters), so a string-level replace
// on the serialized body is exact. Untouched entries are returned as-is.
export function rewriteTmpId(e: OutboxEntry, tmpId: string, realId: string): OutboxEntry {
  const inPath = e.path.includes(tmpId)
  const bodyStr = e.body === undefined ? '' : JSON.stringify(e.body)
  const inBody = bodyStr.includes(tmpId)
  if (!inPath && !inBody) return e
  return {
    ...e,
    path: inPath ? e.path.split(tmpId).join(realId) : e.path,
    body: inBody ? (JSON.parse(bodyStr.split(tmpId).join(realId)) as unknown) : e.body,
  }
}

// A replay run dropped entries the server rejected (4xx). The ToastProvider
// registers a notifier so the user hears about it ONCE per run (a calm line, not
// per-entry spam) — before this, queued offline writes could vanish silently.
let replayRejectedNotifier: ((count: number) => void) | null = null
// The startup replay can finish before the provider mounts — hold the count and
// flush it on registration so that first run's drops aren't silent either.
let pendingRejected = 0
export function setReplayRejectedNotifier(fn: ((count: number) => void) | null): void {
  replayRejectedNotifier = fn
  if (fn && pendingRejected > 0) {
    const n = pendingRejected
    pendingRejected = 0
    fn(n)
  }
}
function notifyReplayRejected(count: number): void {
  if (replayRejectedNotifier) replayRejectedNotifier(count)
  else pendingRejected += count
}

// How many SERVER failures one entry gets before it's dead-lettered. Each attempt
// needs its own replay trigger (reconnect / tab focus / app start), so five is a
// long time in practice — a server that's merely down for an afternoon doesn't
// burn through them, but a write the server will NEVER accept can't wedge the
// queue forever either.
export const MAX_ATTEMPTS = 5

export type ReplayVerdict =
  | 'auth-lost' // 401 — the device/session is revoked; stop, the auth-lost path clears the queue
  | 'drop' // 4xx — moot write (row gone/forbidden/conflicting); the poll reconciles
  | 'dead-letter' // 5xx past MAX_ATTEMPTS — the server will not take this one; let the rest through
  | 'retry' // 5xx under the cap — stop the run, count the attempt, try next trigger
  | 'wait' // network/transport failure — stop the run, DON'T count it against this entry

// What to do with one failed replay. Pure + exported so the policy is unit-tested
// without an IndexedDB round-trip (the loop itself is covered by e2e).
//
// The bug this exists for: FIFO order is load-bearing here (the E-41 tmp-id chain
// means entry N+1 can reference what entry N creates), so the loop `break`s on any
// server error and resumes next trigger. One entry the server permanently 500s
// therefore blocked EVERY write queued behind it, forever and silently. Bounded
// attempts turn that into "this one write is reported lost, the rest land".
export function replayVerdict(err: unknown, priorAttempts: number): ReplayVerdict {
  if (!(err instanceof ApiError)) return 'wait' // fetch threw: no server answer at all
  if (err.status === 401) return 'auth-lost'
  if (err.status >= 400 && err.status < 500) return 'drop'
  return priorAttempts + 1 >= MAX_ATTEMPTS ? 'dead-letter' : 'retry'
}

// Replay the queue in FIFO order. Stops (keeping order) on a transient failure so
// it can resume next trigger; drops an entry the server rejects as moot (4xx — the
// row's gone/forbidden/conflicting), since the live poll will reconcile the cache,
// and dead-letters one the server keeps 5xx-ing so it can't wedge the queue.
let replaying = false
async function replayOutbox(qc: QueryClient): Promise<void> {
  if (replaying) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  replaying = true
  const touched = new Set<string>()
  let rejected = 0
  try {
    const entries = await allEntries()
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      try {
        const res = await api(e.path, { method: e.method, body: e.body, idempotencyKey: e.key, replay: true })
        await remove(e.id)
        e.affectedKeys.forEach((k) => touched.add(JSON.stringify(k)))
        // E-41: this create stood in for a tmp row — patch the real id into every
        // later queued op still aimed at the tmp one (path or body), and persist
        // the rewrite so a mid-replay interruption doesn't lose it.
        const realId = e.tmpId ? extractCreatedId(res) : null
        if (e.tmpId && realId) {
          for (let j = i + 1; j < entries.length; j++) {
            const rewritten = rewriteTmpId(entries[j], e.tmpId, realId)
            if (rewritten !== entries[j]) {
              entries[j] = rewritten
              await tx('readwrite', (s) => s.put(rewritten))
            }
          }
        }
      } catch (err) {
        const verdict = replayVerdict(err, e.attempts ?? 0)
        if (verdict === 'auth-lost') {
          // Device/session revoked — these will never succeed. Let the auth-lost
          // path handle it (it clears the outbox); stop here.
          emitAuthLost()
          break
        }
        if (verdict === 'drop' || verdict === 'dead-letter') {
          // 'drop' = moot write (the poll reconciles). 'dead-letter' = the server
          // kept failing this ONE entry; we let it go so everything queued behind
          // it can land on this same run. Both are counted into the single calm
          // "some offline changes couldn't be saved" line — never silent.
          await remove(e.id)
          rejected++
          e.affectedKeys.forEach((k) => touched.add(JSON.stringify(k)))
          continue
        }
        // 'retry' — the server answered 5xx but this entry still has attempts
        // left; remember the attempt so it can't retry forever. ('wait' means the
        // network failed with no server answer: not this entry's fault, so it
        // keeps its full budget.)
        if (verdict === 'retry') await tx('readwrite', (s) => s.put({ ...e, attempts: (e.attempts ?? 0) + 1 }))
        break // keep FIFO order, resume on the next trigger
      }
    }
  } finally {
    replaying = false
    touched.forEach((k) => qc.invalidateQueries({ queryKey: JSON.parse(k) as QueryKey }))
    if (rejected > 0) notifyReplayRejected(rejected)
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
