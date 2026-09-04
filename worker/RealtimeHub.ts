// RealtimeHub — per-household WebSocket fan-out Durable Object (SCAFFOLD, #20).
//
// One DO instance per household (the Worker derives the id from the actor's
// householdId). Clients connect via /api/live; the DO holds their sockets and,
// when a write happens, broadcasts a small invalidate message so every awake
// board refetches at once. This is an OPTIMIZATION layered over polling
// (src/lib/query.ts) — if the DO is never deployed or a socket drops, polling
// still keeps screens fresh. Nothing here is on the write path's critical line.
//
// Kept deliberately minimal otherwise: besides the invalidate broadcast, the
// only other state is a per-socket PRESENCE attachment (added 2026-09-03, see
// below) — which hub tab a client is on, so nav bars can show a subtle "someone
// else is here" dot. No auth re-check inside the DO either way (the Worker
// authenticates the upgrade BEFORE handing the request here, and only ever
// routes a socket to the caller's OWN household DO, so a connection can't cross
// households).
//
// HIBERNATION (2026-08-27). This used `server.accept()` plus an in-memory
// `Set<WebSocket>`, which pins the DO in memory for as long as any socket is
// open — and a Babillard's whole point is a wall tablet that never closes its
// tab, so that meant billing continuous wall-clock, 24/7, per household, for a
// hub that is idle between writes. The WebSocket Hibernation API fixes exactly
// that shape: `state.acceptWebSocket()` hands the socket to the RUNTIME, which
// can evict this object from memory while the connection stays open and revive
// it when something arrives. `state.getWebSockets()` returns the live sockets
// after such a revival, so it replaces the Set outright — and since this hub
// holds no other state, there is nothing else to rebuild on wake-up. Clients
// never send (src/lib/realtime.ts only listens), so there is no
// `webSocketMessage` handler to write; close/error just drop the connection,
// which the runtime already tracks. Matters for the free tier — see project
// memory [[babillard-free-tier-capacity]].
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

// --- Presence (nav-tab "someone's here" dot) --------------------------------
//
// A client announces which hub tab it's on; every connected client gets back the
// WHOLE household's view→[memberId] map so nav bars anywhere can show a dot for
// ANY section, not just the one you're currently looking at. Deliberately no
// count anywhere in this — only presence/absence (mirrors the chore-ledger rule:
// show WHICH faces, never a number).
//
// State lives ONLY on each socket's attachment (`serializeAttachment`), which the
// Hibernation API persists across an eviction — so there is nothing for this
// object to rebuild on wake-up, same as the rest of the DO. A device with no
// picked face never attaches anything and so never appears (mirrors
// lib/profile.ts: no picked face = no attribution, and presence is a form of
// attribution now — it says which room a person is in).
interface PresenceAttachment {
  view: string
  memberId: string
}

interface PresenceIn {
  type: 'presence'
  // null retracts this socket's presence (tab closed the hub, or its face was
  // cleared back to "tout le monde").
  view: string | null
  memberId: string | null
}

function isPresenceIn(v: unknown): v is PresenceIn {
  return !!v && typeof v === 'object' && (v as { type?: unknown }).type === 'presence'
}

// The Worker sends this DO two request kinds, told apart by method:
//   GET  + Upgrade: websocket → a client joining the household (returns 101)
//   POST /broadcast            → a write happened; body is an InvalidateMessage
// A joined client can also SEND presence frames (see webSocketMessage below) —
// the one case where this hub listens instead of only speaking.
export class RealtimeHub implements DurableObject {
  // The runtime owns the socket set now (see the hibernation note above), so the
  // only thing this object holds is the handle it asks for them through.
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    // --- A client joining: upgrade to a WebSocket the RUNTIME holds -----------
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      // NOT `server.accept()`: that keeps the socket in THIS object's memory and
      // pins the DO awake for the life of the connection. `acceptWebSocket` lets
      // the object be evicted while the socket stays open.
      this.state.acceptWebSocket(server)
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

