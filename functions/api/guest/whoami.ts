import { ok } from '../../_lib/json'
import { authed } from '../../_lib/route'

// Tell the SPA which share-mode it's running as. The token is an opaque, server-
// signed HMAC string, so the client can't read its own `kind` — it asks here once
// after boot and routes accordingly (showcase → the read-only hub; sitter → the
// handoff scene; welcome → the visitor card). Allowlisted for every guest kind
// (worker/index.ts). For a real operator/kiosk `kind` is null (they're not a guest).
export const onRequestGet = authed(async (_ctx, actor) => {
  return ok({
    scope: actor.scope,
    kind: actor.scope === 'guest' ? (actor.guestKind ?? 'showcase') : null,
  })
})
