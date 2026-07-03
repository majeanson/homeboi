// Server-side realtime broadcast hook (SCAFFOLD, #20).
//
// After a successful write, a handler (or the authed() wrapper) can call
// broadcastInvalidate() to tell the household's RealtimeHub Durable Object to
// fan out a query-invalidate to every connected client. This is an OPTIMIZATION:
// it is BEST-EFFORT and FULLY WRAPPED so a DO error, a missing binding, or a slow
// network can NEVER fail or delay the write — the function swallows everything.
//
// The DO binding lives on the Worker env (REALTIME_HUB) and is intentionally NOT
// on the Functions `Env` type (it's optional + Worker-only), so this helper takes
// a loosely-typed env and feature-detects the binding at runtime.

// Minimal structural type for the bits we touch — avoids importing Worker-only DO
// types into the Functions layer, and lets the call no-op when the binding is absent.
interface MaybeRealtimeEnv {
  REALTIME_HUB?: {
    idFromName(name: string): unknown
    get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> }
  }
}

// ---- Per-write invalidation keys (#20) -------------------------------------
//
// Map a mutating request's API path to the TanStack Query keys it actually
// affects, so the hub nudges ONLY the relevant caches instead of a blanket
// board refetch. The mapping mirrors the `affectedKeys` the SPA call sites
// already use after each write (src/lib/write.ts call sites) — kept in lockstep
// so a server push invalidates exactly what the client would have.
//
// Keys are plain string[][] (TanStack queryKey arrays). Shared keys: 'board'
// (the kiosk glance), 'routines', 'household' — see src/lib/queryKeys.ts. The
// rest are page-local keys (src/components/kitchen/types.ts, src/lib/recipes.ts,
// src/pages/Liste.tsx). They're duplicated here as literals on purpose: this is
// the Worker/Functions layer and can't import from the SPA build, and the
// path→keys test pins them so a rename is caught.
//
// PURE + total: never throws, returns [] for unmapped/non-shared writes (those
// broadcast nothing). Default for an unrecognized but plausibly board-affecting
// write is the board key (a safe superset refetch), matching the old coarse hook.

// Endpoints whose writes change NO shared client cache → broadcast nothing.
// (auth/session, pairing, device admin, AI scratch endpoints, image blobs, etc.)
// These either have no polled query, are per-device, or return data inline.
const SILENT_PATHS = new Set<string>([
  'auth/login',
  'auth/logout',
  'auth/signup',
  'auth/me',
  'ai-errors',
  'ai-test',
  'capture-classify', // pure classifier; the follow-up write carries its own path
  'empty-fridge', // « vide-frigo » AI ideas/recipes; saving a result hits recipes
  'guest/start',
  'health',
  'pair/start',
  'pair/poll',
  'pair/claim',
  'pair/devices',
  'recipe-draft',
  'recipe-image',
  'recipe-import',
  'recipe-step-image',
  'recipe-vision',
  'suggest-meal',
  'transcribe',
  'trip-doc-media', // trip document/photo/audio blob; the trip_notes write carries the path
  'shared-trip-media', // « Voyage partagé » blob; the shared_trip_notes write carries the path
  'shared-trip-invite', // mint/rotate a join link; no polled cache changes (the link is returned inline)
  'routine-audio',
  'weather',
  'photos',
  'members/avatar',
])

