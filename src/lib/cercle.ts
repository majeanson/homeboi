// « Le cercle » — pure domain logic for the household people directory: the
// relationship vocabulary (FR-CA), the auto-inverse map, family-group detection
// (Union-Find), and birthday math. Framework-free so the page, the toddler view,
// the detail adapter, and the board birthday widget all share ONE source of truth.
//
// Adapted from the standalone famolo / family-social project
// (src/types/relationship.ts + src/features/use-family-groups.ts), recast to our
// bilingual + calm model. Relationship KEYS are stable English identifiers stored
// in the DB; LABELS are bilingual for display.
import type { Bi } from './guideContent'

// ---- Wire shapes (match functions/api/cercle.ts JSON) ----------------------

export interface ContactAddress {
  street?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

interface ContactCustomField {
  label: string
  value: string
  type: 'text' | 'date' | 'url' | 'number'
}

export interface Contact {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  photoKey: string | null
  birthday: string | null // 'YYYY-MM-DD' ('0000-MM-DD' = year unknown)
  email: string | null
  phone: string | null
  address: ContactAddress | null
  notes: string | null
  tags: string[]
  memberId: string | null
  customFields: ContactCustomField[]
  gender: 'm' | 'f' | null
  giftIdeas?: string | null // #20: freeform birthday gift/idea notes, surfaced near the date
}

// A household member, as the cercle GET returns it (phase 2 — members are people
// in the circle too). Phase 3 adds contact fields so a member is as rich as any
// contact (email, phone, birthday, notes).
export interface Member {
  id: string
  displayName: string
  avatarKind: string
  avatarRef: string
  colour: string
  isChild: boolean
  email: string | null
  phone: string | null
  birthday: string | null
  notes: string | null
  gender: 'm' | 'f' | null
}

export type PersonKind = 'contact' | 'member' | 'pet'

// A household animal — a person in the circle (PersonKind 'pet'), with its own care
// fields. Wire shape matches /api/pets + the `pets` array of GET /api/cercle.
export interface PetWeight {
  date: string // 'YYYY-MM-DD'
  kg: number
  note?: string | null
}
// Common species, for the PetForm suggestion list (free text — type anything).
export const PET_SPECIES: Bi[] = [
  { fr: 'Chien', en: 'Dog' },
  { fr: 'Chat', en: 'Cat' },
  { fr: 'Oiseau', en: 'Bird' },
  { fr: 'Poisson', en: 'Fish' },
  { fr: 'Lapin', en: 'Rabbit' },
  { fr: 'Reptile', en: 'Reptile' },
  { fr: 'Rongeur', en: 'Small pet' },
  { fr: 'Autre', en: 'Other' },
]

export interface Pet {
  id: string
  name: string
  species: string | null
  breed: string | null
  photoKey: string | null
  colour: string | null
  birthday: string | null // 'YYYY-MM-DD' ('0000-MM-DD' = year unknown)
  microchip: string | null
  feeding: string | null
  sitterNotes: string | null
  vetBusinessId: string | null // → a Business (the vet)
  weights: PetWeight[]
  notes: string | null
}

export interface ContactLink {
  id: string
  personAId: string
  personAKind: PersonKind
  personBId: string
  personBKind: PersonKind
  type: RelationshipType
  reverseType: RelationshipType
  label: string | null
  notes: string | null
}

// The UNIFIED node in the circle: a contact OR a member, normalized so the
// directory, the ego view, the tree, and family detection all treat them the same.
// `key` = `${kind}:${id}` — a stable composite id that can't collide across tables.
export interface Person {
  kind: PersonKind
  id: string
  key: string
  name: string // display name
  firstName: string
  lastName: string
  avatarKind: string | null // 'photo' | 'color' | null → drives <Avatar kind>
  avatarRef: string | null // R2 key (photo) or hex (colour)
  colour: string | null
  birthday: string | null // contacts + members (phase 3)
  isChild: boolean
  email: string | null
  phone: string | null
  gender: 'm' | 'f' | null
}

const CONTACT_ACCENT = '#C45E86' // the cercle rose, for photoless contacts
const PET_ACCENT = '#C7873F' // a warm amber, for photoless pets (distinct from the rose)

export const personKey = (kind: PersonKind, id: string): string => `${kind}:${id}`

// Split a composite `${kind}:${id}` back into its parts (ids never contain ':').
export function parsePersonKey(key: string): { kind: PersonKind; id: string } {
  const i = key.indexOf(':')
  return { kind: key.slice(0, i) as PersonKind, id: key.slice(i + 1) }
}

// Merge contacts + members (+ pets) into one people set. Contacts render their photo
// (or a rose initials tile); members render their member avatar/colour (their board
// face); pets render their photo (or an amber initials tile).
export function buildPeople(contacts: Contact[], members: Member[], pets: Pet[] = []): Person[] {
  const fromContacts: Person[] = contacts.map((c) => ({
    kind: 'contact' as const,
    id: c.id,
    key: personKey('contact', c.id),
    name: fullName(c),
    firstName: c.firstName,
    lastName: c.lastName,
    avatarKind: c.photoKey ? 'photo' : null,
    avatarRef: c.photoKey,
    colour: CONTACT_ACCENT,
    birthday: c.birthday,
    isChild: false,
    email: c.email,
    phone: c.phone,
    gender: c.gender,
  }))
  const fromMembers: Person[] = members.map((m) => ({
    kind: 'member' as const,
    id: m.id,
    key: personKey('member', m.id),
    name: m.displayName,
    firstName: m.displayName,
    lastName: '',
    avatarKind: m.avatarKind,
    avatarRef: m.avatarRef,
    colour: m.colour,
    birthday: m.birthday ?? null,
    isChild: m.isChild,
    email: m.email ?? null,
    phone: m.phone ?? null,
    gender: m.gender ?? null,
  }))
  const fromPets: Person[] = pets.map((p) => ({
    kind: 'pet' as const,
    id: p.id,
    key: personKey('pet', p.id),
    name: p.name,
    firstName: p.name,
    lastName: '',
    avatarKind: p.photoKey ? 'photo' : null,
    avatarRef: p.photoKey,
    colour: p.colour || PET_ACCENT,
    birthday: p.birthday,
    isChild: false,
    email: null,
    phone: null,
    gender: null,
  }))
  return [...fromMembers, ...fromContacts, ...fromPets]
}

// A Maisonnée member and a « Le cercle » contact hard-linked to it (contact.memberId)
// are the SAME human — the member is the lean board identity, the contact the rich
// record (coordonnées, anniversaire, genre, liens, groupes; see lib/personSheet.ts).
// buildPeople alone would emit BOTH, so the person appeared twice in the directory,
// the picker, the tree and the family math. unifyCircle collapses them:
//   • the MEMBER is canonical — it keeps its board face + « Membre » badge and opens
//     the same rich sheet — enriched with any cercle-only field the contact carries
//     (gender / birthday / email / phone) so a known gender is never dropped;
//   • links and group memberships that referenced the absorbed contact's key are
//     remapped onto the member's key, so the single node aggregates every tie (and a
//     tie that collapses onto itself, or a now-duplicate one, is dropped).
// Pure; returns a ready-to-use people set + the remapped links/groups. No linked
// contacts → it's a thin pass-through over buildPeople.
export function unifyCircle(
  contacts: Contact[],
  members: Member[],
  links: ContactLink[],
  groups: ContactGroupRaw[],
  pets: Pet[] = [],
): { people: Person[]; links: ContactLink[]; groups: ContactGroupRaw[] } {
  const memberById = new Map(members.map((m) => [m.id, m]))
  // contact.id → member.id, for contacts hard-linked to a member that still exists.
  const absorbed = new Map<string, string>()
  for (const c of contacts) {
    if (c.memberId && memberById.has(c.memberId)) absorbed.set(c.id, c.memberId)
  }
  if (absorbed.size === 0) return { people: buildPeople(contacts, members, pets), links, groups }

  // member.id → its linked contact (first wins if several somehow point at one member).
  const contactByMember = new Map<string, Contact>()
  for (const c of contacts) {
    const mid = absorbed.get(c.id)
    if (mid && !contactByMember.has(mid)) contactByMember.set(mid, c)
  }

  // Enrich each member with the cercle-only fields its contact carries. The member's
  // own value wins when set (it's the identity record); the contact only fills gaps.
  const enrichedMembers = members.map((m) => {
    const c = contactByMember.get(m.id)
    if (!c) return m
    return {
      ...m,
      gender: m.gender ?? c.gender,
      birthday: m.birthday ?? c.birthday,
      email: m.email ?? c.email,
      phone: m.phone ?? c.phone,
    }
  })

  const people = buildPeople(
    contacts.filter((c) => !absorbed.has(c.id)),
    enrichedMembers,
    pets,
  )

  // An endpoint pointing at an absorbed contact becomes its member.
  const remap = (kind: PersonKind, id: string): { kind: PersonKind; id: string } => {
    const mid = kind === 'contact' ? absorbed.get(id) : undefined
    return mid ? { kind: 'member', id: mid } : { kind, id }
  }

  // Remap links; drop self-links and de-dupe pairs that now coincide.
  const seen = new Set<string>()
  const remappedLinks: ContactLink[] = []
  for (const l of links) {
    const a = remap(l.personAKind, l.personAId)
    const b = remap(l.personBKind, l.personBId)
    const aKey = personKey(a.kind, a.id)
    const bKey = personKey(b.kind, b.id)
    if (aKey === bKey) continue // collapsed onto itself — meaningless
    const pair = aKey < bKey ? `${aKey}|${bKey}|${l.type}` : `${bKey}|${aKey}|${l.reverseType}`
    if (seen.has(pair)) continue
    seen.add(pair)
    remappedLinks.push({ ...l, personAId: a.id, personAKind: a.kind, personBId: b.id, personBKind: b.kind })
  }

  // Remap group memberships the same way, de-duping within each group.
  const remappedGroups = groups.map((g) => {
    const within = new Set<string>()
    const memberKeys = g.memberKeys
      .map((mk) => remap(mk.personKind, mk.personId))
      .filter((r) => {
        const key = personKey(r.kind, r.id)
        if (within.has(key)) return false
        within.add(key)
        return true
      })
      .map((r) => ({ personId: r.id, personKind: r.kind }))
    return { ...g, memberKeys }
  })

  return { people, links: remappedLinks, groups: remappedGroups }
}

// A link's two endpoints as composite keys (for graph/group math over `Person.key`).
export const linkEndpoints = (l: ContactLink): { aKey: string; bKey: string } => ({
  aKey: personKey(l.personAKind, l.personAId),
  bKey: personKey(l.personBKind, l.personBId),
})

// ---- Relationship vocabulary -----------------------------------------------

export type RelationshipType =
  | 'parent'
  | 'child'
  | 'sibling'
  | 'spouse'
  | 'partner'
  | 'grandparent'
  | 'grandchild'
  | 'aunt_uncle'
  | 'niece_nephew'
  | 'cousin'
  | 'in_law'
  | 'step_family'
  | 'relative' // generic "same family" kin tie — no precise rung known (used by « Compléter les familles »)
  | 'owner' // a human who OWNS a pet (inverse: 'pet') — binds the animal into the family group, but is NOT a closure rung (a pet never becomes a grandparent)
  | 'pet' // an animal that belongs to a person (inverse: 'owner')
  | 'best_friend'
  | 'friend'
  | 'colleague'
  | 'neighbor'
  | 'other'

type RelationshipGroup = 'immediate' | 'extended' | 'social' | 'animal' | 'other'

const RELATIONSHIP_GROUPS: Record<RelationshipGroup, { label: Bi; order: number }> = {
  immediate: { label: { fr: 'Famille proche', en: 'Immediate family' }, order: 0 },
  extended: { label: { fr: 'Famille élargie', en: 'Extended family' }, order: 1 },
  social: { label: { fr: 'Cercle social', en: 'Social' }, order: 2 },
  animal: { label: { fr: 'Animaux', en: 'Pets' }, order: 3 },
  other: { label: { fr: 'Autres', en: 'Other' }, order: 4 },
}

interface RelationshipConfig {
  label: Bi // singular relation label ("Parent")
  group: RelationshipGroup
  groupOrder: number
  color: string // hex accent (reuses the warm Babillard palette)
}

// Keys are stable; labels are FR-CA first. Colours are calm, warm hexes (not the
// tailwind classes the original used) so they sit beside the member-face palette.
const RELATIONSHIP_CONFIG: Record<RelationshipType, RelationshipConfig> = {
  parent: { label: { fr: 'Parent', en: 'Parent' }, group: 'immediate', groupOrder: 0, color: '#5891AC' },
  child: { label: { fr: 'Enfant', en: 'Child' }, group: 'immediate', groupOrder: 1, color: '#6FA0B7' },
  sibling: { label: { fr: 'Frère / sœur', en: 'Sibling' }, group: 'immediate', groupOrder: 2, color: '#7FAEC3' },
  spouse: { label: { fr: 'Conjoint·e', en: 'Spouse' }, group: 'immediate', groupOrder: 3, color: '#C75C7A' },
  partner: { label: { fr: 'Partenaire', en: 'Partner' }, group: 'immediate', groupOrder: 4, color: '#D17592' },
  grandparent: { label: { fr: 'Grand-parent', en: 'Grandparent' }, group: 'extended', groupOrder: 0, color: '#95527A' },
  grandchild: { label: { fr: 'Petit-enfant', en: 'Grandchild' }, group: 'extended', groupOrder: 1, color: '#A86A91' },
  aunt_uncle: { label: { fr: 'Oncle / tante', en: 'Aunt / uncle' }, group: 'extended', groupOrder: 2, color: '#8A6BA8' },
  niece_nephew: { label: { fr: 'Neveu / nièce', en: 'Niece / nephew' }, group: 'extended', groupOrder: 3, color: '#9E84B8' },
  cousin: { label: { fr: 'Cousin·e', en: 'Cousin' }, group: 'extended', groupOrder: 4, color: '#7E6BB0' },
  in_law: { label: { fr: 'Belle-famille', en: 'In-law' }, group: 'extended', groupOrder: 5, color: '#5E8C8C' },
  step_family: { label: { fr: 'Famille recomposée', en: 'Step-family' }, group: 'extended', groupOrder: 6, color: '#5AA08C' },
  relative: { label: { fr: 'Membre de la famille', en: 'Family member' }, group: 'extended', groupOrder: 7, color: '#6E8FA0' },
  owner: { label: { fr: 'Propriétaire', en: 'Owner' }, group: 'animal', groupOrder: 0, color: '#C7873F' },
  pet: { label: { fr: 'Animal', en: 'Pet' }, group: 'animal', groupOrder: 1, color: '#C7873F' },
  best_friend: { label: { fr: 'Meilleur·e ami·e', en: 'Best friend' }, group: 'social', groupOrder: 0, color: '#4F8A4A' },
  friend: { label: { fr: 'Ami·e', en: 'Friend' }, group: 'social', groupOrder: 1, color: '#6B8A52' },
  colleague: { label: { fr: 'Collègue', en: 'Colleague' }, group: 'social', groupOrder: 2, color: '#D9842A' },
  neighbor: { label: { fr: 'Voisin·e', en: 'Neighbour' }, group: 'social', groupOrder: 3, color: '#C2563A' },
  other: { label: { fr: 'Autre', en: 'Other' }, group: 'other', groupOrder: 0, color: '#8A8780' },
}

// A → B implies B → A. Canonical for the client picker; the server keeps a twin
// in functions/_lib/cercleRelations.ts (it can't import SPA code) and derives
// reverse_type from it so a client can't desync the edge. cercle.test.ts pins the
// two in lockstep.
export const RELATIONSHIP_INVERSES: Record<RelationshipType, RelationshipType> = {
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
  owner: 'pet',
  pet: 'owner',
  best_friend: 'best_friend',
  friend: 'friend',
  colleague: 'colleague',
  neighbor: 'neighbor',
  other: 'other',
}

export const ALL_RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_CONFIG) as RelationshipType[]

