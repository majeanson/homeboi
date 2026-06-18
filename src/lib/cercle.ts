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
}

// A household member, as the cercle GET returns it (phase 2 — members are people
// in the circle too).
export interface Member {
  id: string
  displayName: string
  avatarKind: string
  avatarRef: string
  colour: string
  isChild: boolean
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
  birthday: string | null // contacts only
  isChild: boolean
}

const CONTACT_ACCENT = '#C45E86' // the cercle rose, for photoless contacts

export const personKey = (kind: PersonKind, id: string): string => `${kind}:${id}`

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
    birthday: null,
    isChild: m.isChild,
  }))
  return [...fromMembers, ...fromContacts]
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
  friend: { label: { fr: 'Ami·e', en: 'Friend' }, group: 'social', groupOrder: 0, color: '#6B8A52' },
  colleague: { label: { fr: 'Collègue', en: 'Colleague' }, group: 'social', groupOrder: 1, color: '#D9842A' },
  neighbor: { label: { fr: 'Voisin·e', en: 'Neighbour' }, group: 'social', groupOrder: 2, color: '#C2563A' },
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
  friend: 'friend',
  colleague: 'colleague',
  neighbor: 'neighbor',
  other: 'other',
}

export const ALL_RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_CONFIG) as RelationshipType[]

export function relLabel(type: RelationshipType, lang: keyof Bi): string {
  return RELATIONSHIP_CONFIG[type].label[lang]
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