// Exact path → affected query keys. Listed against the SPA `affectedKeys` used
// at each write site so the push and the local invalidate agree.
const PATH_KEYS: Record<string, string[][]> = {
  // The shared list — drives the board glance, ghost strip, and list history.
  list: [['board'], ['ghosts'], ['list-history']],
  // Chores + the rotation ledger feed the board, the chores tab, and the month.
  chores: [['chores'], ['board'], ['month']],
  'chores-ledger': [['chores'], ['board'], ['month']],
  // Projets & Entretien (home_projects): dated upkeep shows on the board + month,
  // and the Réglages sub-tabs read ['home-projects']. Mirrors the chores keys.
  'home-projects': [['home-projects'], ['board'], ['month']],
  // « Les carnets » (cared-for things): the tree feeds the cercle SubTab + the
  // board's « Les carnets » glance; a care-log entry refreshes the same surfaces.
  carnets: [['carnets'], ['board']],
  'care-log': [['carnets'], ['care-log'], ['board']],
  'home-pins': [['home-pins']],
  // Calendar events show on the board, the events list, and the month grid; a
  // driverless ride also feeds the « À régler » heads-up (functions/api/a-regler).
  events: [['events'], ['board'], ['month'], ['a-regler']],
  // « Voyage » (trips): a trip spans the month band + the board "Prochain voyage"
  // card; its notes/itinerary + per-member packing feed the trip scene (prefix keys
  // ['trip-notes', <id>] / ['trip-packing', <id>] invalidate via the bare prefix).
  // A note with a date also shows on the day page, which reads ['month'].
  trips: [['trips'], ['board'], ['month']],
  'trip-notes': [['trip-notes'], ['month'], ['board']],
  'trip-packing': [['trip-packing']],
  // « Voyage partagé » (shared trips, migration 0101). These writes fan out to the
  // shared trip's `st:<id>` DO room via nudgeSharedTrip; the SAME keys ALSO ride the
  // household hook here so the writer's OTHER devices refetch. MANDATORY entries — an
  // unmapped shared-trip* write would default to [['board']] (see keysForPath), which
  // is the wrong cache AND spams the board. Promote/dissolve/leave move rows into/out
  // of the household `trips` store, so they touch trips + board + month too.
  'shared-trip': [['shared-trips'], ['trips'], ['board'], ['month']],
  'shared-trip-notes': [['shared-trip-notes']],
  'shared-trip-packing': [['shared-trip-packing']],
  'shared-trip-join': [['shared-trips']],
  'shared-trip-leave': [['shared-trips'], ['trips'], ['board'], ['month']],
  // Meal plan: the kitchen week grid + the board's "ce soir"; an empty/low-ingredient
  // supper feeds the « À régler » heads-up.
  meals: [['meals'], ['board'], ['a-regler']],
  'meal-leftovers': [['leftovers'], ['board']],
  'meal-ideas': [['meal-ideas']],
  'meal-staples': [['meals']],
  // Per-day memo pinned to the meal week; today's shows on the board.
  'day-notes': [['day-notes'], ['board']],
  // Board-only sticky notes.
  notes: [['board']],
  // « Laisse un mot » — a member-to-member mot rides its own inbox card AND the per-face
  // dot on the board's face row, so nudge both ['mots'] and the board.
  mots: [['mots'], ['board']],
  // Accepting a « boîte aux lettres » message inserts a board note — nudge the board.
  postbox: [['board']],
  // Garde-manger flags; a running-low item feeds the « À régler » meal-low scan.
  pantry: [['pantry'], ['a-regler']],
  'use-soon': [['use-soon']],
  reserve: [['reserve']],
  // Household settings (postal, store filter, meal-slot colours, reserve locns)
  // re-tint every meal surface and the board. The AI on/off switch also rides this
  // path, so include ['health'] — that's the cache useAi() reads, so flipping AI off
  // on one device nudges every other device (the wall kiosk) to hide AI affordances
  // at once instead of waiting for its next health poll.
  household: [['household'], ['board'], ['health']],
  // Members appear on the board (faces), in Réglages, and as people in Le cercle
  // (their relationship edits re-derive the circle's families).
  // (a birthday edit also feeds the « À régler » gift-idea heads-up).
  members: [['members'], ['board'], ['cercle'], ['a-regler']],
  // Kid routines render on the board and the routines tab.
  routines: [['routines'], ['board']],
  // À compléter (todos): the board glance + day page read ['todos']; the board's own
  // poll re-reads too. Prefix-invalidating ['todos'] also refreshes day-scoped
  // queries (['todos', <day>]). ['month'] too — dated todos show on the calendar.
  // Templates only feed Réglages + the picker chips.
  todos: [['todos'], ['board'], ['month']],
  'todo-templates': [['todo-templates']],
  // Recipe book; a recipe's ingredients feed the « À régler » meal-low scan.
  recipes: [['recipes'], ['a-regler']],
  'recipe-tags': [['recipes'], ['recipe-tags']],
  // Adding a recipe's ingredients to the shared list only touches the board glance
  // (the list lives under ['board'] — there is no separate ['list'] cache).
  'recipe-to-list': [['board']],
  // Family « favorites » hearts (#21): a heart toggle re-renders every surface that
  // shows hearts (recipe list/view + planned meals), all under ['recipe-loves'].
  'recipe-loves': [['recipe-loves']],
  // Flyer deals ride the board's list surface.
  deals: [['board']],
  // Opt-in purchase tracking strip + the board.
  ghost: [['ghosts'], ['board']],
  // Capture routes a note to any of these targets, so refetch the lot (a new event /
  // meal / pantry-low item can all change the « À régler » heads-up).
  capture: [['board'], ['meals'], ['pantry'], ['leftovers'], ['a-regler']],
  // Le cercle (people directory): a contact or relationship edit refreshes the
  // tab; a birthday edit also re-derives the board's "Anniversaires à venir" and the
  // « À régler » gift-idea heads-up.
  cercle: [['cercle'], ['board'], ['a-regler']],
  'cercle-links': [['cercle']],
  // Named-group membership + a contact's photo gallery both live under the cercle
  // cache (the photos query key is prefixed ['cercle', …]), so one nudge refreshes them.
  'cercle-groups': [['cercle']],
  'cercle-photos': [['cercle']],
  // Pets are people in the circle (folded into unifyCircle) — a pet edit re-derives
  // the directory, so mirror the client's [CERCLE_KEY].
  pets: [['cercle']],
  // Le cercle → Business: the services directory has its own cache (BUSINESSES_KEY).
  businesses: [['businesses']],
  // Le cercle → Notes: durable per-member / family-wide notes (FAMILY_NOTES_KEY).
  'family-notes': [['family-notes']],
  // « L'auto »: the weekly work-schedule template + per-day override both re-resolve
  // the car surfaces and the board glance (mirrors the client's [SCHEDULE_KEY/CAR_KEY,
  // BOARD_KEY]). /api/car itself is a GET-only resolved read model (no write path).
  schedule: [['schedule'], ['board']],
  'car-day': [['car'], ['board']],
  // The kept-drawings gallery (GALLERY_KEY = ['drawings']).
  drawings: [['drawings']],
  // Sample/demo data (onboarding Phase 1): a seed or « Vider les exemples » touches
  // most tables at once, so nudge every board-facing cache so another open device
  // (the wall kiosk) reflects the change instead of waiting for its next poll.
  seed: [
    ['board'],
    ['members'],
    ['meals'],
    ['events'],
    ['month'],
    ['cercle'],
    ['routines'],
    ['todos'],
    ['recipes'],
    ['pantry'],
    ['a-regler'],
    ['ghosts'],
    ['list-history'],
  ],
}