export function relLabel(type: RelationshipType, lang: keyof Bi): string {
  return RELATIONSHIP_CONFIG[type].label[lang]
}

// Returns a gender-aware relationship label when the subject's gender is known.
// Falls back to the neutral label (already in RELATIONSHIP_CONFIG) when unknown.
export function genderedRelLabel(type: RelationshipType, gender: 'm' | 'f' | null, lang: 'fr' | 'en'): string {
  if (gender === 'f') {
    const FEM_FR: Partial<Record<RelationshipType, string>> = {
      parent: 'Mère', child: 'Fille', sibling: 'Sœur', spouse: 'Conjointe',
      partner: 'Partenaire', grandparent: 'Grand-mère', grandchild: 'Petite-fille',
      aunt_uncle: 'Tante', niece_nephew: 'Nièce', in_law: 'Belle-famille',
      step_family: 'Famille recomposée', best_friend: 'Meilleure amie', friend: 'Amie',
      colleague: 'Collègue', neighbor: 'Voisine', cousin: 'Cousine',
    }
    const FEM_EN: Partial<Record<RelationshipType, string>> = {
      parent: 'Mother', child: 'Daughter', sibling: 'Sister', spouse: 'Wife',
      partner: 'Partner', grandparent: 'Grandmother', grandchild: 'Granddaughter',
      aunt_uncle: 'Aunt', niece_nephew: 'Niece', in_law: 'In-law', step_family: 'Step-family',
      best_friend: 'Best friend', friend: 'Friend', colleague: 'Colleague', neighbor: 'Neighbour', cousin: 'Cousin',
    }
    const map = lang === 'fr' ? FEM_FR : FEM_EN
    return map[type] ?? relLabel(type, lang)
  }
  if (gender === 'm') {
    const MASC_FR: Partial<Record<RelationshipType, string>> = {
      parent: 'Père', child: 'Fils', sibling: 'Frère', spouse: 'Conjoint',
      partner: 'Partenaire', grandparent: 'Grand-père', grandchild: 'Petit-fils',
      aunt_uncle: 'Oncle', niece_nephew: 'Neveu', in_law: 'Belle-famille',
      step_family: 'Famille recomposée', best_friend: 'Meilleur ami', friend: 'Ami',
      colleague: 'Collègue', neighbor: 'Voisin', cousin: 'Cousin',
    }
    const MASC_EN: Partial<Record<RelationshipType, string>> = {
      parent: 'Father', child: 'Son', sibling: 'Brother', spouse: 'Husband',
      partner: 'Partner', grandparent: 'Grandfather', grandchild: 'Grandson',
      aunt_uncle: 'Uncle', niece_nephew: 'Nephew', in_law: 'In-law', step_family: 'Step-family',
      best_friend: 'Best friend', friend: 'Friend', colleague: 'Colleague', neighbor: 'Neighbour', cousin: 'Cousin',
    }
    const map = lang === 'fr' ? MASC_FR : MASC_EN
    return map[type] ?? relLabel(type, lang)
  }
  return relLabel(type, lang)
}

