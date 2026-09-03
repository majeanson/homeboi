// Realtime push (#20) — an OPTIMIZATION over polling, never a replacement. We
// open a WebSocket to /api/live; when the server (RealtimeHub Durable Object)
// fans out an {type:'invalidate', keys} message, we invalidate those TanStack
// Query keys so the affected screens refetch immediately instead of waiting for
// the next poll tick.
//
// FAIL-SAFE BY DESIGN: every failure path leaves polling in charge. If the DO
// isn't deployed (/api/live → 503), the socket fails to open, drops, or sends
// garbage — `isRealtimeConnected()` reports false and the poll (src/lib/query.ts)
// snaps back to its fast cadence, keeping every screen fresh as before. So it's
// always safe to call connect(); the worst case is "no push, just fast polling".
//
// WHY THIS POWERS THE POLL GEAR (capacity lever): a wall tablet polling the board
// every 10s is the dominant cost on the free tier. While the socket is OPEN, push
// owns "instant", so query.ts drops to a slow safety heartbeat — cutting Worker
// requests + D1 row reads several-fold (the binding free-tier limits). The instant
// the socket dies, we flip back to fast polling AND refetch once to catch up on
// whatever a heartbeat-sized gap might have missed, so freshness is never traded
// for the savings. See `isRealtimeConnected()` + the `live` poll in query.ts.
import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { getDeviceToken, getGuestToken, isGuest } from './device'

interface InvalidateMessage {
  type: 'invalidate'
  keys: unknown[][]
}

function isInvalidate(v: unknown): v is InvalidateMessage {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as { type?: unknown }).type === 'invalidate' &&
    Array.isArray((v as { keys?: unknown }).keys)
  )
}

// --- Presence (nav-tab "someone's here" dot) --------------------------------
//
// The household socket doubles as a presence channel: HubLayout announces which
// hub tab it's on (announcePresence), and the server echoes back the WHOLE
// household's view→[memberId] map (see worker/RealtimeHub.ts) so a nav bar can
// show a dot for ANY section, not just the one currently open. Deliberately
// presence-only, never a count (calm — the chore-ledger rule: which faces, not
// how many).
interface PresenceMessage {
  type: 'presence'
  byView: Record<string, string[]>
}

function isPresenceMsg(v: unknown): v is PresenceMessage {
  return !!v && typeof v === 'object' && (v as { type?: unknown }).type === 'presence' && !!(v as { byView?: unknown }).byView
}

// Replaced wholesale (never mutated) on every update so useSyncExternalStore's
// reference-equality check works without extra bookkeeping.
let presenceByView: Record<string, string[]> = {}
const presenceListeners = new Set<() => void>()

function setPresence(next: Record<string, string[]>): void {
  presenceByView = next
  for (const cb of presenceListeners) cb()
}

// What THIS tab last announced — resent automatically on every (re)connect, so a
// dropped-and-restored socket doesn't leave the tab looking empty to everyone
// else until the user happens to switch screens again.
let announcedView: string | null = null
let announcedMemberId: string | null = null

function sendPresence(): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  // No picked face → announce nothing, matching lib/profile.ts: attribution
  // (and presence is a form of it) is opt-in, not tied to "a device is open."
  const view = announcedMemberId ? announcedView : null
  try {
    socket.send(JSON.stringify({ type: 'presence', view, memberId: announcedMemberId }))
  } catch {
    /* socket died mid-send — the close handler will clear presence + reconnect */
  }
}

// Tell the household which hub tab this device is on (`view`, e.g. 'today' /
// 'kitchen' / 'list' — HubLayout's TABS keys), or `null` to leave every tab. A
// no-op while disconnected; the value is remembered and resent the moment the
// socket (re)opens.
export function announcePresence(view: string | null, memberId: string | null): void {
  announcedView = view
  announcedMemberId = memberId
  sendPresence()
}

// The live view→[memberId] map, read straight off the module singleton — a
// plain object compared by reference, replaced wholesale on change (see
// setPresence), so this is a valid useSyncExternalStore snapshot with no memo.
export function usePresenceMap(): Record<string, string[]> {
  return useSyncExternalStore(
    (cb) => {
      presenceListeners.add(cb)
      return () => presenceListeners.delete(cb)
    },
    () => presenceByView,
    () => presenceByView,
  )
}

