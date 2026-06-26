// things.ts — ONE registry of the default tint per entity KIND (P2-6).
//
// "What colour is a pet / a chore / a business when it carries none of its own?" used
// to be answered by a hardcoded hex literal copy-pasted across ~25 files (the pet
// amber `#C7873F` alone appeared 6×, with comments aspiring to a `PET_ACCENT` that
// never existed). A palette tweak meant hunting every copy. This is the single home:
// an entity that HAS its own `colour` always wins; `colourFor` only supplies the
// fallback. Values mirror the Pip palette in styles/core.css (kept as hex here because
// they're consumed in inline `style`/`<Avatar colour>` props, not CSS custom props).
//
// Adoption is incremental — the `pet` fallback is fully wired (the worst drift); the
// other kinds are seeded here so the remaining `x.colour ?? '#…'` literals (sage chores
// /projects/routines, teal businesses/groups, slate cars, butter notes) can migrate to
// `colourFor(kind, x.colour)` over time. Does NOT replace `pictoFor` (grocery items) or
// `CATS` (categories) — those are richer, domain-specific resolvers; this is just the
// per-kind colour floor.

export type ThingKind =
  | 'member'
  | 'pet'
  | 'chore'
  | 'project'
  | 'routine'
  | 'business'
  | 'group'
  | 'car'
  | 'note'

export interface ThingDefault {
  /** Fallback tint when the entity has no `colour` of its own. */
  colour: string
}

export const THING_DEFAULTS: Record<ThingKind, ThingDefault> = {
  member: { colour: '#7a8b6f' }, // sage-grey — the member default (matches the backend seed)
  pet: { colour: '#C7873F' }, //    pet amber
  chore: { colour: '#88a36f' }, //  sage (done-family) — chores
  project: { colour: '#88a36f' }, //sage — home projects
  routine: { colour: '#88a36f' }, //sage — kid routines
  business: { colour: '#2a8f85' }, //teal — Le cercle accent (businesses)
  group: { colour: '#2a8f85' }, //  teal — named groups
  car: { colour: '#6b7a8f' }, //    slate — L'auto
  note: { colour: '#fbd66b' }, //   butter — fridge notes
}

/** The kind's tint, or its registered fallback when the entity has none. */
export function colourFor(kind: ThingKind, explicit?: string | null): string {
  return explicit ?? THING_DEFAULTS[kind].colour
}
