import { useCallback, useEffect, useState } from 'react'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { api, ApiError } from './api'
import { enqueue, onOutboxChange, outboxCount } from './outbox'
import { isGuest } from './device'
import { A_REGLER_KEY } from './queryKeys'

// « À régler » (the board heads-up card, functions/api/a-regler) is a cross-domain
// scan DERIVED from events (driverless rides), meals (empty/low suppers), pantry
// (running-low items), recipes (a supper's ingredients), and people (birthdays with
// no gift idea). A write to any of those changes what the card shows, so we always
// invalidate it alongside the call site's own keys — centralized here so every
// current AND future write site stays in sync without each having to remember
// A_REGLER_KEY (the card otherwise lagged up to its 5-min poll). Mirrors the
// server-side keysForPath map in functions/_lib/realtime.ts — keep the two in step.
const A_REGLER_PATHS = new Set(['events', 'meals', 'pantry', 'recipes', 'cercle', 'members', 'capture'])

// The affected keys for this write, plus A_REGLER_KEY when the path feeds the card.
function withAReglerKeys(path: string, keys: QueryKey[]): QueryKey[] {
  const seg = (path || '').split('?')[0].replace(/^\/+/, '').split('/')[0]
  return A_REGLER_PATHS.has(seg) ? [...keys, A_REGLER_KEY] : keys
}

// The offline-aware write helper (NFR-OFFLINE-1). Replaces the scattered
// `api(…,{method}).catch().finally(invalidate)` pattern with one path that:
//   1. applies the optimistic cache change immediately,
//   2. sends the write online, OR queues it to the outbox when offline / on a
//      transport failure (it will replay on reconnect with an idempotency key),
//   3. invalidates the affected keys so the live poll reconciles.
// A real SERVER rejection (ApiError) is NOT queued — the server was reachable and
// said no; it rethrows so the caller can react (most just let invalidate refetch).

function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `k-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
  }
}

export interface WriteSpec {
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  // Keys to refetch once the write lands (online: now; offline: after replay).
  // Usually the same keys the call site used to invalidate.
  affectedKeys?: QueryKey[]
  // Optimistic cache mutation applied immediately. Offline creates should write a
  // temp row (e.g. id `tmp-${something}`); invalidate reconciles it after replay.
  optimistic?: (qc: QueryClient) => void
  // The optimistic temp row's id, when this CREATE wrote one (E-41). If the write
  // ends up queued, the outbox uses it to rewrite later queued ops that target the
  // tmp id once the create replays and the real id is known — so "add offline,
  // then act on it offline" no longer drops the follow-up.
  tmpId?: string
}

export type WriteResult<T> = { data: T; queued: false } | { data: null; queued: true }

// The offline-aware write, given a query client. `useWrite` wraps this for
// components; pure-`qc` modules (e.g. kitchen/mealMutations) call it directly.
export async function writeWith<T = unknown>(
  qc: QueryClient,
  path: string,
  spec: WriteSpec = {},
): Promise<WriteResult<T>> {
  const method = spec.method ?? 'POST'
  const affectedKeys = withAReglerKeys(path, spec.affectedKeys ?? [])

  // Read-only guest session: refuse every write at the single chokepoint. We do
  // NOT apply the optimistic change, hit the network, or queue to the outbox — so
  // a guest can never see a row "disappear" then reappear (the bug that let it
  // look like a delete went through). The UI also hides mutating controls for a
  // guest; this is the structural backstop for any control that slips through.
  if (isGuest()) return { data: null as T, queued: false }

  spec.optimistic?.(qc)

  const queue = async (): Promise<WriteResult<T>> => {
    await enqueue({ id: uuid(), key: uuid(), path, method, body: spec.body, affectedKeys, createdAt: Date.now(), tmpId: spec.tmpId })
    return { data: null, queued: true }
  }

  // Fast path: known offline → don't even attempt the network.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      return await queue()
    } finally {
      affectedKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
    }
  }

  try {
    const data = await api<T>(path, { method, body: spec.body })
    return { data, queued: false }
  } catch (err) {
    // A network/transport failure rejects with a non-ApiError (TypeError) — queue
    // it. An ApiError means the server answered (4xx/5xx): a real error, surface
    // it (the optimistic change is corrected by the invalidate below).
    if (err instanceof ApiError) throw err
    return await queue()
  } finally {
    affectedKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
  }
}

export function useWrite() {
  const qc = useQueryClient()
  return useCallback(
    <T = unknown>(path: string, spec: WriteSpec = {}): Promise<WriteResult<T>> => writeWith<T>(qc, path, spec),
    [qc],
  )
}

// Pending-write count for the offline banner, kept live via the outbox pub/sub.
export function useOutboxCount(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    const refresh = () => void outboxCount().then((c) => alive && setN(c))
    refresh()
    return onOutboxChange(refresh)
  }, [])
  return n
}
