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
import type { QueryClient } from '@tanstack/react-query'
import { getDeviceToken, getGuestToken } from './device'

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
  try {
    socket?.close()
  } catch {
    /* noop */
  }
  socket = null
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
