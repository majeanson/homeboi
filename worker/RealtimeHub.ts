// RealtimeHub — per-household WebSocket fan-out Durable Object (SCAFFOLD, #20).
//
// One DO instance per household (the Worker derives the id from the actor's
// householdId). Clients connect via /api/live; the DO holds their sockets and,
// when a write happens, broadcasts a small invalidate message so every awake
// board refetches at once. This is an OPTIMIZATION layered over polling
// (src/lib/query.ts) — if the DO is never deployed or a socket drops, polling
// still keeps screens fresh. Nothing here is on the write path's critical line.
//
// Kept deliberately minimal: in-memory socket set + a broadcast. No persistence,
// no presence list, no auth re-check inside the DO (the Worker authenticates the
// upgrade BEFORE handing the request here, and only ever routes a socket to the
// caller's OWN household DO, so a connection can't cross households).
//
// Typed against @cloudflare/workers-types (tsconfig.node.json). The integrator
// finalizes the exact DO base/migration form for the target plan.

// The shape the client (src/lib/realtime.ts) understands. Not exported — the
// client re-declares its own structural copy (no shared type across the
// Worker/SPA build boundary), so this stays module-private.
interface InvalidateMessage {
  type: 'invalidate'
  // TanStack Query keys to invalidate, e.g. [['board']].
  keys: string[][]
}

// The Worker sends this DO two request kinds, told apart by method:
//   GET  + Upgrade: websocket → a client joining the household (returns 101)
//   POST /broadcast            → a write happened; body is an InvalidateMessage
export class RealtimeHub implements DurableObject {
  private sockets = new Set<WebSocket>()

  // `state` is required by the DO constructor contract even though this minimal
  // hub keeps everything in memory; prefixed with _ to satisfy noUnusedParameters.
  constructor(_state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    // --- A client joining: upgrade to a WebSocket and remember it -------------
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      server.accept()
      this.sockets.add(server)
      // Drop the socket from the fan-out set when it closes or errors so we don't
      // broadcast into dead connections (and leak memory in a long-lived DO).
      const forget = () => this.sockets.delete(server)
      server.addEventListener('close', forget)
      server.addEventListener('error', forget)
      return new Response(null, { status: 101, webSocket: client })
    }

    // --- A write happened: fan out the invalidate to every live socket -------
    if (request.method === 'POST') {
      let msg: InvalidateMessage
      try {
        msg = (await request.json()) as InvalidateMessage
      } catch {
        return new Response('Bad broadcast payload.', { status: 400 })
      }
      this.broadcast(msg)
      return new Response(null, { status: 204 })
    }

    return new Response('Not found.', { status: 404 })
  }

  private broadcast(msg: InvalidateMessage): void {
    const data = JSON.stringify(msg)
    for (const ws of this.sockets) {
      try {
        ws.send(data)
      } catch {
        // A send to a half-dead socket throws — drop it; close handler may not
        // have fired yet. Best-effort: one bad socket never blocks the rest.
        this.sockets.delete(ws)
      }
    }
  }
}