// Relationship types grouped + ordered, for a sectioned picker (ALL groups,
// including « Animaux »). Callers render via `relationshipPickerGroups`, which
// shows/hides the pet group by context.
function groupedRelationshipTypes(): { group: RelationshipGroup; label: Bi; types: RelationshipType[] }[] {
  const groups = (Object.entries(RELATIONSHIP_GROUPS) as [RelationshipGroup, { label: Bi; order: number }][])
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([group, value]) => ({ group, label: value.label, types: [] as RelationshipType[] }))
  ;(Object.entries(RELATIONSHIP_CONFIG) as [RelationshipType, RelationshipConfig][])
    .sort(([, a], [, b]) => a.groupOrder - b.groupOrder)
    .forEach(([type, config]) => {
      groups.find((g) => g.group === config.group)?.types.push(type)
    })
  return groups
}

// The relationship groups to render in a CONNECT/EDIT picker, given whether a PET is
// one of the two endpoints. A pet can't carry a human rung (parent/grandparent…), so
// when one is involved we offer only the « Animaux » ties (Propriétaire / Animal) plus
// the generic kin / autre fallbacks; between two humans the pet group is hidden so it
// never leaks into a human-to-human picker. Used by ConnectPeople + LinkComposer
// (per-endpoint) and FamilyBuilder (always human → `false`).
export function relationshipPickerGroups(
  petInvolved: boolean,
): { group: RelationshipGroup; label: Bi; types: RelationshipType[] }[] {
  return groupedRelationshipTypes()
    .map((g) => ({
      ...g,
      types: g.types.filter((ty) => {
        const isPetType = ty === 'owner' || ty === 'pet'
        return petInvolved ? isPetType || ty === 'relative' || ty === 'other' : !isPetType
      }),
    }))
    .filter((g) => g.types.length > 0)
}

// Family edges (the ones that bind people into a "family"); a friend/colleague
// link does NOT merge two family groups.
const FAMILY_REL_TYPES = new Set<RelationshipType>([
  'parent',
  'child',
  'sibling',
  'spouse',
  'partner',
  'grandparent',
  'grandchild',
  'aunt_uncle',
  'niece_nephew',
  'cousin',
  'in_law',
  'step_family',
  'relative', // generic kin — binds a family + appears in the Arbre (same-generation)
  'owner', // a pet's human — binds the animal into its owner's family (same band, never a rung)
  'pet',
])

// Is this a blood/family tie (binds a family + appears in the Arbre tree)? Social
// ties (friend/colleague/neighbor) are not.
export const isFamilyRel = (type: RelationshipType): boolean => FAMILY_REL_TYPES.has(type)

// ---- Pet ownership + household reach ----------------------------------------

// Each PET's owner person-keys, derived from the owner/pet links. A tie is stored as
// "A is owner of B(pet)" (type 'owner', B a pet) or its mirror "A(pet) is pet of B"
// (type 'pet', A a pet); either direction yields the same pet→owner mapping. Pure.
export function petOwners(links: ContactLink[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  const add = (petKey: string, ownerKey: string) => {
    if (!m.has(petKey)) m.set(petKey, new Set())
    m.get(petKey)!.add(ownerKey)
  }
  for (const l of links) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    if (l.type === 'owner' && l.personBKind === 'pet') add(bKey, aKey)
    else if (l.type === 'pet' && l.personAKind === 'pet') add(aKey, bKey)
  }
  return m
}

// Does this pet belong to the Maisonnée? Yes when at least one owner is a household
// member, OR when it has no owner at all (an unowned pet defaults to "ours" — the
// common case: add your dog and it's in the Maisonnée). A pet owned only by outside
// contacts (a friend's pet) is NOT a household pet — it follows its owner into Social.
export function isHouseholdPet(petKey: string, owners: Map<string, Set<string>>, householdMemberKeys: Set<string>): boolean {
  const o = owners.get(petKey)
  if (!o || o.size === 0) return true
  for (const k of o) if (householdMemberKeys.has(k)) return true
  return false
}

// Everyone reachable from the seed people (the household members) by walking ONLY
// FAMILY relationship edges over the given link set (pass the CLOSED links so derived
// ties — shared grandparents, cousins… — count). This is your close + extended family,
// i.e. the Famille tab. A friend bridges to you by a SOCIAL edge, which this walk never
// crosses, so the friend and their own relatives/pets stay out (→ Social). Pure; the
// returned set includes the seeds themselves. Only people present in `people` are walked.
export function familyReachableKeys(seedKeys: Set<string>, people: Person[], links: ContactLink[]): Set<string> {
  const present = new Set(people.map((p) => p.key))
  const adj = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push(b)
  }
  for (const l of links) {
    if (!isFamilyRel(l.type)) continue
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    if (!present.has(aKey) || !present.has(bKey)) continue
    addEdge(aKey, bKey)
    addEdge(bKey, aKey)
  }
  const seen = new Set<string>()
  const queue: string[] = []
  for (const k of seedKeys) if (present.has(k) && !seen.has(k)) {
    seen.add(k)
    queue.push(k)
  }
  while (queue.length) {
    const cur = queue.shift()!
    for (const nx of adj.get(cur) ?? []) if (!seen.has(nx)) {
      seen.add(nx)
      queue.push(nx)
    }
  }
  return seen
}

export interface FamilyGroup {
  id: string // the root person key
  name: string // "<lastName> family" / "Famille <nom>"
  memberKeys: Set<string> // composite Person.key values
  colorIndex: number // assigned in detection order; reserved for a future graph tint
}

// THE shared Union-Find (disjoint-set) over string keys — the connected-components
// primitive that detectFamilyGroups, closedLinks, CercleWeb and CercleTree all used to
// hand-roll. Path-compressed find + union-by-rank; `union` lazily adds unknown keys so
// the sibling-closure case can union without pre-seeding, and `has`/`add` let the graph
// cases seed exactly the people that exist. Pure, no React.
export class UnionFind {
  private parent = new Map<string, string>()
  private rank = new Map<string, number>()
  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
      this.rank.set(x, 0)
    }
  }
  has(x: string): boolean {
    return this.parent.has(x)
  }
  find(x: string): string {
    const p = this.parent.get(x)
    if (p === undefined) {
      this.add(x)
      return x
    }
    if (p === x) return x
    const r = this.find(p)
    this.parent.set(x, r)
    return r
  }
  union(a: string, b: string): void {
    this.add(a)
    this.add(b)
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    const rka = this.rank.get(ra) ?? 0
    const rkb = this.rank.get(rb) ?? 0
    if (rka < rkb) this.parent.set(ra, rb)
    else if (rka > rkb) this.parent.set(rb, ra)
    else {
      this.parent.set(rb, ra)
      this.rank.set(ra, rka + 1)
    }
  }
  // Group every known key by its root component.
  components(): Map<string, string[]> {
    const comp = new Map<string, string[]>()
    for (const key of this.parent.keys()) {
      const r = this.find(key)
      if (!comp.has(r)) comp.set(r, [])
      comp.get(r)!.push(key)
    }
    return comp
  }
}

