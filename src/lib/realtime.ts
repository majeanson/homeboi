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
// fail-safe note above. The cookie / device token ride automatically (same-origin
// WS sends cookies; the guest/kiosk token is a header the WS handshake can't set,
// so a header-only credential simply falls back to polling — acceptable for a
// scaffold, and noted as a TODO below).
export function connectRealtime(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {}
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return () => disconnectRealtime()
  }

  try {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/api/live`)
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

// TODO(#20): the WS handshake can't send the X-Device-Token / guest header, so
// kiosk + guest sessions currently get polling-only (cookie-auth operators get
// push). To extend push to token sessions, pass the token as a query param on
// the /api/live URL and have worker/index.ts read it there before resolveActor.
//
// TODO(#20): wire connectRealtime() into main.tsx behind a runtime guard once
// the DO is deployed and verified (e.g. only after a successful /api/health and
// a feature flag), so an undeployed DO never even attempts the socket.