let socket: WebSocket | null = null
// `connected` mirrors an OPEN socket; the poll gear in query.ts reads it. It's
// deliberately a plain flag (not socket.readyState) so it stays false through the
// CONNECTING phase — we only relax polling once push is actually carrying messages.
let connected = false
// Kept across drops so the close/error handler can catch up + reconnect without
// the caller re-passing it. Cleared on an explicit disconnect.
let client: QueryClient | null = null
// `wantConnection` is true between connect/disconnect; a close while it's true
// schedules a reconnect, a close after disconnect() does not (no zombie retries).
let wantConnection = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 0

const RECONNECT_MIN_MS = 2_000
const RECONNECT_MAX_MS = 30_000

// Is push currently live? The adaptive poll in query.ts reads this every tick to
// pick its cadence: connected → slow safety heartbeat (push owns freshness);
// disconnected → fast poll (polling owns freshness). Always false when realtime is
// gated off in main.tsx (the socket is never opened), so the poll stays fast —
// the pre-realtime behaviour is preserved untouched.
export function isRealtimeConnected(): boolean {
  return connected
}

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

// Exponential backoff, capped — one timer at a time, reset to 0 on a healthy open.
function scheduleReconnect(): void {
  if (!wantConnection || reconnectTimer || typeof window === 'undefined') return
  reconnectDelay = reconnectDelay ? Math.min(reconnectDelay * 2, RECONNECT_MAX_MS) : RECONNECT_MIN_MS
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (wantConnection && client) openSocket(client)
  }, reconnectDelay)
}

// AUTH transport: the operator session cookie rides the same-origin WS handshake
// automatically, so an operator needs no token param. The browser WebSocket API
// can't set custom headers, so a kiosk/guest's X-Device-Token can't ride the
// handshake — we pass it as ?t=<token> instead (worker/index.ts folds it back
// onto the request and verifies it the SAME way as the header). We pick the
// device token then the guest token, mirroring src/lib/api.ts
// (getDeviceToken() ?? getGuestToken()). An operator (no stored token) omits ?t=.
function openSocket(queryClient: QueryClient): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  try {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // Token in the URL can leak via logs — acceptable only because it's the sole
    // way a header-less WS can carry the device/guest credential; operators use
    // the cookie and send no token. encodeURIComponent keeps base64url tokens safe.
    const token = getDeviceToken() ?? getGuestToken()
    const query = token ? `?t=${encodeURIComponent(token)}` : ''
    const ws = new WebSocket(`${proto}://${window.location.host}/api/live${query}`)
    socket = ws

    ws.addEventListener('open', () => {
      connected = true
      reconnectDelay = 0 // a healthy connection resets the backoff
      sendPresence() // re-announce whatever tab we're on — a fresh socket knows nothing yet
    })

    ws.addEventListener('message', (ev) => {
      try {
        const msg: unknown = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
        if (isInvalidate(msg)) {
          for (const key of msg.keys) {
            void queryClient.invalidateQueries({ queryKey: key })
          }
        } else if (isPresenceMsg(msg)) {
          setPresence(msg.byView)
        }
      } catch {
        /* malformed frame — ignore; polling still covers freshness */
      }
    })

    // On drop we do NOT just go quiet: while connected the poll runs at a slow
    // heartbeat, so a real change could sit unseen for minutes. So we (1) flip
    // connected=false → the poll snaps back to fast on its next tick, (2) refetch
    // the live queries ONCE to catch up on anything missed during the gap (guarded
    // by `connected` so repeated reconnect failures don't restart it), and (3) try
    // to re-open so the budget savings come back. No user-facing error either way.
    const onDown = () => {
      if (socket === ws) socket = null
      if (connected) {
        connected = false
        void queryClient.refetchQueries({ type: 'active', predicate: (q) => q.meta?.live === true })
      }
      // We don't know who's still on which tab until the next snapshot arrives —
      // stale presence (someone shown as "here" after their tablet went offline)
      // is worse than none, so clear it rather than let it go stale silently.
      setPresence({})
      scheduleReconnect()
    }
    ws.addEventListener('error', onDown)
    ws.addEventListener('close', onDown)
  } catch {
    socket = null
    connected = false
    scheduleReconnect()
  }
}