  // --- Hibernation callbacks ------------------------------------------------
  // With `acceptWebSocket` the runtime, not this object, dispatches socket events
  // — so these replace the `addEventListener('close'|'error')` pair, which would
  // never fire again once the object had been evicted. There is nothing to
  // un-register (the runtime drops the socket from `getWebSockets()` itself);
  // closing our end just makes sure a half-open connection is really finished.
  webSocketClose(ws: WebSocket): void {
    try {
      ws.close()
    } catch {
      /* already closed */
    }
    // Recompute the roster WITHOUT the closing socket — the tab it was on may just
    // have gone empty for everyone else. Excluded explicitly rather than trusting
    // getWebSockets() to have already dropped it: whether it has, this early in the
    // close handler, is runtime behaviour we'd rather not depend on (a lingering
    // ghost dot would otherwise sit there until the next presence event).
    this.broadcastPresence(ws)
  }

  webSocketError(ws: WebSocket): void {
    try {
      ws.close()
    } catch {
      /* already closed */
    }
    this.broadcastPresence(ws)
  }

  // A client is the only thing that ever sends here: a presence announce when it
  // enters/leaves a hub tab (src/lib/realtime.ts announcePresence). Store it on
  // THIS socket's attachment (survives hibernation) and re-fan-out the household's
  // whole presence map — cheap at household scale, and simpler than tracking which
  // views actually changed.
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    let msg: unknown
    try {
      msg = JSON.parse(typeof message === 'string' ? message : '')
    } catch {
      return // malformed frame — ignore, nothing to attach
    }
    if (!isPresenceIn(msg)) return
    // Only string payloads, capped: the frame comes from any authed device, and an
    // uncapped value would be stored on the attachment and rebroadcast to every
    // socket in the household on each presence change. Real values are a hub-tab
    // slug and a nanoid — 64 chars is generous headroom, not a limit anyone hits.
    if (typeof msg.view === 'string' && msg.view && typeof msg.memberId === 'string' && msg.memberId) {
      const att: PresenceAttachment = { view: msg.view.slice(0, 64), memberId: msg.memberId.slice(0, 64) }
      ws.serializeAttachment(att)
    } else {
      ws.serializeAttachment(null) // retract: no tab, or no face picked
    }
    this.broadcastPresence()
  }

  private broadcast(msg: InvalidateMessage): void {
    const data = JSON.stringify(msg)
    // The live sockets, straight from the runtime — correct even on the very first
    // call after this object was revived from hibernation, when an in-memory Set
    // would have been empty and every board would have silently stopped updating.
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(data)
      } catch {
        // A send to a half-dead socket throws. Best-effort: close it and carry on,
        // so one bad connection never blocks the rest of the household.
        try {
          ws.close()
        } catch {
          /* already gone */
        }
      }
    }
  }

  // Rebuild the whole household's view→[memberId] map from every live socket's
  // attachment and fan it out to everyone. Household socket counts are tiny (a
  // handful of devices), so recomputing from scratch on every change is simpler
  // than diffing and cheap enough not to matter.
  private broadcastPresence(excluding?: WebSocket): void {
    const byView: Record<string, string[]> = {}
    for (const ws of this.state.getWebSockets()) {
      if (ws === excluding) continue
      let att: PresenceAttachment | null = null
      try {
        att = ws.deserializeAttachment() as PresenceAttachment | null
      } catch {
        att = null
      }
      if (!att) continue
      ;(byView[att.view] ??= []).push(att.memberId)
    }
    const data = JSON.stringify({ type: 'presence', byView })
    for (const ws of this.state.getWebSockets()) {
      if (ws === excluding) continue
      try {
        ws.send(data)
      } catch {
        try {
          ws.close()
        } catch {
          /* already gone */
        }
      }
    }
  }
}
