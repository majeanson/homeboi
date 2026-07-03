import type { GuestKind } from './auth'

// Per-kind READ allowlist for a guest share-link — the privacy boundary. authed()
// already blocks every guest WRITE; this scopes what each kind may READ. A curated
// link (sitter / welcome / family) may reach ONLY its own endpoint (guest/window)
// plus the public-by-key image route — it physically can't fetch board/cercle/list/
// etc. A 'showcase' link is the legacy read-everything Démo view. Enforced centrally
// in worker/index.ts before dispatch. `apiPath` is the path AFTER "api/" (no query).
//
// Lives in _lib (not worker/routes.ts) so it's unit-testable without importing the
// whole handler table (those modules are CF-typed and don't load in a node test).
export function guestKindAllows(kind: GuestKind, apiPath: string): boolean {
  if (kind === 'showcase') {
    // Read-ONLY of the hub: deny every guest write/mint path at the allowlist level too
    // (not just via authed()), so showcase keeps the default-deny property for writes —
    // it can't reach intake/postbox submit+media or guest/start. Only the read-side
    // guest endpoints (whoami/window) and the hub reads are allowed.
    if (apiPath.startsWith('guest/') && apiPath !== 'guest/whoami' && apiPath !== 'guest/window') return false
    // « Les carnets »: the house map (`home-pins` — spare-key / alarm / shutoff
    // locations) and the service-history invoice amounts (`care-log` `cost_cents`) are
    // materially more sensitive than the calendar/list data a public Démo link is meant
    // to show, so keep them OUT of showcase. The carnet tree + identity (`carnets`)
    // stays visible so the feature still demos.
    if (apiPath === 'home-pins' || apiPath === 'care-log') return false
    return true // otherwise the full hub, read-only
  }
  if (apiPath === 'guest/whoami') return true // every kind learns its own kind
  if (apiPath === 'img' || apiPath.startsWith('img/')) return true // opaque-key media
  // A public /partage share is capability-by-id (like an image), not household data — a
  // phone still holding a sitter/welcome guest token must be able to open one. Read-only
  // (GET); the endpoint isn't authed() at all, so this just clears the guest allowlist gate.
  if (apiPath === 'share-public') return true
  // 'intake' is the one writable kind: the relative-facing form link. It may read its
  // greeting context (guest/window branches on kind) and POST its one submission —
  // and NOTHING else (not board/cercle/list). The write itself is let through by a
  // matching carve-out in route.ts; together they pin intake to exactly one write.
  if (kind === 'intake')
    return apiPath === 'guest/window' || apiPath === 'guest/intake-submit' || apiPath === 'guest/intake-media'
  // 'postbox' (« La boîte aux lettres ») is the second writable kind: it reads its
  // greeting and POSTs a message (+ stages its one media blob) — and nothing else.
  if (kind === 'postbox')
    return apiPath === 'guest/window' || apiPath === 'guest/postbox-submit' || apiPath === 'guest/postbox-media'
  return apiPath === 'guest/window' // sitter | welcome | family: their curated endpoint
}
