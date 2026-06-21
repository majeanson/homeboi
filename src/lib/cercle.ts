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

export interface ContactCustomField {
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

export type PersonKind = 'contact' | 'member'

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

export const personKey = (kind: PersonKind, id: string): string => `${kind}:${id}`

// Split a composite `${kind}:${id}` back into its parts (ids never contain ':').
export function parsePersonKey(key: string): { kind: PersonKind; id: string } {
  const i = key.indexOf(':')
  return { kind: key.slice(0, i) as PersonKind, id: key.slice(i + 1) }
}

// Merge contacts + members into one people set. Contacts render their photo (or a
// rose initials tile); members render their member avatar/colour (their board face).
export function buildPeople(contacts: Contact[], members: Member[]): Person[] {
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
  return [...fromMembers, ...fromContacts]
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
): { people: Person[]; links: ContactLink[]; groups: ContactGroupRaw[] } {
  const memberById = new Map(members.map((m) => [m.id, m]))
  // contact.id → member.id, for contacts hard-linked to a member that still exists.
  const absorbed = new Map<string, string>()
  for (const c of contacts) {
    if (c.memberId && memberById.has(c.memberId)) absorbed.set(c.id, c.memberId)
  }
  if (absorbed.size === 0) return { people: buildPeople(contacts, members), links, groups }

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
  | 'best_friend'
  | 'friend'
  | 'colleague'
  | 'neighbor'
  | 'other'

export type RelationshipGroup = 'immediate' | 'extended' | 'social' | 'other'

export const RELATIONSHIP_GROUPS: Record<RelationshipGroup, { label: Bi; order: number }> = {
  immediate: { label: { fr: 'Famille proche', en: 'Immediate family' }, order: 0 },
  extended: { label: { fr: 'Famille élargie', en: 'Extended family' }, order: 1 },
  social: { label: { fr: 'Cercle social', en: 'Social' }, order: 2 },
  other: { label: { fr: 'Autres', en: 'Other' }, order: 3 },
}

export interface RelationshipConfig {
  label: Bi // singular relation label ("Parent")
  group: RelationshipGroup
  groupOrder: number
  color: string // hex accent (reuses the warm Babillard palette)
}

// Keys are stable; labels are FR-CA first. Colours are calm, warm hexes (not the
// tailwind classes the original used) so they sit beside the member-face palette.
export const RELATIONSHIP_CONFIG: Record<RelationshipType, RelationshipConfig> = {
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
      aunt_uncle: 'Aunt', niece_nephew: 'Niece',
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
      aunt_uncle: 'Uncle', niece_nephew: 'Nephew',
      best_friend: 'Best friend', friend: 'Friend', colleague: 'Colleague', neighbor: 'Neighbour', cousin: 'Cousin',
    }
    const map = lang === 'fr' ? MASC_FR : MASC_EN
    return map[type] ?? relLabel(type, lang)
  }
  return relLabel(type, lang)
}

// Relationship types grouped + ordered, for a sectioned picker.
export function groupedRelationshipTypes(): { group: RelationshipGroup; label: Bi; types: RelationshipType[] }[] {
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
])

// Is this a blood/family tie (binds a family + appears in the Arbre tree)? Social
// ties (friend/colleague/neighbor) are not.
export const isFamilyRel = (type: RelationshipType): boolean => FAMILY_REL_TYPES.has(type)

export interface FamilyGroup {
  id: string // the root person key
  name: string // "<lastName> family" / "Famille <nom>"
  memberKeys: Set<string> // composite Person.key values
  colorIndex: number // assigned in detection order; reserved for a future graph tint
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
  const parent = new Map<string, string>()
  const rank = new Map<string, number>()
  people.forEach((p) => {
    parent.set(p.key, p.key)
    rank.set(p.key, 0)
  })

  function find(x: string): string {
    const p = parent.get(x)
    if (p !== undefined && p !== x) {
      const root = find(p)
      parent.set(x, root)
      return root
    }
    return x
  }
  function union(x: string, y: string) {
    const rx = find(x)
    const ry = find(y)
    if (rx === ry) return
    const rkx = rank.get(rx) ?? 0
    const rky = rank.get(ry) ?? 0
    if (rkx < rky) parent.set(rx, ry)
    else if (rkx > rky) parent.set(ry, rx)
    else {
      parent.set(ry, rx)
      rank.set(rx, rkx + 1)
    }
  }

  links.forEach((l) => {
    if (!FAMILY_REL_TYPES.has(l.type)) return
    const { aKey, bKey } = linkEndpoints(l)
    if (parent.has(aKey) && parent.has(bKey)) union(aKey, bKey)
  })

  const byRoot = new Map<string, Set<string>>()
  people.forEach((p) => {
    const root = find(p.key)
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
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x)
    if (p === undefined || p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const union = (x: string, y: string) => {
    if (!parent.has(x)) parent.set(x, x)
    if (!parent.has(y)) parent.set(y, y)
    parent.set(find(x), find(y))
  }
  for (const e of list) if (e.t === 'sibling') union(e.a, e.b)
  const comp = new Map<string, string[]>()
  for (const key of parent.keys()) {
    const r = find(key)
    if (!comp.has(r)) comp.set(r, [])
    comp.get(r)!.push(key)
  }
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