// Detect family groups with Union-Find over the FAMILY edges. People (contacts AND
// members) connected by a family relationship land in the same group; pure,
// deterministic, no React. Operates on composite `Person.key` so a contact id and a
// member id can never be confused. (Ported from famolo's detectFamilyGroups.)
export function detectFamilyGroups(
  people: Person[],
  links: ContactLink[],
  familyWord: (lastOrFirst: string) => string,
): FamilyGroup[] {
  const uf = new UnionFind()
  people.forEach((p) => uf.add(p.key))

  links.forEach((l) => {
    if (!FAMILY_REL_TYPES.has(l.type)) return
    const { aKey, bKey } = linkEndpoints(l)
    if (uf.has(aKey) && uf.has(bKey)) uf.union(aKey, bKey)
  })

  const byRoot = new Map<string, Set<string>>()
  people.forEach((p) => {
    const root = uf.find(p.key)
    if (!byRoot.has(root)) byRoot.set(root, new Set())
    byRoot.get(root)!.add(p.key)
  })

  const map = new Map(people.map((p) => [p.key, p]))
  let colorIndex = 0
  return Array.from(byRoot.entries())
    .filter(([, m]) => m.size > 1) // a lone person isn't a "family"
    .sort((a, b) => b[1].size - a[1].size)
    .map(([rootKey, memberKeys]) => {
      const root = map.get(rootKey)
      const word = root ? root.lastName || root.firstName : ''
      return { id: rootKey, name: familyWord(word), memberKeys, colorIndex: colorIndex++ }
    })
}

// ---- Generation layout (for the Arbre / family-tree view) -------------------

// How many generations DOWN a relationship moves B relative to A, where the link
// reads "A is [type] of B" (the stored direction). +1 = B is one generation below
// A. Only blood/family ties place a generation; social ties aren't in the tree.
const GEN_DELTA: Partial<Record<RelationshipType, number>> = {
  parent: 1, // A parent of B → B is below A
  child: -1,
  grandparent: 2,
  grandchild: -2,
  aunt_uncle: 1, // A aunt/uncle of B → B is a generation below A
  niece_nephew: -1,
  sibling: 0,
  spouse: 0,
  partner: 0,
  cousin: 0,
  in_law: 0,
  step_family: 0,
  relative: 0, // generic kin: no rung known → place beside its known relatives, same band
  owner: 0, // a pet sits on the same band as its owner (no generational rung)
  pet: 0,
}

// Assign each person a generation number via BFS over family edges (lower = older).
// Disconnected components each start at 0; within a component generations are
// relative. Returns a Map keyed by Person.key (only people reachable through a
// family edge are placed; the tree view shows those). Pure.
export function generationOf(people: Person[], links: ContactLink[]): Map<string, number> {
  // Adjacency: for each person key, neighbours with the generation delta to apply.
  const adj = new Map<string, { key: string; delta: number }[]>()
  const present = new Set(people.map((p) => p.key))
  const add = (from: string, to: string, delta: number) => {
    if (!adj.has(from)) adj.set(from, [])
    adj.get(from)!.push({ key: to, delta })
  }
  for (const l of links) {
    const d = GEN_DELTA[l.type]
    if (d === undefined) continue // social tie → not in the tree
    const { aKey, bKey } = linkEndpoints(l)
    if (!present.has(aKey) || !present.has(bKey)) continue
    add(aKey, bKey, d) // A→B
    add(bKey, aKey, -d) // and back
  }

  const gen = new Map<string, number>()
  // Visit components in a stable order (people order) so the result is deterministic.
  for (const p of people) {
    if (gen.has(p.key) || !adj.has(p.key)) continue // skip already-placed + isolated
    gen.set(p.key, 0)
    const queue = [p.key]
    while (queue.length) {
      const cur = queue.shift()!
      const g = gen.get(cur)!
      for (const { key, delta } of adj.get(cur) ?? []) {
        if (!gen.has(key)) {
          gen.set(key, g + delta)
          queue.push(key)
        }
      }
    }
  }
  return gen
}

// ---- Family builder ---------------------------------------------------------
// Define a whole family's relationships at once instead of one link at a time, two
// ways that share this one pure engine: drop people into generation BANDS, or set
// each person's relation to a single ANCHOR. Both yield directed GeneratedLink edges
// ("aKey is `type` of bKey"); the caller splits the keys (parsePersonKey) and POSTs
// to /api/cercle-links, which derives the inverse + rejects server-side duplicates.

export type FamilyBand = 'grandparents' | 'parents' | 'children'
export const FAMILY_BANDS: FamilyBand[] = ['grandparents', 'parents', 'children']

export interface GeneratedLink {
  aKey: string
  bKey: string
  type: RelationshipType
}