// Open the realtime channel. Idempotent: a second call while a socket is live is a
// no-op. Returns a disconnect function. Safe to call unconditionally — see the
// fail-safe note at the top of the file.
export function connectRealtime(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {}
  // A guest (curated share link) — or the operator's guest-scene PREVIEW — must not join
  // the household realtime fan-out: guest scenes are read-only terminal snapshots that
  // poll their one endpoint, and the server 403s a guest at /api/live anyway. Skip the
  // socket entirely so we don't spin the reconnect backoff against a guaranteed reject.
  if (isGuest()) return () => {}
  client = queryClient
  wantConnection = true
  openSocket(queryClient)
  return () => disconnectRealtime()
}

// Internal — the disconnect closure returned by connectRealtime calls this. Tears
// the socket down and suppresses reconnects; the poll falls back to its fast gear
// (connected=false). Not exported yet (no external caller); promote to an export
// when a screen needs to tear the socket down explicitly.
function disconnectRealtime(): void {
  wantConnection = false
  clearReconnect()
  reconnectDelay = 0
  connected = false
  setPresence({})
  try {
    socket?.close()
  } catch {
    /* noop */
  }
  socket = null
}

// « Voyage partagé » (#shared-trip) — a page-scoped SECOND channel, alongside the
// household singleton above. A shared trip is ONE trip live-edited by up to 6
// households, so its DO room is the trip (worker/index.ts routes /api/live?st=<id>
// to idFromName('st:'+id)) rather than a household. Each open shared-trip page opens
// its own socket to that room while mounted; state is therefore PER shared-trip id
// (a Map), not the module singleton — two open trips must not clobber one flag.
//
// Same shape as the household channel: same isInvalidate message handling, same
// capped 2s→30s backoff (a 503/401/403 handshake keeps the cap so we never hammer),
// same connected flag the poll gear reads (via isSharedTripRealtimeConnected). AUTH:
// a shared trip is operator-only, so the session cookie always rides the same-origin
// handshake — we never append ?t= here (unlike the household socket's device path).
interface SharedTripChannel {
  socket: WebSocket | null
  connected: boolean
  // true between connect and its cleanup; a close while true reconnects (mirrors
  // `wantConnection`). refs counts live mounts so a shared page opened twice (e.g.
  // StrictMode double-mount) tears down only when the last cleanup runs.
  want: boolean
  refs: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectDelay: number
}

const sharedChannels = new Map<string, SharedTripChannel>()

// Is push live for THIS shared trip? The per-id analogue of isRealtimeConnected —
// the shared page's poll config reads it to pick fast-poll vs slow-heartbeat.
export function isSharedTripRealtimeConnected(sharedTripId: string): boolean {
  return sharedChannels.get(sharedTripId)?.connected ?? false
}

function clearSharedReconnect(ch: SharedTripChannel): void {
  if (ch.reconnectTimer) {
    clearTimeout(ch.reconnectTimer)
    ch.reconnectTimer = null
  }
}

function scheduleSharedReconnect(id: string, ch: SharedTripChannel, queryClient: QueryClient): void {
  if (!ch.want || ch.reconnectTimer || typeof window === 'undefined') return
  ch.reconnectDelay = ch.reconnectDelay ? Math.min(ch.reconnectDelay * 2, RECONNECT_MAX_MS) : RECONNECT_MIN_MS
  ch.reconnectTimer = setTimeout(() => {
    ch.reconnectTimer = null
    if (ch.want) openSharedSocket(id, ch, queryClient)
  }, ch.reconnectDelay)
}

