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
  if (kind === 'showcase') return true // full hub, read-only
  if (apiPath === 'guest/whoami') return true // every kind learns its own kind
  if (apiPath === 'img' || apiPath.startsWith('img/')) return true // opaque-key media
  return apiPath === 'guest/window' // sitter | welcome | family: their curated endpoint
}