// Unordered pair key — there's at most ONE family tie per pair, so we de-dupe on the
// pair alone (ignoring direction/type), which also matches the server's dup rule.
const pairId = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`)

// Links implied by placing people into generation bands. Only UNAMBIGUOUS rules — a
// flat band model can't know which grandparent belongs to which parent, so we never
// invent that edge:
//   • two children in the same band  → siblings
//   • each parent → each child       → parent
//   • each grandparent → each child  → grandparent (true whichever side they're on)
//   • EXACTLY two parents            → spouses (the common nuclear case; 1 or 3+ is
//     ambiguous, so we leave it for the per-person editor)
// Self-pairs are impossible here (distinct people per slot) but within-set dups are
// collapsed. Order within a result is deterministic.
export function familyLinksFromBands(bands: {
  grandparents: string[]
  parents: string[]
  children: string[]
}): GeneratedLink[] {
  const out: GeneratedLink[] = []
  const seen = new Set<string>()
  const push = (aKey: string, bKey: string, type: RelationshipType) => {
    if (aKey === bKey) return
    const pk = pairId(aKey, bKey)
    if (seen.has(pk)) return
    seen.add(pk)
    out.push({ aKey, bKey, type })
  }
  const { grandparents, parents, children } = bands
  // children ↔ children: siblings
  for (let i = 0; i < children.length; i++)
    for (let j = i + 1; j < children.length; j++) push(children[i], children[j], 'sibling')
  // parents → children: parent
  for (const p of parents) for (const c of children) push(p, c, 'parent')
  // grandparents → children: grandparent
  for (const g of grandparents) for (const c of children) push(g, c, 'grandparent')
  // exactly two parents → spouses
  if (parents.length === 2) push(parents[0], parents[1], 'spouse')
  return out
}

// The inverse of `familyLinksFromBands`: read existing links back into generation
// bands so an ALREADY-configured family opens with its faces pre-placed (not all
// stranded in « À placer »). Bands carry ABSOLUTE meaning, so only the generational
// link types pin a rung — a stored 'grandparent'/'parent' tells us both ends:
//   • grandparent A-of-B → A: grandparents, B: children
//   • parent      A-of-B → A: parents,      B: children
//   • (their inverses grandchild/child mirror it)
// Grandparent links are authoritative (most specific) and win; parent/child links
// only fill rungs still unknown — so in a chain they never demote a pinned
// grandparent. sibling/spouse/partner then carry a known rung sideways to the
// generation-mates the band model leaves un-pinned (two parents, sibling kids).
// People with no generational tie stay un-placed (left in the tray for the user).
export function bandsFromLinks(humanKeys: string[], links: ContactLink[]): Record<string, FamilyBand> {
  const present = new Set(humanKeys)
  const LEVEL_BAND: Record<number, FamilyBand> = { 0: 'children', 1: 'parents', 2: 'grandparents' }
  const level = new Map<string, number>()
  const set = (key: string, lvl: number, authoritative: boolean) => {
    if (!present.has(key)) return
    if (authoritative || !level.has(key)) level.set(key, lvl)
  }

  // 1. Grandparent ties first (authoritative), then parent ties (fill-only).
  for (const auth of [true, false]) {
    for (const l of links) {
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      if (!present.has(aKey) || !present.has(bKey)) continue
      if (auth && l.type === 'grandparent') { set(aKey, 2, true); set(bKey, 0, true) }
      else if (auth && l.type === 'grandchild') { set(aKey, 0, true); set(bKey, 2, true) }
      else if (!auth && l.type === 'parent') { set(aKey, 1, false); set(bKey, 0, false) }
      else if (!auth && l.type === 'child') { set(aKey, 0, false); set(bKey, 1, false) }
    }
  }

  // 2. Carry a known rung sideways across same-generation ties (to a fixpoint, so a
  //    sibling-of-a-sibling resolves). Bounded by the human count.
  const sideways = new Set<RelationshipType>(['sibling', 'spouse', 'partner'])
  for (let pass = 0; pass < humanKeys.length; pass++) {
    let changed = false
    for (const l of links) {
      if (!sideways.has(l.type)) continue
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      if (!present.has(aKey) || !present.has(bKey)) continue
      if (level.has(aKey) && !level.has(bKey)) { level.set(bKey, level.get(aKey)!); changed = true }
      else if (level.has(bKey) && !level.has(aKey)) { level.set(aKey, level.get(bKey)!); changed = true }
    }
    if (!changed) break
  }

  const out: Record<string, FamilyBand> = {}
  for (const [key, lvl] of level) {
    const b = LEVEL_BAND[lvl]
    if (b) out[key] = b
  }
  return out
}

// Links from the "everyone's relation to one anchor" form: each pick reads
// "{person} is {type} of {anchor}". Picks without a type (skipped) are dropped.
export function familyLinksFromMatrix(
  anchorKey: string,
  picks: { key: string; type: RelationshipType | null }[],
): GeneratedLink[] {
  const out: GeneratedLink[] = []
  const seen = new Set<string>()
  for (const p of picks) {
    if (!p.type || p.key === anchorKey) continue
    const pk = pairId(p.key, anchorKey)
    if (seen.has(pk)) continue
    seen.add(pk)
    out.push({ aKey: p.key, bKey: anchorKey, type: p.type })
  }
  return out
}

// Drop generated links whose pair already has a tie (in either direction) — so
// re-running the builder over an existing family only adds what's missing.
export function dedupeNewLinks(generated: GeneratedLink[], existing: ContactLink[]): GeneratedLink[] {
  const have = new Set(existing.map((l) => pairId(personKey(l.personAKind, l.personAId), personKey(l.personBKind, l.personBId))))
  const out: GeneratedLink[] = []
  for (const g of generated) {
    const pk = pairId(g.aKey, g.bKey)
    if (have.has(pk)) continue
    have.add(pk)
    out.push(g)
  }
  return out
}

// ---- Birthday math ----------------------------------------------------------

// Parse 'YYYY-MM-DD' → parts. Year 0 (or '0000') means "year unknown" → yearKnown
// is false and age can't be computed. Returns null for empty/garbage.
export function parseBirthday(birthday: string | null | undefined): { year: number; month: number; day: number; yearKnown: boolean } | null {
  if (!birthday) return null
  const m = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(birthday.trim())
  if (!m) return null
  const year = +m[1]
  const month = +m[2]
  const day = +m[3]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day, yearKnown: year > 0 }
}

// Days until the next occurrence of this birthday, counting today as 0. Uses
// LOCAL calendar dates (no tz math needed — birthdays are whole days). Returns
// null when there's no parseable birthday.
export function daysUntilBirthday(birthday: string | null | undefined, now = new Date()): number | null {
  const p = parseBirthday(birthday)
  if (!p) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(now.getFullYear(), p.month - 1, p.day)
  if (next.getTime() < today.getTime()) next = new Date(now.getFullYear() + 1, p.month - 1, p.day)
  return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

// The age the person turns ON their next birthday — null when the year is unknown.
export function ageOnNextBirthday(birthday: string | null | undefined, now = new Date()): number | null {
  const p = parseBirthday(birthday)
  if (!p || !p.yearKnown) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisYear = new Date(now.getFullYear(), p.month - 1, p.day)
  const turnYear = thisYear.getTime() < today.getTime() ? now.getFullYear() + 1 : now.getFullYear()
  return turnYear - p.year
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Localized month names (1-indexed access via [month-1]). Shared by the birthday
// picker + formatter so the two never disagree.
export const monthNames = (lang: keyof Bi): string[] => (lang === 'fr' ? MONTHS_FR : MONTHS_EN)

// Days in a month for the picker. February is 29 (leap-day birthdays are valid)
// since the year may be unknown anyway.
export function daysInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31
}

// Build a stored birthday string from parts. Year 0/empty → '0000' (unknown year);
// returns null until BOTH month and day are chosen (an incomplete date = no birthday).
export function makeBirthday(month: number, day: number, year: number | null): string | null {
  if (!month || !day) return null
  const y = String(year && year > 0 ? year : 0).padStart(4, '0')
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// "12 mars" / "March 12" — day + month, no year (years are often unknown and the
// calm board only cares about the day).
export function formatBirthday(birthday: string | null | undefined, lang: keyof Bi): string | null {
  const p = parseBirthday(birthday)
  if (!p) return null
  const months = lang === 'fr' ? MONTHS_FR : MONTHS_EN
  const month = months[p.month - 1]
  return lang === 'fr' ? `${p.day} ${month}` : `${month} ${p.day}`
}

export const fullName = (c: { firstName: string; lastName?: string | null; nickname?: string | null }): string =>
  c.nickname?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.firstName

// ---- Address ----------------------------------------------------------------

// "123 rue Principale, Québec, QC, G1A 1A1" — the address parts we hold, in postal
// order, dropping the empty ones. Null when nothing's filled in.
export function formatAddress(a: ContactAddress | null | undefined): string | null {
  if (!a) return null
  const parts = [a.street, a.city, a.state, a.postalCode, a.country].map((p) => p?.trim()).filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

// A Google Maps DIRECTIONS link to the address (opens turn-by-turn in the Maps app
// on a phone, the web map on a tablet). Null when there's no address to route to.
export function mapsUrl(a: ContactAddress | null | undefined): string | null {
  const s = formatAddress(a)
  return s ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s)}` : null
}

// ---- Named groups -----------------------------------------------------------

export type GroupKind = 'family' | 'friends' | 'work' | 'other'

export interface ContactGroup {
  id: string
  name: string
  kind: GroupKind
  colour: string | null
  memberKeys: Set<string> // composite Person.key values
}

// Wire shape returned by GET /api/cercle (before conversion to Set).
export interface ContactGroupRaw {
  id: string
  name: string
  kind: GroupKind
  colour: string | null
  memberKeys: { personId: string; personKind: PersonKind }[]
}

export function buildGroups(raw: ContactGroupRaw[]): ContactGroup[] {
  return raw.map((g) => ({
    ...g,
    memberKeys: new Set(g.memberKeys.map((m) => personKey(m.personKind, m.personId))),
  }))
}

// Putting people together in a « friends »-kind named group MEANS they know one
// another, so surface that as a friend tie in the Liens view + each person's
// relationship row — without making you draw every edge by hand. Emits ONE
// undirected friend ContactLink per pair of members in each friends-kind group,
// skipping any pair that already carries a stored tie of ANY type (an explicit
// relationship — even « colleague » or a family link — always wins). Pure +
// deterministic; the synthetic links carry a `group-friend:` id so consumers can
// tell them from stored ones, mirroring closedLinks' `derived:` convention. Feed
// the result alongside the stored links into closedLinks (friend is a social tie,
// so it passes the closure through unchanged and never touches the family math).
export function friendLinksFromGroups(groups: ContactGroup[], existing: ContactLink[]): ContactLink[] {
  const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const have = new Set(
    existing.map((l) => pair(personKey(l.personAKind, l.personAId), personKey(l.personBKind, l.personBId))),
  )
  const out: ContactLink[] = []
  for (const g of groups) {
    if (g.kind !== 'friends') continue
    const keys = [...g.memberKeys].sort() // sorted → pairs already canonical (a < b)
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pk = pair(keys[i], keys[j])
        if (have.has(pk)) continue
        have.add(pk)
        const a = parsePersonKey(keys[i])
        const b = parsePersonKey(keys[j])
        out.push({
          id: `group-friend:${g.id}:${pk}`,
          personAId: a.id,
          personAKind: a.kind,
          personBId: b.id,
          personBKind: b.kind,
          type: 'friend',
          reverseType: 'friend',
          label: null,
          notes: null,
        })
      }
    }
  }
  return out
}

// ---- Family grouping (shared by the relationship views) ---------------------

