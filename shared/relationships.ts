// The relationship vocabulary of « Le cercle »: every stored type and its inverse (A → B implies
// B → A). ONE copy (shared/, review #40): the client picker reads it, and the Worker derives
// reverse_type from it so a client can never desync an edge. It used to be two maps, pinned by a
// test that compared them.
export const RELATIONSHIP_INVERSES = {
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
  parent_in_law: 'child_in_law',
  child_in_law: 'parent_in_law',
  sibling_in_law: 'sibling_in_law',
  in_law: 'in_law',
  step_family: 'step_family',
  relative: 'relative',
  owner: 'pet',
  pet: 'owner',
  best_friend: 'best_friend',
  friend: 'friend',
  colleague: 'colleague',
  neighbor: 'neighbor',
  other: 'other',
} as const satisfies Record<string, string>

export type RelationshipType = keyof typeof RELATIONSHIP_INVERSES

export const isRelationshipType = (v: unknown): v is RelationshipType => typeof v === 'string' && v in RELATIONSHIP_INVERSES