// Normalize an API path: strip a leading "api/" / slashes and any query string,
// then collapse a dynamic trailing segment (e.g. "img/<key>") to its prefix so
// per-id routes still map. Returns '' for an empty path.
function normalizePath(path: string): string {
  let p = (path || '').split('?')[0].replace(/^\/+/, '')
  if (p.startsWith('api/')) p = p.slice('api/'.length)
  p = p.replace(/\/+$/, '')
  return p
}

// PURE: API path → the query keys a write to it invalidates.
//   - silent endpoint  → []  (broadcast nothing)
//   - mapped endpoint  → its keys
//   - unmapped, non-silent → [['board']] (safe superset; old coarse behaviour)
// Never throws; safe to call with any string.
export function keysForPath(path: string): string[][] {
  const p = normalizePath(path)
  if (!p) return []
  if (SILENT_PATHS.has(p)) return []
  const exact = PATH_KEYS[p]
  if (exact) return exact
  // Dynamic single-segment routes (img/<key>) are blobs → silent.
  if (p.startsWith('img/')) return []
  // Unknown but plausibly board-affecting write: invalidate the board only.
  return [['board']]
}

// Fire the invalidate at the household's hub. Returns a promise the caller MAY
// pass to ctx.waitUntil() (so it runs after the response flushes), but awaiting
// it is optional and never throws.
export async function broadcastInvalidate(env: unknown, householdId: string, keys: string[][]): Promise<void> {
  try {
    const hub = (env as MaybeRealtimeEnv).REALTIME_HUB
    if (!hub) return // binding not provisioned → polling covers it
    const stub = hub.get(hub.idFromName(householdId))
    await stub.fetch('https://do/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'invalidate', keys }),
    })
  } catch {
    // Never let realtime failure touch the write path. Polling is the fallback.
  }
}