// Per-person family grouping consumed by BOTH relationship views (Liens + Arbre):
//   • `group`  — the cluster a person belongs to (so the Arbre can keep a family
//                together within a generation band)
//   • `colour` — the disc tint, REUSING the directory's family colours: a named
//                group's colour wins; the Maisonnée + auto-detected families keep
//                each member's own colour (matching Liste's rows)
//   • `order`  — a stable left→right position for the cluster
// One source of truth so Liste, Liens and Arbre never drift on how a family reads.
export type FamilyGrouping = Map<string, { group: string; colour: string | null; order: number }>

// Build the grouping from the same three buckets the directory partitions by. Named
// groups take precedence (that's where Liste paints colour), then the Maisonnée,
// then auto-detected families. Pure + deterministic.
export function buildFamilyGrouping(
  householdKeys: Set<string>,
  namedGroups: ContactGroup[],
  familyGroups: FamilyGroup[],
): FamilyGrouping {
  const m: FamilyGrouping = new Map()
  let next = 0
  const orderOf = new Map<string, number>()
  const ord = (id: string) => orderOf.get(id) ?? (orderOf.set(id, next), next++)
  for (const g of namedGroups) for (const k of g.memberKeys) if (!m.has(k)) m.set(k, { group: g.id, colour: g.colour, order: ord(g.id) })
  for (const k of householdKeys) if (!m.has(k)) m.set(k, { group: 'household', colour: null, order: ord('household') })
  for (const g of familyGroups) for (const k of g.memberKeys) if (!m.has(k)) m.set(k, { group: g.id, colour: null, order: ord(g.id) })
  return m
}

// The disc colour for a person in the relationship views: the family group's colour
// when set, else the person's own. The one resolver both views share.
export const discColour = (grouping: FamilyGrouping | undefined, p: Person): string | null =>
  grouping?.get(p.key)?.colour ?? p.colour

// ---- « Notre monde » — the big-picture overview (islands + bridges) ----------
// A zoom-OUT of the whole circle: each cluster (the Maisonnée, your families, your
// groups) becomes one ISLAND; every person shows ONCE, in their highest-priority
// island; and a BRIDGE links two islands wherever a person bridges them — so you see
// not one family or one person, but how the whole social world fits together.

export interface WorldClusterInput {
  id: string
  name: string
  kind: 'household' | 'family' | 'group'
  groupKind?: GroupKind | null
  colour: string | null
  memberKeys: string[]
}
export interface WorldIsland {
  id: string
  name: string
  kind: 'household' | 'family' | 'group' | 'others'
  groupKind: GroupKind | null
  colour: string | null
  memberKeys: string[] // PRIMARY members — each present person lands in exactly one island
}
export interface WorldBridge {
  aId: string
  bId: string
  viaKeys: string[] // the people who tie the two islands together (for narration)
}
export interface World {
  islands: WorldIsland[]
  bridges: WorldBridge[]
}

// Assemble the clusters that make up the world, in PRIORITY order (a person lands in
// the first that holds them): the Maisonnée, your named family groups, the
// auto-detected families, then your social groups (amis / travail / voisins / autre).
// Pure — the caller (the world scene) passes the unified people, the closed links, and
// the named groups; auto-families are detected here over the people not already in the
// household or a named family.
export function worldClustersFrom(
  people: Person[],
  links: ContactLink[],
  namedGroups: ContactGroup[],
  householdKeys: Set<string>,
  householdName: string,
  householdColour: string,
  familyWord: (lastOrFirst: string) => string,
): WorldClusterInput[] {
  const present = new Set(people.map((p) => p.key))
  const clusters: WorldClusterInput[] = []

  const houseMembers = [...householdKeys].filter((k) => present.has(k))
  if (houseMembers.length)
    clusters.push({ id: 'household', name: householdName, kind: 'household', groupKind: null, colour: householdColour, memberKeys: houseMembers })

  // Named family groups (your extended families you built by hand).
  for (const g of namedGroups) {
    if (g.kind !== 'family') continue
    const keys = [...g.memberKeys].filter((k) => present.has(k))
    if (keys.length) clusters.push({ id: `group:${g.id}`, name: g.name, kind: 'family', groupKind: 'family', colour: g.colour, memberKeys: keys })
  }

  // Auto-detected families over people not already in the household or a named family.
  const namedFamilyKeys = new Set(namedGroups.filter((g) => g.kind === 'family').flatMap((g) => [...g.memberKeys]))
  const autoPeople = people.filter((p) => !householdKeys.has(p.key) && !namedFamilyKeys.has(p.key))
  for (const a of detectFamilyGroups(autoPeople, links, familyWord))
    clusters.push({ id: `auto:${a.id}`, name: a.name, kind: 'family', groupKind: null, colour: null, memberKeys: [...a.memberKeys] })

  // Social named groups last.
  for (const g of namedGroups) {
    if (g.kind === 'family') continue
    const keys = [...g.memberKeys].filter((k) => present.has(k))
    if (keys.length) clusters.push({ id: `group:${g.id}`, name: g.name, kind: 'group', groupKind: g.kind, colour: g.colour, memberKeys: keys })
  }
  return clusters
}

// Turn the priority-ordered clusters into the world: assign every present person to
// their FIRST cluster (primary island); collect people in no cluster into an
// « Autres » island; and draw a BRIDGE between two islands whenever a person belongs
// to both (shared membership) or a link joins someone in one to someone in the other.
// Each bridge carries the bridging person-keys for the spoken narration. Pure +
// deterministic; empty islands (everyone claimed by a higher-priority cluster) drop.
export function buildWorld(
  people: Person[],
  links: ContactLink[],
  clusters: WorldClusterInput[],
  othersName: string,
): World {
  const present = new Set(people.map((p) => p.key))
  const raw = clusters.map((c) => ({ c, keys: c.memberKeys.filter((k) => present.has(k)) }))

  // Primary island per person: first cluster (priority order) that contains them.
  const OTHERS_ID = '__others__'
  const primary = new Map<string, string>()
  for (const { c, keys } of raw) for (const k of keys) if (!primary.has(k)) primary.set(k, c.id)
  for (const p of people) if (!primary.has(p.key)) primary.set(p.key, OTHERS_ID)

  const byIsland = new Map<string, string[]>()
  for (const [k, id] of primary) {
    if (!byIsland.has(id)) byIsland.set(id, [])
    byIsland.get(id)!.push(k)
  }

  const islands: WorldIsland[] = []
  for (const c of clusters) {
    const m = byIsland.get(c.id)
    if (m && m.length) islands.push({ id: c.id, name: c.name, kind: c.kind, groupKind: c.groupKind ?? null, colour: c.colour, memberKeys: m })
  }
  const othersM = byIsland.get(OTHERS_ID)
  if (othersM && othersM.length) islands.push({ id: OTHERS_ID, name: othersName, kind: 'others', groupKind: null, colour: null, memberKeys: othersM })

  const islandIds = new Set(islands.map((i) => i.id))
  const islandOf = (k: string): string | null => {
    const id = primary.get(k)
    return id && islandIds.has(id) ? id : null
  }

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const bridgeVia = new Map<string, Set<string>>()
  const addVia = (a: string, b: string, via: string) => {
    if (a === b || !islandIds.has(a) || !islandIds.has(b)) return
    const pk = pairKey(a, b)
    if (!bridgeVia.has(pk)) bridgeVia.set(pk, new Set())
    bridgeVia.get(pk)!.add(via)
  }

  // Shared membership: a person who RAWLY belongs to several (surviving) islands.
  const memberIslands = new Map<string, Set<string>>()
  for (const { c, keys } of raw) {
    if (!islandIds.has(c.id)) continue
    for (const k of keys) {
      if (!memberIslands.has(k)) memberIslands.set(k, new Set())
      memberIslands.get(k)!.add(c.id)
    }
  }
  for (const [k, ids] of memberIslands) {
    const arr = [...ids]
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) addVia(arr[i], arr[j], k)
  }

  // Cross-island links: a tie whose two endpoints have different primary islands.
  for (const l of links) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    const ia = islandOf(aKey)
    const ib = islandOf(bKey)
    if (ia && ib && ia !== ib) {
      addVia(ia, ib, aKey)
      addVia(ia, ib, bKey)
    }
  }

  const bridges: WorldBridge[] = [...bridgeVia.entries()].map(([pk, via]) => {
    const [aId, bId] = pk.split('|')
    return { aId, bId, viaKeys: [...via] }
  })
  return { islands, bridges }
}

// ---- Inference suggestions --------------------------------------------------

