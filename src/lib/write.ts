import { useCallback, useEffect, useState } from 'react'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { api, ApiError } from './api'
import { enqueue, onOutboxChange, outboxCount } from './outbox'

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
  const affectedKeys = spec.affectedKeys ?? []
  spec.optimistic?.(qc)

  const queue = async (): Promise<WriteResult<T>> => {
    await enqueue({ id: uuid(), key: uuid(), path, method, body: spec.body, affectedKeys, createdAt: Date.now() })
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
