import { useCallback, useEffect, useState } from 'react'
import { partialMatchKey, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { api, ApiError } from './api'
import { enqueue, onOutboxChange, outboxCount } from './outbox'
import { isGuest } from './device'
import { A_REGLER_KEY } from './queryKeys'
import { GuestReadOnlyError } from './writeFailed'
import { keysForPath } from '../../functions/_lib/realtime'

// « À régler » (the board heads-up card, functions/api/a-regler) is a cross-domain
// scan DERIVED from events (driverless rides), meals (empty/low suppers), pantry
// (running-low items), recipes (a supper's ingredients), and people (birthdays with
// no gift idea). A write to any of those changes what the card shows, so we always
// invalidate it alongside the call site's own keys — centralized here so every
// current AND future write site stays in sync without each having to remember
// A_REGLER_KEY (the card otherwise lagged up to its 5-min poll).
//
// WHICH writes feed it is the SERVER's map (functions/_lib/realtime.ts keysForPath, a pure
// module), read here — not a second list « kept in step » by hand (review #38). The hand
// copy had drifted: a virement (transfers, transfer-plans) changes the card, and only the
// server knew, so the device that made it waited for the poll.
function withAReglerKeys(path: string, keys: QueryKey[]): QueryKey[] {
  const feedsCard = keysForPath(path).some((k) => k.length === 1 && k[0] === A_REGLER_KEY[0])
  return feedsCard ? [...keys, A_REGLER_KEY] : keys
}

// The write attempts' listeners (review #38): anything that wants to know a real write was
// attempted subscribes here, so the one function every write goes through holds no counter.
const writeListeners = new Set<() => void>()
export function onWriteAttempt(fn: () => void): () => void {
  writeListeners.add(fn)
  return () => writeListeners.delete(fn)
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
  // Optimistic cache mutation applied immediately. A create paints its row under the id it
  // sends (lib/rowId, review #39); invalidate reconciles the rest after the write lands.
  optimistic?: ((qc: QueryClient) => void) | undefined
  // Re-apply `optimistic` to any fresh frame that lands for an affected key WHILE the
  // write is still travelling. Opt-in, and only for an IDEMPOTENT change (set a flag,
  // not insert a row — spliceListLine run twice would add the line twice). The case
  // it closes: a poll that reaches the server a moment BEFORE this write does answers
  // with the old state and flips the change back on screen until the write's own
  // refetch — Marc's « checked, and it comes back seconds later » (2026-09-24).
  reapply?: boolean
  // Override api()'s default timeout (20s) for a write whose handler legitimately
  // runs long (e.g. capture's inline AI classification before the DB write) — a
  // caller that lets this time out gets the SAME transport-failure/outbox-queue
  // treatment as any other network error, just later.
  timeoutMs?: number
}

// The rejection helpers live in writeFailed.ts (a leaf the always-loaded toast bar can import
// without pulling this whole module into the first-load bundle); re-exported so call sites
// keep importing everything write-shaped from here.
export { writeFailed, wrote, writeOrNull } from './writeFailed'

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
  const body = spec.body

  // Read-only guest session: refuse every write at the single chokepoint. We do
  // NOT apply the optimistic change, hit the network, or queue to the outbox — so
  // a guest can never see a row "disappear" then reappear (the bug that let it
  // look like a delete went through). The UI also hides mutating controls for a
  // guest; this is the structural backstop for any control that slips through. It REJECTS
  // (review #38): resolving made every follow-up that assumes the write landed run anyway.
  if (isGuest()) throw new GuestReadOnlyError()

  // Whoever listens for a real write attempt (lib/tourOffer's « heavy editor » offer, A-5).
  // The data layer names no listener: it only says a write is being attempted.

  for (const fn of writeListeners) fn()

  // Cancel what is ALREADY in flight for these keys before painting the change: a poll
  // sent before the tap would otherwise land after it and repaint the old state — the
  // standard TanStack rule.
  // The write's own invalidate below refetches once the change is on the server.
  if (spec.optimistic && affectedKeys.length)
    await Promise.all(affectedKeys.map((k) => qc.cancelQueries({ queryKey: k })))
  spec.optimistic?.(qc)
  // …and a poll sent AFTER the tap can still beat the write to the server. For an
  // idempotent change, re-apply it to whatever lands until the write settles.
  const stopReapply =
    spec.reapply && spec.optimistic
      ? qc.getQueryCache().subscribe((ev) => {
          // A FETCHED frame only: setQueryData dispatches 'success' too (manual), and
          // re-applying on our own write would recurse forever.
          if (ev.type !== 'updated' || ev.action.type !== 'success' || ev.action.manual) return
          if (!affectedKeys.some((k) => partialMatchKey(ev.query.queryKey, k))) return
          spec.optimistic!(qc)
        })
      : () => {}

  // B-9 (bmad/10): ONE idempotency key per write attempt, hoisted above the online
  // try so it covers BOTH legs. Before this, only a REPLAY carried a key (a fresh
  // one, minted at enqueue time) — a normal online POST sent none. That left a
  // hole: wifi drops the RESPONSE (not the request) after the server already
  // applied the write, the catch below sees a transport failure and queues the
  // write with a brand-new key, and the eventual replay double-applies it. Sending
  // this same key on the online attempt closes it — if the server already has it
  // (it did apply, we just didn't hear back), the ledger in `_lib/idempotency.ts`
  // answers the replay with the ORIGINAL result instead of re-running the write.
  const key = uuid()

  const queue = async (): Promise<WriteResult<T>> => {
    await enqueue({ id: uuid(), key, path, method, body, affectedKeys, createdAt: Date.now() })
    return { data: null, queued: true }
  }

  // Fast path: known offline → don't even attempt the network.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      return await queue()
    } finally {
      stopReapply()
      affectedKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
    }
  }

  try {
    const data = await api<T>(path, { method, body, idempotencyKey: key, timeoutMs: spec.timeoutMs })
    return { data, queued: false }
  } catch (err) {
    // A network/transport failure rejects with a non-ApiError (TypeError) — queue
    // it, under the SAME key the failed attempt already carried (not a fresh one —
    // see the B-9 note above). An ApiError means the server answered (4xx/5xx): a
    // real error, surface it (the optimistic change is corrected by the invalidate
    // below).
    if (err instanceof ApiError) {
      // A DELETE the server answers 404 is a row that is ALREADY GONE — what the caller wanted.
      // Treating it as a failure made “Annuler” on an add the user had since swiped away say
      // « Pas enregistré » (writeFailed). The refetch below shows the truth. Only a DELETE:
      // a « Vider les cochés » PATCH answers 404 too when nothing was left to clear, and
      // that one stays a rejection, which useDeferredRemoval.rejectionMeansGone reads as
      // « already gone » (review #38 found the two not redundant: each owns its method).
      if (err.status === 404 && method === 'DELETE') return { data: null as T, queued: false }
      throw err
    }
    return await queue()
  } finally {
    stopReapply()
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