export interface InferredLink {
  aKey: string
  bKey: string
  type: RelationshipType
  reverseType: RelationshipType
  reason: Bi
}

// Compute transitive relationship suggestions from existing links. Pure — never
// mutates. Three rules:
//   1. Two people both parents of the same child → suggest spouse/partner
//   2. People sharing a parent → suggest sibling
//   3. Spouse's parents → suggest in-law
// Returns only suggestions not already present. The caller shows them as
// dismissable chips (they're never auto-applied).
export function inferLinks(people: Person[], links: ContactLink[]): InferredLink[] {
  // Build adjacency: personKey → [{type, otherKey}] FROM THAT PERSON'S PERSPECTIVE.
  // E.g. adj[A] = [{type:'parent', otherKey:B}] means "A is parent of B".
  const adj = new Map<string, { type: RelationshipType; otherKey: string }[]>()
  const present = new Set(people.map((p) => p.key))
  const addEdge = (from: string, type: RelationshipType, to: string) => {
    if (!adj.has(from)) adj.set(from, [])
    adj.get(from)!.push({ type, otherKey: to })
  }
  for (const l of links) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    if (!present.has(aKey) || !present.has(bKey)) continue
    addEdge(aKey, l.type, bKey)
    addEdge(bKey, l.reverseType, aKey)
  }

  // Order-independent pair key for dedup.
  const pairKey = (a: string, b: string) => (a < b ? `${a}||${b}` : `${b}||${a}`)
  const existing = new Set(
    links.map((l) => pairKey(personKey(l.personAKind, l.personAId), personKey(l.personBKind, l.personBId))),
  )

  const suggestions = new Map<string, InferredLink>()
  const suggest = (aKey: string, bKey: string, type: RelationshipType, reason: Bi) => {
    if (aKey === bKey) return
    const pk = pairKey(aKey, bKey)
    if (existing.has(pk) || suggestions.has(pk)) return
    // Canonicalize: smaller key is always A so the same pair always maps identically.
    const [fA, fB, fT] =
      aKey < bKey ? [aKey, bKey, type] : [bKey, aKey, RELATIONSHIP_INVERSES[type]]
    suggestions.set(pk, { aKey: fA, bKey: fB, type: fT, reverseType: RELATIONSHIP_INVERSES[fT], reason })
  }

  const neighbors = (key: string, type: RelationshipType) =>
    (adj.get(key) ?? []).filter((e) => e.type === type).map((e) => e.otherKey)

  for (const person of people) {
    const key = person.key

    // Rule 1: co-parents → spouse
    // adj[key].type='parent' means key is parent-of child; find other parents of that child.
    for (const child of neighbors(key, 'parent')) {
      // adj[child].type='child' means child is child-of that key — those are child's parents.
      for (const coParent of neighbors(child, 'child')) {
        if (coParent !== key) suggest(key, coParent, 'spouse', { fr: 'Parents du même enfant', en: 'Co-parents' })
      }
    }

    // Rule 2: siblings from same parent
    for (const parent of neighbors(key, 'child')) {
      for (const sib of neighbors(parent, 'parent')) {
        if (sib !== key) suggest(key, sib, 'sibling', { fr: 'Même parent', en: 'Same parent' })
      }
    }

    // Rule 3: spouse's parents → in-laws
    for (const spouse of [...neighbors(key, 'spouse'), ...neighbors(key, 'partner')]) {
      for (const spouseParent of neighbors(spouse, 'child')) {
        suggest(key, spouseParent, 'in_law', { fr: "Parent du conjoint·e", en: "Spouse's parent" })
      }
    }
  }

  return [...suggestions.values()]
}

// ---- Relationship closure (derive implied family ties) ----------------------

// The family types the closure REASONS over. spouse/partner/in_law/step_family are
// deliberately excluded — a spouse's blood relatives aren't yours, and step ties
// don't propagate like full ones (they pass through to display untouched).
const CLOSURE_TYPES = new Set<RelationshipType>([
  'parent',
  'child',
  'sibling',
  'grandparent',
  'grandchild',
  'aunt_uncle',
  'niece_nephew',
  'cousin',
])

// Show-order priority for a person's relationships (lower = first): immediate
// family before extended before social. Drives which tie a one-line row surfaces.
const REL_PRIORITY: Record<RelationshipType, number> = {
  spouse: 0,
  partner: 0,
  parent: 1,
  child: 1,
  sibling: 2,
  grandparent: 3,
  grandchild: 3,
  aunt_uncle: 4,
  niece_nephew: 4,
  cousin: 5,
  in_law: 6,
  step_family: 6,
  relative: 6,
  owner: 6,
  pet: 6,
  best_friend: 7,
  friend: 8,
  colleague: 8,
  neighbor: 8,
  other: 9,
}
export const relPriority = (t: RelationshipType): number => REL_PRIORITY[t]

// Derive the FULL family relationship set from the minimal stored links, so a tie
// added at ONE point propagates the way a real family does:
//   • siblings are a set (symmetric + transitive)
//   • siblings share their parents AND their grandparents
//   • a parent's parent is a grandparent (parent-of-parent chains)
//   • a parent's sibling is an aunt/uncle; the children of siblings are cousins
// Spouse/partner/in-law/step and every social tie pass through UNCHANGED (never
// derived). Pure + deterministic; returns ONE ContactLink per undirected pair+type
// — stored links keep their real id, derived ones get a `derived:` id — so every
// existing consumer (relationsOf, the tree, the ego/kid views) works on the richer,
// correct set without changing shape. This is what makes "link a grandparent to one
// grandchild" show up for ALL their siblings, and lets two families connect through
// a single junction link.
export function closedLinks(people: Person[], links: ContactLink[]): ContactLink[] {
  const present = new Set(people.map((p) => p.key))

  type E = { a: string; b: string; t: RelationshipType }
  const list: E[] = []
  const seen = new Set<string>() // `${a}|${b}|${t}`
  const idOf = new Map<string, string>() // stored edges only → their real link id
  const k3 = (a: string, b: string, t: RelationshipType) => `${a}|${b}|${t}`

  // Add a directed edge AND its inverse; a stored id always wins over a later
  // derived re-add. Returns true when it introduced something new (fixpoint signal).
  function add(a: string, b: string, t: RelationshipType, id: string | null): boolean {
    if (a === b || !present.has(a) || !present.has(b)) return false
    let changed = false
    const pairs: [string, string, RelationshipType][] = [
      [a, b, t],
      [b, a, RELATIONSHIP_INVERSES[t]],
    ]
    for (const [x, y, ty] of pairs) {
      const k = k3(x, y, ty)
      if (!seen.has(k)) {
        seen.add(k)
        list.push({ a: x, b: y, t: ty })
        if (id) idOf.set(k, id)
        changed = true
      } else if (id && !idOf.has(k)) idOf.set(k, id)
    }
    return changed
  }

  // Seed: closure-type stored links feed the engine; everything else passes through.
  const passthrough: ContactLink[] = []
  for (const l of links) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    if (!present.has(aKey) || !present.has(bKey) || !CLOSURE_TYPES.has(l.type)) {
      passthrough.push(l)
      continue
    }
    add(aKey, bKey, l.type, l.id)
  }

  // Per-pass adjacency (small graphs → rebuilding each pass is cheap).
  const adj = new Map<string, Map<RelationshipType, string[]>>()
  const rebuild = () => {
    adj.clear()
    for (const e of list) {
      let m = adj.get(e.a)
      if (!m) adj.set(e.a, (m = new Map()))
      let arr = m.get(e.t)
      if (!arr) m.set(e.t, (arr = []))
      arr.push(e.b)
    }
  }
  const nbr = (key: string, t: RelationshipType) => adj.get(key)?.get(t) ?? []

  // Sibling closure first: union-find over sibling edges → everyone in a component
  // is a sibling of everyone else (symmetric + transitive).
  const sib = new UnionFind()
  for (const e of list) if (e.t === 'sibling') sib.union(e.a, e.b)
  const comp = sib.components()
  for (const members of comp.values())
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) add(members[i], members[j], 'sibling', null)

  // Fixpoint over the propagation rules (bounded — only ever adds, so it converges).
  let changed = true
  let guard = 0
  while (changed && guard++ < 30) {
    changed = false
    rebuild()
    const snap = [...list]
    for (const e of snap) {
      if (e.t === 'parent') {
        // siblings share parents: (P parent C) & (C sib S) ⟹ P parent S
        for (const s of nbr(e.b, 'sibling')) changed = add(e.a, s, 'parent', null) || changed
        // parent-of-parent is a grandparent: (G parent P) & (P parent C) ⟹ G grandparent C
        for (const c of nbr(e.b, 'parent')) changed = add(e.a, c, 'grandparent', null) || changed
      } else if (e.t === 'grandparent') {
        // siblings share grandparents: (G grandparent C) & (C sib S) ⟹ G grandparent S
        for (const s of nbr(e.b, 'sibling')) changed = add(e.a, s, 'grandparent', null) || changed
      } else if (e.t === 'sibling') {
        // a parent's sibling is an aunt/uncle: (U sib P) & (P parent C) ⟹ U aunt/uncle C
        for (const c of nbr(e.b, 'parent')) changed = add(e.a, c, 'aunt_uncle', null) || changed
      } else if (e.t === 'aunt_uncle') {
        // children of siblings are cousins: (U aunt/uncle C1) & (U parent C2) ⟹ C1 cousin C2
        for (const c2 of nbr(e.a, 'parent')) changed = add(e.b, c2, 'cousin', null) || changed
      }
    }
  }

  // Emit one ContactLink per CANONICAL undirected pair+type (smaller key as A).
  const out: ContactLink[] = [...passthrough]
  const emitted = new Set<string>()
  for (const e of list) {
    const [a, b, t] = e.a < e.b ? [e.a, e.b, e.t] : [e.b, e.a, RELATIONSHIP_INVERSES[e.t]]
    const ck = k3(a, b, t)
    if (emitted.has(ck)) continue
    emitted.add(ck)
    const id = idOf.get(k3(e.a, e.b, e.t)) ?? idOf.get(ck) ?? `derived:${ck}`
    const aP = parsePersonKey(a)
    const bP = parsePersonKey(b)
    out.push({
      id,
      personAId: aP.id,
      personAKind: aP.kind,
      personBId: bP.id,
      personBKind: bP.kind,
      type: t,
      reverseType: RELATIONSHIP_INVERSES[t],
      label: null,
      notes: null,
    })
  }
  return out
}

