// The relationship inverse map for « Le cercle », as PURE DATA (no Cloudflare
// globals, no imports) so it's safe to import from BOTH the Worker handler
// (functions/api/cercle-links.ts) AND a SPA-side test without dragging
// CF-typed Worker code into the DOM tsconfig.
//
// This MIRRORS src/lib/cercle.ts RELATIONSHIP_INVERSES — the SPA can't import
// Worker code at runtime (separate bundle), so the canonical pair lives once
// here for the server and once there for the client; src/lib/cercle.test.ts
// pins the two together so they can't drift.
export const INVERSES: Record<string, string> = {
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  spouse: 'spouse',
  partner: 'partner',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  aunt_uncle: 'niece_nephew',
  niece_nephew: 'aunt_uncle',
  cousin: 'cousin',
  in_law: 'in_law',
  step_family: 'step_family',
  relative: 'relative',
  best_friend: 'best_friend',
  friend: 'friend',
  colleague: 'colleague',
  neighbor: 'neighbor',
  other: 'other',
}

export const isRelationshipType = (v: unknown): v is string => typeof v === 'string' && v in INVERSES
