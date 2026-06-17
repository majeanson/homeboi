// Realtime push (SCAFFOLD, #20) — an OPTIMIZATION over polling, never a
// replacement. We open a WebSocket to /api/live; when the server (RealtimeHub
// Durable Object) fans out an {type:'invalidate', keys} message, we invalidate
// those TanStack Query keys so the affected screens refetch immediately instead
// of waiting for the next poll tick.
//
// FAIL-SAFE BY DESIGN: every failure path is a no-op. If the DO isn't deployed
// (/api/live → 503), the socket fails to open, drops, or sends garbage — we do
// nothing and polling (src/lib/query.ts) keeps every screen fresh as before. So
// it's always safe to call connect(); the worst case is "no push, just polling".
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

// Open the realtime channel. Idempotent: a second call while a socket is live is
// a no-op. Returns a disconnect function. Safe to call unconditionally — see the
// fail-safe note above.
//
// AUTH transport: the operator session cookie rides the same-origin WS handshake
// automatically, so an operator needs no token param. The browser WebSocket API
// can't set custom headers, so a kiosk/guest's X-Device-Token can't ride the
// handshake — we pass it as ?t=<token> instead (worker/index.ts folds it back
// onto the request and verifies it the SAME way as the header). We pick the
// device token then the guest token, mirroring src/lib/api.ts
// (getDeviceToken() ?? getGuestToken()). An operator (no stored token) omits ?t=.
export function connectRealtime(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {}
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return () => disconnectRealtime()
  }

  try {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // Token in the URL can leak via logs — acceptable only because it's the sole
    // way a header-less WS can carry the device/guest credential; operators use
    // the cookie and send no token. encodeURIComponent keeps base64url tokens safe.
    const token = getDeviceToken() ?? getGuestToken()
    const query = token ? `?t=${encodeURIComponent(token)}` : ''
    const ws = new WebSocket(`${proto}://${window.location.host}/api/live${query}`)
    socket = ws

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

    // On error/close we do NOTHING (no reconnect storm, no user-facing error).
    // Polling continues. A future iteration can add backoff-reconnect here.
    const cleanup = () => {
      if (socket === ws) socket = null
    }
    ws.addEventListener('error', cleanup)
    ws.addEventListener('close', cleanup)
  } catch {
    socket = null
  }

  return () => disconnectRealtime()
}

// Internal — the disconnect closure returned by connectRealtime calls this. Not
// exported yet (no external caller); promote to an export when a screen needs to
// tear the socket down explicitly.
function disconnectRealtime(): void {
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