// ---- « Compléter les familles » (one-button family completion) --------------

// A single change « Compléter les familles » proposes, for the review checklist: a
// directed family tie to CREATE (or a vague stored one to MODIFY into a precise rung),
// so a named « famille »-kind group ends up 100% related. `inferred` = the rung came
// from the existing link hierarchy (closedLinks); when no rung can be known we fall
// back to a generic `relative` kin tie so no group member is ever left disconnected.
export interface FamilyLinkProposal {
  aKey: string // "A is `type` of B" — directed, ready to split + POST to /api/cercle-links
  bKey: string
  type: RelationshipType
  op: 'create' | 'modify'
  existingId: string | null // the stored link to PATCH (modify only)
  inferred: boolean // true = precise rung from the hierarchy; false = generic `relative` fallback
  reason?: Bi // a transitive deduction (from inferLinks) carries its own human "why"
}

const unorderedPair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

// Compute every link needed to make each « famille »-kind group fully related, using
// the hierarchy the explicit links already give us:
//   • a pair the link closure can type precisely (sibling/parent/grandparent/cousin…)
//     → CREATE that exact directed tie (materialize what was only inferred);
//   • a pair the hierarchy can't place → CREATE a generic `relative` tie;
//   • a pair already carrying a stored `relative` the hierarchy can now sharpen
//     → MODIFY it up to the precise rung.
// Any pair with an explicit stored tie of another type is left ALONE (an explicit
// relationship always wins, matching friendLinksFromGroups). Pure + deterministic;
// the caller shows these in the approval checklist, then POSTs/PATCHes the chosen ones.
export function proposeFamilyLinks(
  people: Person[],
  storedLinks: ContactLink[],
  groups: ContactGroup[],
): FamilyLinkProposal[] {
  const present = new Set(people.map((p) => p.key))

  // The full inferred family graph from the stored links, indexed by unordered pair.
  // closedLinks emits each pair canonically (a < b), so the stored direction/type is
  // the one to materialize.
  const closed = closedLinks(people, storedLinks)
  const inferred = new Map<string, { aKey: string; bKey: string; type: RelationshipType }>()
  for (const l of closed) {
    if (!FAMILY_REL_TYPES.has(l.type) || l.type === 'relative') continue
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    const pk = unorderedPair(aKey, bKey)
    if (!inferred.has(pk)) inferred.set(pk, { aKey, bKey, type: l.type })
  }

  // Children of a shared parent are siblings. closedLinks won't seed that on its own
  // (it needs an explicit sibling edge to propagate — the same conservatism that keeps
  // co-parents from becoming spouses), but it's precisely the "missing link" this
  // completion exists to fill, so derive co-child sibling ties from the closed parent
  // edges. A precise rung the closure already found always wins over this.
  const childrenOf = new Map<string, string[]>()
  for (const l of closed) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    const [parentKey, childKey] = l.type === 'parent' ? [aKey, bKey] : l.type === 'child' ? [bKey, aKey] : [null, null]
    if (!parentKey || !childKey) continue
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, [])
    childrenOf.get(parentKey)!.push(childKey)
  }
  for (const kids of childrenOf.values()) {
    const sorted = [...new Set(kids)].sort()
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++) {
        const pk = `${sorted[i]}|${sorted[j]}`
        if (!inferred.has(pk)) inferred.set(pk, { aKey: sorted[i], bKey: sorted[j], type: 'sibling' })
      }
  }

  // Every stored tie (ANY type) by unordered pair — an explicit one wins over a guess.
  const stored = new Map<string, ContactLink>()
  for (const l of storedLinks) {
    const pk = unorderedPair(personKey(l.personAKind, l.personAId), personKey(l.personBKind, l.personBId))
    if (!stored.has(pk)) stored.set(pk, l)
  }

  const out: FamilyLinkProposal[] = []
  const done = new Set<string>()
  for (const g of groups) {
    if (g.kind !== 'family') continue
    const keys = [...g.memberKeys].filter((k) => present.has(k)).sort() // a < b already
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i]
        const b = keys[j]
        const pk = `${a}|${b}`
        if (done.has(pk)) continue
        done.add(pk)
        const have = stored.get(pk)
        const inf = inferred.get(pk)
        if (have) {
          // Sharpen a vague stored `relative` once the hierarchy can place it; otherwise
          // an explicit tie of any kind already covers this pair — leave it alone. Orient
          // the rung to the STORED row's a→b direction (PATCH keeps the endpoints, only
          // swaps the type), so an asymmetric rung (parent/child…) never points backwards.
          if (have.type === 'relative' && inf) {
            const storedAKey = personKey(have.personAKind, have.personAId)
            const storedBKey = personKey(have.personBKind, have.personBId)
            const type = storedAKey === inf.aKey ? inf.type : RELATIONSHIP_INVERSES[inf.type]
            out.push({ aKey: storedAKey, bKey: storedBKey, type, op: 'modify', existingId: have.id, inferred: true })
          }
          continue
        }
        if (inf) out.push({ aKey: inf.aKey, bKey: inf.bKey, type: inf.type, op: 'create', existingId: null, inferred: true })
        else out.push({ aKey: a, bKey: b, type: 'relative', op: 'create', existingId: null, inferred: false })
      }
    }
  }
  return out
}

// The one-button "does it all" proposer: every link worth offering across the WHOLE
// circle, in one review checklist. It merges
//   • the group-completion proposals (`proposeFamilyLinks` — make each named famille
//     group 100% related), AND
//   • the transitive cross-family bridges the explicit links already imply
//     (`inferLinks` — co-parents → spouse, a shared parent → sibling, a spouse's
//     parents → in-law) — the deductions that connect TWO families through a single
//     junction link, even with no named group built.
// Deduped by unordered pair (a precise group completion wins a conflict); each
// transitive item carries its own human `reason` for the checklist row. Pure — the
// caller shows them for approval, then POST/PATCHes only the ticked ones.
export function proposeAllFamilyLinks(
  people: Person[],
  storedLinks: ContactLink[],
  groups: ContactGroup[],
): FamilyLinkProposal[] {
  const fromGroups = proposeFamilyLinks(people, storedLinks, groups)
  const covered = new Set(fromGroups.map((p) => unorderedPair(p.aKey, p.bKey)))
  const transitive: FamilyLinkProposal[] = inferLinks(people, storedLinks)
    .filter((s) => !covered.has(unorderedPair(s.aKey, s.bKey)))
    .map((s) => ({ aKey: s.aKey, bKey: s.bKey, type: s.type, op: 'create' as const, existingId: null, inferred: true, reason: s.reason }))
  return [...fromGroups, ...transitive]
}