function openSharedSocket(id: string, ch: SharedTripChannel, queryClient: QueryClient): void {
  if (ch.socket && (ch.socket.readyState === WebSocket.OPEN || ch.socket.readyState === WebSocket.CONNECTING)) return

  try {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // NO ?t= — shared trips are operator-only, so the operator session cookie always
    // carries the credential on the same-origin handshake (see connectRealtime's note
    // on the device/guest ?t= path, which does NOT apply here).
    const ws = new WebSocket(`${proto}://${window.location.host}/api/live?st=${encodeURIComponent(id)}`)
    ch.socket = ws

    ws.addEventListener('open', () => {
      ch.connected = true
      ch.reconnectDelay = 0 // a healthy connection resets the backoff
    })

    ws.addEventListener('message', (ev) => {
      try {
        const msg: unknown = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
        if (isInvalidate(msg)) {
          for (const key of msg.keys) {
            void queryClient.invalidateQueries({ queryKey: key })
          }
        }
      } catch {
        /* malformed frame — ignore; polling still covers freshness */
      }
    })

    // On drop: flip connected=false so the shared page's poll snaps back to fast, do
    // a one-time catch-up refetch of the shared-trip queries that a heartbeat-sized
    // gap might have missed (guarded by `connected` so repeated reconnect failures
    // don't restart it), and try to re-open.
    const onDown = () => {
      if (ch.socket === ws) ch.socket = null
      if (ch.connected) {
        ch.connected = false
        void queryClient.refetchQueries({
          predicate: (q) => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith('shared-trip'),
        })
      }
      scheduleSharedReconnect(id, ch, queryClient)
    }
    ws.addEventListener('error', onDown)
    ws.addEventListener('close', onDown)
  } catch {
    ch.socket = null
    ch.connected = false
    scheduleSharedReconnect(id, ch, queryClient)
  }
}

// Open the page-scoped shared-trip channel for `sharedTripId`. Returns a cleanup
// function for a React useEffect: it closes the socket + cancels timers once the
// last mount releases it (refcounted, so a StrictMode double-mount or two views of
// the same trip share one socket). Idempotent per id and per returned cleanup.
export function connectSharedTripRealtime(queryClient: QueryClient, sharedTripId: string): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {}
  // A guest never opens a shared-trip socket — shared trips are operator-only and the
  // server 403s a guest at /api/live?st=. Mirror connectRealtime's guard so we don't
  // spin the reconnect backoff against a guaranteed reject.
  if (isGuest()) return () => {}

  let ch = sharedChannels.get(sharedTripId)
  if (!ch) {
    ch = { socket: null, connected: false, want: true, refs: 0, reconnectTimer: null, reconnectDelay: 0 }
    sharedChannels.set(sharedTripId, ch)
  }
  ch.want = true
  ch.refs += 1
  openSharedSocket(sharedTripId, ch, queryClient)

  let released = false
  return () => {
    if (released) return // idempotent: a double-invoked cleanup is a no-op
    released = true
    const cur = sharedChannels.get(sharedTripId)
    if (!cur) return
    cur.refs -= 1
    if (cur.refs > 0) return // another live mount still wants this channel
    cur.want = false
    clearSharedReconnect(cur)
    cur.reconnectDelay = 0
    cur.connected = false
    try {
      cur.socket?.close()
    } catch {
      /* noop */
    }
    cur.socket = null
    sharedChannels.delete(sharedTripId)
  }
}

// DONE(#20): token sessions can now connect. The X-Device-Token (kiosk) / guest
// token rides as ?t= (above); worker/index.ts folds it back onto the request and
// verifies it via the SHARED verifyDeviceToken/verifyGuestToken in auth.ts — the
// same HMAC path the header uses. Operators keep using the cookie (no ?t=).
//
// ACTIVATION — turning realtime ON is a one-time, ordered flip (do all, in order):
//   1. Confirm the Cloudflare account is Durable-Objects-eligible (Workers Paid,
//      or the free tier with SQLite-backed DOs). An ineligible account fails the
//      deploy on the DO binding.
//   2. wrangler.toml: uncomment the two commented blocks at the bottom — the
//      [[durable_objects.bindings]] (name=REALTIME_HUB, class_name=RealtimeHub)
//      and the [[migrations]] tag (new_sqlite_classes=["RealtimeHub"]).
//   3. src/main.tsx: flip `const REALTIME_ENABLED = false` → `true` (the only
//      gate; connectRealtime is already wired + fail-safe).
//   4. `npm run deploy`. Verify /api/live returns a 101 (operator) and that a
//      kiosk (?t= token) also connects; a 503 means the DO binding isn't live.
// Everything else (the broadcast hook, per-write keys, WS token auth) is already
// in place, so no code change is needed beyond step 3. Until then: /api/live →
// 503, the hook no-ops, the client never opens a socket — runtime is pure polling.
