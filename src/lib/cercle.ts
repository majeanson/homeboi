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
  | 'parent_in_law' // spouse's parent (belle-mère / beau-père); inverse: child_in_law
  | 'child_in_law' // child's spouse (belle-fille / beau-fils); inverse: parent_in_law
  | 'sibling_in_law' // spouse's sibling or sibling's spouse (belle-sœur / beau-frère); self-inverse
  | 'in_law' // generic catch-all belle-famille (a spouse's cousin, etc.) when no precise in-law rung fits
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
  sibling_in_law: { label: { fr: 'Beau-frère / belle-sœur', en: 'Sibling-in-law' }, group: 'extended', groupOrder: 5, color: '#4F9A93' },
  parent_in_law: { label: { fr: 'Beau-père / belle-mère', en: 'Parent-in-law' }, group: 'extended', groupOrder: 6, color: '#52968C' },
  child_in_law: { label: { fr: 'Beau-fils / belle-fille', en: 'Child-in-law' }, group: 'extended', groupOrder: 7, color: '#6AA595' },
  in_law: { label: { fr: 'Belle-famille', en: 'In-law' }, group: 'extended', groupOrder: 8, color: '#5E8C8C' },
  step_family: { label: { fr: 'Famille recomposée', en: 'Step-family' }, group: 'extended', groupOrder: 9, color: '#5AA08C' },
  relative: { label: { fr: 'Membre de la famille', en: 'Family member' }, group: 'extended', groupOrder: 10, color: '#6E8FA0' },
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
      sibling_in_law: 'Belle-sœur', parent_in_law: 'Belle-mère', child_in_law: 'Belle-fille',
      step_family: 'Famille recomposée', best_friend: 'Meilleure amie', friend: 'Amie',
      colleague: 'Collègue', neighbor: 'Voisine', cousin: 'Cousine',
    }
    const FEM_EN: Partial<Record<RelationshipType, string>> = {
      parent: 'Mother', child: 'Daughter', sibling: 'Sister', spouse: 'Wife',
      partner: 'Partner', grandparent: 'Grandmother', grandchild: 'Granddaughter',
      aunt_uncle: 'Aunt', niece_nephew: 'Niece', in_law: 'In-law', step_family: 'Step-family',
      sibling_in_law: 'Sister-in-law', parent_in_law: 'Mother-in-law', child_in_law: 'Daughter-in-law',
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
      sibling_in_law: 'Beau-frère', parent_in_law: 'Beau-père', child_in_law: 'Beau-fils',
      step_family: 'Famille recomposée', best_friend: 'Meilleur ami', friend: 'Ami',
      colleague: 'Collègue', neighbor: 'Voisin', cousin: 'Cousin',
    }
    const MASC_EN: Partial<Record<RelationshipType, string>> = {
      parent: 'Father', child: 'Son', sibling: 'Brother', spouse: 'Husband',
      partner: 'Partner', grandparent: 'Grandfather', grandchild: 'Grandson',
      aunt_uncle: 'Uncle', niece_nephew: 'Nephew', in_law: 'In-law', step_family: 'Step-family',
      sibling_in_law: 'Brother-in-law', parent_in_law: 'Father-in-law', child_in_law: 'Son-in-law',
      best_friend: 'Best friend', friend: 'Friend', colleague: 'Colleague', neighbor: 'Neighbour', cousin: 'Cousin',
    }
    const map = lang === 'fr' ? MASC_FR : MASC_EN
    return map[type] ?? relLabel(type, lang)
  }
  return relLabel(type, lang)
}

// A person's relationships, resolved FROM THEIR perspective → display strings
// ("Mère · Léa" = "[this person] est la mère de Léa"). Works over composite person
// keys (contacts + members). The relation type describes the SUBJECT (the person
// whose list this is), so it's gendered by the SUBJECT's gender — NOT the other
// person's (a female subject who is a parent is "Mère", regardless of the child's sex).
// Pure (no React) — lives here beside the closure/label helpers it uses so the page
// stays a view.
export function relationsOf(key: string, links: ContactLink[], byKey: Map<string, Person>, lang: 'fr' | 'en'): string[] {
  const subjectGender = byKey.get(key)?.gender ?? null
  return links
    .map((l) => {
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      if (aKey === key) return { rel: l.type, other: bKey }
      if (bKey === key) return { rel: l.reverseType, other: aKey }
      return null
    })
    .filter((x): x is { rel: ContactLink['type']; other: string } => !!x)
    // Most salient tie first (immediate family → extended → social), so a one-line
    // row surfaces "Enfant · Jérémie" over a derived cousin.
    .sort((a, b) => relPriority(a.rel) - relPriority(b.rel))
    // « Fille de Maman », not « Fille · Maman »: the middot left the row ambiguous —
    // is she Maman's daughter, or are those two separate facts about her? (UX review
    // 2026-07-14.) The possessive phrasing is what the rest of the app already uses
    // (CompleteFamilies: « Sœur de Jérémie »), so the directory now matches it.
    .map((r) => relPhrase(genderedRelLabel(r.rel, subjectGender, lang), byKey.get(r.other)?.name ?? '—', lang))
}

// "Fille" + "Maman" → « Fille de Maman » / "Daughter of Maman". French elides before
// a vowel sound (« Fille d'Alice »), which a bare "de " would get wrong.
export function relPhrase(rel: string, name: string, lang: 'fr' | 'en'): string {
  if (lang !== 'fr') return `${rel} of ${name}`
  const elide = /^[aeiouyàâäéèêëîïôöûüh]/i.test(name)
  return `${rel} ${elide ? `d’${name}` : `de ${name}`}`
}

// `fromKey`'s role TOWARD `toKey`, as ONE gendered label ("Fille", "Cousin", …) —
// i.e. how the row person (from) relates to the focused person (to), gendered by the
// row person. Used by the focus lens: with Marc focused, Léa's row reads "Fille"
// (Léa is Marc's daughter). Reads the same closed link set as relationsOf, so derived
// ties (grandparent, cousin…) resolve too. The most salient tie wins if several.
export function relationTo(
  fromKey: string,
  toKey: string,
  links: ContactLink[],
  byKey: Map<string, Person>,
  lang: 'fr' | 'en',
): string | null {
  const fromGender = byKey.get(fromKey)?.gender ?? null
  let best: RelationshipType | null = null
  for (const l of links) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    let rel: RelationshipType | null = null
    if (aKey === fromKey && bKey === toKey) rel = l.type
    else if (bKey === fromKey && aKey === toKey) rel = l.reverseType
    if (rel && (best === null || relPriority(rel) < relPriority(best))) best = rel
  }
  return best ? genderedRelLabel(best, fromGender, lang) : null
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
  'parent_in_law',
  'child_in_law',
  'sibling_in_law',
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
  parent_in_law: 1, // spouse's parent sits a generation above (like a parent)
  child_in_law: -1, // child's spouse sits a generation below
  sibling_in_law: 0,
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
//
// TWIN of `parseBirthday` in functions/_lib/birthdays.ts — the SPA and the Worker
// don't share code, so the rule lives once per tree and the two MUST agree. They
// didn't until 2026-08-28 (the server copy matched `\d{4}`, this one `\d{1,4}`, so a
// short year showed on the cercle page and vanished from the board's agenda). Change
// one, change both: `functions/_lib/birthdays.test.ts` runs an agreement table over
// both copies and fails on any divergence.
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

// The raw wire form: contacts.address is a JSON string in SQL; surfaces that read
// it straight off a joined row (the rendez-vous peek's contact_address) parse it
// here rather than each hand-rolling a guarded JSON.parse. Null on absent/garbage.
export function parseContactAddress(raw: string | null | undefined): ContactAddress | null {
  if (!raw?.trim()) return null
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as ContactAddress) : null
  } catch {
    return null
  }
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

// ---- Graph geometry — what the whole-web views draw --------------------------
// The cercle's overview graphs are hand-rolled SVG, and each used to hide its layout
// inside its own component, where it couldn't be tested and quietly drifted: the old
// Social ring capped its radius at a constant, so eighteen faces were dealt onto a
// circle with room for nine. The math lives here now — pure, deterministic, tested.
//
//   • layoutIslands()      — named circles + the bridges between them. Drawn by
//                            « Notre monde » and by Social ▸ Liens.
//   • layoutFamilyForest() — generation-banded family trees. Famille ▸ Arbre stacks
//                            them; Social ▸ Arbre sets them side by side and draws the
//                            FRIENDSHIPS that tie one family to the next.

// Even ring of `n` offsets at radius `r`, starting from `start` (default top).
function ringOffsets(n: number, r: number, start = -Math.PI / 2): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = start + (2 * Math.PI * i) / n
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
  }
  return out
}

// Face offsets inside an island + the ring radius they sit on. Every radius is derived
// from the COUNT, never from a constant — a constant cap is what dealt eighteen faces
// onto a circle with room for nine. `slot` is the width one face reserves (the avatar,
// plus room for its name where one is drawn).
//
// A ring of `m` slots needs `r ≥ (slot / 2) / sin(π / m)`, so its chord — the gap
// between two neighbours — never falls under one slot. Past 8 people a second, inner
// ring keeps the island from ballooning, offset half a step so its faces sit in the
// outer ring's gaps, and pushed a full slot inside it so the two rings can't collide.
export function islandFaceLayout(n: number, slot: number): { offsets: { x: number; y: number }[]; r: number } {
  if (n <= 1) return { offsets: [{ x: 0, y: 0 }], r: slot * 0.62 }
  const ringR = (m: number) => Math.max(slot * 0.95, (slot * 0.62) / Math.sin(Math.PI / m))
  if (n <= 8) {
    const r = ringR(n)
    return { offsets: ringOffsets(n, r), r }
  }
  const outerN = Math.ceil(n * 0.6)
  const innerN = n - outerN
  const innerR = ringR(innerN)
  const outerR = Math.max(ringR(outerN), innerR + slot * 1.05)
  return {
    offsets: [...ringOffsets(outerN, outerR), ...ringOffsets(innerN, innerR, -Math.PI / 2 + Math.PI / Math.max(1, innerN))],
    r: outerR,
  }
}

export interface IslandLayoutOpts {
  face: number // avatar disc diameter
  pad: number // breathing room between the outer face ring and the halo
  gap: number // between two islands
  labelH: number // room under an island for its name + count
  /** Width one face reserves on its ring. Defaults to `face`; widen it where a name
   *  is drawn under the disc (Social ▸ Liens) so the labels can't collide. */
  slot?: number
}
export interface PlacedIsland {
  island: WorldIsland
  cx: number
  cy: number
  outerR: number
  faces: { p: Person; x: number; y: number }[] // x/y are offsets from the island centre
}
export interface PlacedBridge {
  a: PlacedIsland
  b: PlacedIsland
  viaKeys: string[]
  key: string
}
export interface IslandLayout {
  placed: PlacedIsland[]
  bridges: PlacedBridge[]
  width: number
  height: number
}

// Place every island: a household island (if any) anchors the centre and the rest
// orbit it, each island's angular share scaled to its own size so a big family doesn't
// crowd a small group. Returns a positive-coordinate box ready for a viewBox.
export function layoutIslands(world: World, byKey: Map<string, Person>, o: IslandLayoutOpts): IslandLayout | null {
  const islands = world.islands
  if (islands.length === 0) return null

  const slot = o.slot ?? o.face
  const sized = new Map<string, { faces: { p: Person; x: number; y: number }[]; outerR: number }>()
  for (const isl of islands) {
    const ppl = isl.memberKeys.map((k) => byKey.get(k)).filter((p): p is Person => !!p)
    const fl = islandFaceLayout(ppl.length, slot)
    const faces = ppl.map((p, i) => ({ p, x: fl.offsets[i].x, y: fl.offsets[i].y }))
    sized.set(isl.id, { faces, outerR: fl.r + o.face / 2 + o.pad })
  }
  const outerR = (id: string) => sized.get(id)!.outerR

  // The Maisonnée sits at the centre; everything else orbits it. (No household — as in
  // Social, where you are not one of the circles — the ring just fills the circle.)
  const centre = islands.find((i) => i.kind === 'household') ?? null
  const ring = islands.filter((i) => i !== centre)

  const pos = new Map<string, { x: number; y: number }>()
  if (centre) pos.set(centre.id, { x: 0, y: 0 })

  if (ring.length === 1 && !centre) {
    pos.set(ring[0].id, { x: 0, y: 0 }) // a lone circle centres rather than orbiting nothing
  } else if (ring.length) {
    const rs = ring.map((i) => outerR(i.id))
    const maxR = Math.max(...rs)
    const centreR = centre ? outerR(centre.id) : 0
    const arc = ring.reduce((s, _i, idx) => s + 2 * rs[idx] + o.gap, 0)
    const RR = Math.max(arc / (2 * Math.PI), centreR + maxR + o.gap, maxR + o.gap)
    // Angular width per island, scaled to fill the full circle (spacing ∝ size).
    const widths = ring.map((_i, idx) => (2 * rs[idx] + o.gap) / RR)
    const sumW = widths.reduce((a, b) => a + b, 0) || 1
    const scale = (2 * Math.PI) / sumW
    let ang = -Math.PI / 2
    ring.forEach((isl, idx) => {
      const wid = widths[idx] * scale
      const a = ang + wid / 2
      pos.set(isl.id, { x: RR * Math.cos(a), y: RR * Math.sin(a) })
      ang += wid
    })
  }

  // Bounds → translate into a positive viewBox with a margin (+ room for labels).
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const isl of islands) {
    const c = pos.get(isl.id)!
    const r = outerR(isl.id)
    minX = Math.min(minX, c.x - r)
    maxX = Math.max(maxX, c.x + r)
    minY = Math.min(minY, c.y - r)
    maxY = Math.max(maxY, c.y + r + o.labelH)
  }
  const M = 40
  const dx = M - minX
  const dy = M - minY
  const placedById = new Map<string, PlacedIsland>()
  for (const isl of islands) {
    const c = pos.get(isl.id)!
    const s = sized.get(isl.id)!
    placedById.set(isl.id, { island: isl, cx: c.x + dx, cy: c.y + dy, outerR: s.outerR, faces: s.faces })
  }
  const placed = islands.map((i) => placedById.get(i.id)!)
  const bridges: PlacedBridge[] = world.bridges
    .map((b) => {
      const a = placedById.get(b.aId)
      const bb = placedById.get(b.bId)
      return a && bb ? { a, b: bb, viaKeys: b.viaKeys, key: `${b.aId}|${b.bId}` } : null
    })
    .filter((b): b is PlacedBridge => !!b)

  return { placed, bridges, width: maxX - minX + M * 2, height: maxY - minY + M * 2 }
}

// ---- The family forest ------------------------------------------------------

export interface ForestOpts {
  rowH: number // one generation band
  colW: number // one person's column within a band
  compGap: number // between two trees
  /** 'stack' — trees under one another (Famille). 'row' — side by side (Social). */
  flow: 'stack' | 'row'
  /** Draw + align on the non-family links that join two trees (Social's friendships). */
  socialTies?: boolean
  /** Keep a person with no family link at all (a friend who is nobody's parent). */
  includeIsolated?: boolean
  /** A floor on each tree's width — 'stack' fills the surface, 'row' hugs its content. */
  compMinW?: number
  /** Room above a tree for its family name. */
  labelH?: number
  /** Breathing room left and right of a tree's frame. */
  framePadX?: number
  /** Room the frame leaves above the first band's faces and below the last's. */
  framePadY?: number
  /** Stable left→right position within a band (the directory's family order). */
  orderOf?: (key: string) => number
  /** Names + tints a tree's frame. */
  clusterOf?: (key: string) => { name: string; colour: string | null } | null
}
export interface ForestPoint {
  x: number
  y: number
}
export interface ForestEdge {
  a: ForestPoint
  b: ForestPoint
  key: string
}
export interface ForestFrame {
  key: string
  name: string
  colour: string | null
  count: number
  x: number
  y: number
  w: number
  h: number
}
export interface ForestLayout {
  nodes: { p: Person; x: number; y: number }[]
  familyEdges: ForestEdge[]
  socialEdges: ForestEdge[]
  frames: ForestFrame[]
  seps: number[] // y of the divider between two stacked trees ('stack' only)
  width: number
  height: number
}

// The family group a tree belongs to: whichever cluster most of its members sit in.
function majorityCluster(
  members: Person[],
  clusterOf?: (key: string) => { name: string; colour: string | null } | null,
): { name: string; colour: string | null } | null {
  if (!clusterOf) return null
  const tally = new Map<string, { name: string; colour: string | null; n: number }>()
  for (const p of members) {
    const c = clusterOf(p.key)
    if (!c) continue
    const e = tally.get(c.name) ?? { name: c.name, colour: c.colour, n: 0 }
    e.n++
    tally.set(c.name, e)
  }
  let best: { name: string; colour: string | null; n: number } | null = null
  for (const e of tally.values()) if (!best || e.n > best.n) best = e
  return best && { name: best.name, colour: best.colour }
}

// Lay out every family as its own generation-banded tree.
//
// 'stack' (Famille ▸ Arbre) puts each tree under the last, separated by a divider —
// two unrelated families never share a band, so nobody's grandmother lines up with
// somebody's toddler.
//
// 'row' (Social ▸ Arbre) sets the trees side by side and draws the friendships that
// join them. Those friendships also ALIGN the trees: if Francis (a parent) is friends
// with Michelle (a parent), their two families are shifted so both land on the same
// band and the friendship reads as a horizontal line. A friend with no family of their
// own is a tree of one.
export function layoutFamilyForest(people: Person[], links: ContactLink[], o: ForestOpts): ForestLayout | null {
  const gen = generationOf(people, links)
  const members = o.includeIsolated ? people : people.filter((p) => gen.has(p.key))
  if (members.length === 0) return null
  const memberKeys = new Set(members.map((p) => p.key))
  // An isolated person is a band-0 tree of one; within a tree, gen's origin is
  // arbitrary but consistent, which is all the bands need.
  const bandOf = (k: string) => gen.get(k) ?? 0
  const compMinW = o.compMinW ?? 0
  const labelH = o.labelH ?? 0
  const framePadX = o.framePadX ?? 0
  const framePadY = o.framePadY ?? 0
  const orderOf = o.orderOf ?? (() => Number.MAX_SAFE_INTEGER)

  // Trees = connected components over the FAMILY edges (the same edge set generationOf
  // walked), so a social tie never fuses two families into one tree.
  const uf = new UnionFind()
  members.forEach((p) => uf.add(p.key))
  for (const l of links) {
    if (!isFamilyRel(l.type)) continue
    const { aKey, bKey } = linkEndpoints(l)
    if (memberKeys.has(aKey) && memberKeys.has(bKey)) uf.union(aKey, bKey)
  }
  const compOf = (k: string) => uf.find(k)

  interface Comp {
    root: string
    members: Person[]
    bands: Map<number, Person[]> // absolute band (gen) → people
    minB: number
    maxB: number
    width: number
    off: number // added to a member's band to place it on the shared grid
  }
  const byRoot = new Map<string, Person[]>()
  for (const p of members) {
    const r = compOf(p.key)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r)!.push(p)
  }
  const comps: Comp[] = [...byRoot.entries()].map(([root, ms]) => {
    const bands = new Map<number, Person[]>()
    for (const p of ms) {
      const b = bandOf(p.key)
      if (!bands.has(b)) bands.set(b, [])
      bands.get(b)!.push(p)
    }
    for (const row of bands.values()) row.sort((a, b) => orderOf(a.key) - orderOf(b.key) || a.name.localeCompare(b.name))
    const keys = [...bands.keys()]
    const maxCount = Math.max(...[...bands.values()].map((b) => b.length))
    return {
      root,
      members: ms,
      bands,
      minB: Math.min(...keys),
      maxB: Math.max(...keys),
      width: Math.max(compMinW, maxCount * o.colW),
      off: 0,
    }
  })
  const compByRoot = new Map(comps.map((c) => [c.root, c]))

  // Cross-tree social ties, one per unordered pair. `via` is the first edge seen for
  // the pair of TREES — the delta that aligns them.
  const seenPair = new Set<string>()
  const socialPairs: { a: string; b: string }[] = []
  const meta = new Map<string, { ca: string; cb: string; a: string; b: string; n: number }>()
  if (o.socialTies) {
    for (const l of links) {
      if (isFamilyRel(l.type)) continue
      const { aKey, bKey } = linkEndpoints(l)
      if (aKey === bKey || !memberKeys.has(aKey) || !memberKeys.has(bKey)) continue
      const ca = compOf(aKey)
      const cb = compOf(bKey)
      if (ca === cb) continue // a friendship inside one family adds nothing to read
      const pk = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
      if (seenPair.has(pk)) continue
      seenPair.add(pk)
      socialPairs.push({ a: aKey, b: bKey })
      const mk = ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`
      const e = meta.get(mk)
      if (e) e.n++
      else meta.set(mk, { ca, cb, a: aKey, b: bKey, n: 1 })
    }
  }

  // Band alignment. Anchor the biggest tree, then absorb trees along their strongest
  // friendship first (greedy, so the busiest tie is the one drawn flat).
  const bySize = [...comps].sort((a, b) => b.members.length - a.members.length || a.root.localeCompare(b.root))
  const order: Comp[] = []
  if (o.flow === 'stack' || meta.size === 0) {
    for (const c of comps) c.off = -c.minB
    order.push(...bySize)
  } else {
    const fixed = new Set<string>()
    const anchor = bySize[0]
    anchor.off = -anchor.minB
    fixed.add(anchor.root)
    order.push(anchor)
    const edges = [...meta.values()].sort((x, y) => y.n - x.n || x.ca.localeCompare(y.ca))
    let grew = true
    while (grew) {
      grew = false
      for (const e of edges) {
        const forward = fixed.has(e.ca) && !fixed.has(e.cb)
        const backward = fixed.has(e.cb) && !fixed.has(e.ca)
        if (!forward && !backward) continue
        const knownRoot = forward ? e.ca : e.cb
        const freshRoot = forward ? e.cb : e.ca
        const knownKey = forward ? e.a : e.b
        const freshKey = forward ? e.b : e.a
        const c = compByRoot.get(freshRoot)!
        // Put the two friends on one band: off[fresh] + band(fresh) === off[known] + band(known).
        c.off = compByRoot.get(knownRoot)!.off + bandOf(knownKey) - bandOf(freshKey)
        fixed.add(freshRoot)
        order.push(c)
        grew = true
      }
    }
    for (const c of bySize) {
      if (fixed.has(c.root)) continue
      c.off = -c.minB // no friendship to align on — start this tree at the top
      order.push(c)
    }
  }
  const pos = new Map<string, { x: number; y: number }>()
  const frames: ForestFrame[] = []
  const seps: number[] = []
  let width = 0
  let height = 0

  const placeComp = (c: Comp, x: number, top: number, gridMinA: number) => {
    for (const [b, row] of c.bands)
      row.forEach((p, i) => {
        pos.set(p.key, { x: x + ((i + 0.5) / row.length) * c.width, y: top + (b + c.off - gridMinA) * o.rowH + o.rowH / 2 })
      })
    const cluster = majorityCluster(c.members, o.clusterOf)
    // A lone friend is a tree of one — a frame around a single face says nothing.
    if (cluster && c.members.length > 1)
      frames.push({
        key: c.root,
        name: cluster.name,
        colour: cluster.colour,
        count: c.members.length,
        // Hug the faces: from the top band's centre-line to the bottom band's.
        x: x - framePadX,
        y: top + (c.minB + c.off - gridMinA) * o.rowH + o.rowH / 2 - framePadY,
        w: c.width + framePadX * 2,
        h: (c.maxB - c.minB) * o.rowH + framePadY * 2,
      })
  }

  if (o.flow === 'stack') {
    // Biggest family first; stack the rest below it, each centred on the widest tree.
    width = Math.max(...order.map((c) => c.width))
    let y = 0
    order.forEach((c, i) => {
      if (i > 0) {
        seps.push(y + o.compGap / 2) // a divider sits in the gap between two trees
        y += o.compGap
      }
      placeComp(c, (width - c.width) / 2, y, 0)
      y += (c.maxB - c.minB + 1) * o.rowH
    })
    height = y
  } else {
    // Side by side, wrapping into rows that keep the whole forest roughly landscape.
    // Trees that a friendship aligned sit next to one another (that's `order`), so as
    // many of those ties as possible stay on one row and read as level lines.
    const totalW = order.reduce((s, c) => s + c.width + o.compGap, 0)
    const tallest = Math.max(...order.map((c) => (c.maxB - c.minB + 1) * o.rowH)) + labelH
    const rows = Math.max(1, Math.round(Math.sqrt(totalW / Math.max(1, tallest * 1.7))))

    const fill = (target: number): Comp[][] => {
      const out: Comp[][] = [[]]
      let lineW = 0
      for (const c of order) {
        const cur = out[out.length - 1]
        if (cur.length && lineW + c.width + o.compGap > target) {
          out.push([c])
          lineW = c.width + o.compGap
        } else {
          cur.push(c)
          lineW += c.width + o.compGap
        }
      }
      return out
    }
    // A greedy fill at exactly totalW/rows overshoots — the last tree spills into a row
    // of its own. Widen the target until the fill actually lands in `rows` lines.
    let lines = fill(totalW / rows)
    for (let k = 1; k <= 24 && lines.length > rows; k++) lines = fill((totalW / rows) * (1 + 0.05 * k))

    let y = 0
    for (const line of lines) {
      // Every tree on a line shares one band grid, so an aligned friendship is level.
      const lineMinA = Math.min(...line.map((c) => c.minB + c.off))
      const lineMaxA = Math.max(...line.map((c) => c.maxB + c.off))
      const top = y + labelH
      let x = 0
      for (const c of line) {
        placeComp(c, x, top, lineMinA)
        x += c.width + o.compGap
      }
      width = Math.max(width, x - o.compGap)
      y = top + (lineMaxA - lineMinA + 1) * o.rowH + o.compGap
    }
    height = Math.max(0, y - o.compGap)
  }

  const edgeAt = (aKey: string, bKey: string, key: string): ForestEdge | null => {
    const a = pos.get(aKey)
    const b = pos.get(bKey)
    return a && b ? { a, b, key } : null
  }
  const familyEdges = links
    .filter((l) => isFamilyRel(l.type))
    .map((l) => {
      const { aKey, bKey } = linkEndpoints(l)
      return edgeAt(aKey, bKey, l.id)
    })
    .filter((e): e is ForestEdge => !!e)
  const socialEdges = socialPairs.map((p) => edgeAt(p.a, p.b, `${p.a}|${p.b}`)).filter((e): e is ForestEdge => !!e)

  const nodes = members.map((p) => ({ p, ...pos.get(p.key)! }))
  return { nodes, familyEdges, socialEdges, frames, seps, width: Math.max(width, o.colW), height }
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
//   3. The specific in-law rungs a marriage implies (inLawRungMap): a spouse's parent
//      → parent-in-law, a spouse's sibling / sibling's spouse → sibling-in-law, a
//      child's spouse → child-in-law
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

  }

  // Rule 3: the in-law rungs a marriage/partnership implies — a spouse's parent
  // (parent-in-law), a spouse's sibling or a sibling's spouse (sibling-in-law), a child's
  // spouse (child-in-law). Typed + oriented by inLawRungMap over the CLOSED graph; `suggest`
  // skips any pair already linked and dedups, so this only surfaces NEW ties.
  for (const r of inLawRungMap(people, links).values()) suggest(r.aKey, r.bKey, r.type, r.reason)

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
  parent_in_law: 6,
  child_in_law: 6,
  sibling_in_law: 6,
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
// Internal now (relationsOf/relationTo above are the only callers) — not exported.
const relPriority = (t: RelationshipType): number => REL_PRIORITY[t]

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

// The precise-rung map used by every family-completion proposer: for each unordered
// pair (a < b) the family hierarchy can type EXACTLY, the directed rung to materialize.
// It is the link CLOSURE (closedLinks, minus the generic `relative` passthrough) PLUS
// the "children of a shared parent are siblings" derivation closedLinks won't seed on
// its own (it needs an explicit sibling edge to propagate — the same conservatism that
// keeps co-parents from becoming spouses). closedLinks emits each pair canonically
// (a < b), so the stored direction/type is the one to materialize. Pure.
function inferredFamilyMap(
  people: Person[],
  storedLinks: ContactLink[],
): Map<string, { aKey: string; bKey: string; type: RelationshipType }> {
  const closed = closedLinks(people, storedLinks)
  const inferred = new Map<string, { aKey: string; bKey: string; type: RelationshipType }>()
  for (const l of closed) {
    if (!FAMILY_REL_TYPES.has(l.type) || l.type === 'relative') continue
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    const pk = unorderedPair(aKey, bKey)
    if (!inferred.has(pk)) inferred.set(pk, { aKey, bKey, type: l.type })
  }
  // Children of a shared parent are siblings — the one derivation closedLinks omits
  // (see above), but precisely the "missing link" completion exists to fill.
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
  return inferred
}

// The three SPECIFIC in-law rungs a marriage/partnership implies, typed off the CLOSED
// graph (so a spouse's DERIVED sibling/parent counts, not just an explicitly-stored one):
//   • a spouse's parent  → that parent is your parent_in_law (belle-mère / beau-père)
//   • a spouse's sibling → your sibling_in_law (belle-sœur / beau-frère)
//   • a sibling's spouse → your sibling_in_law
// child_in_law needs no own rule — it's parent_in_law's inverse (your child's spouse ↔ you
// are their parent-in-law), captured when we process that spouse as `me`. One entry per
// unordered pair, oriented canonically (smaller key = A) as "A is `type` of B", each with
// its own human "why". Pure — powers BOTH the create suggestions (inferLinks) and the
// « Belle-famille » → precise-rung upgrade (proposeInLawUpgrades).
type InLawRung = { aKey: string; bKey: string; type: RelationshipType; reason: Bi }
const IN_LAW_PARENT: Bi = { fr: 'Parent du conjoint·e', en: "Spouse's parent" }
const IN_LAW_SIBLING: Bi = { fr: 'Par alliance (conjoint·e)', en: 'By marriage' }

function inLawRungMap(people: Person[], storedLinks: ContactLink[]): Map<string, InLawRung> {
  const present = new Set(people.map((p) => p.key))
  const closed = closedLinks(people, storedLinks)
  const adj = new Map<string, Map<RelationshipType, string[]>>()
  const push = (from: string, t: RelationshipType, to: string) => {
    let m = adj.get(from)
    if (!m) adj.set(from, (m = new Map()))
    let arr = m.get(t)
    if (!arr) m.set(t, (arr = []))
    arr.push(to)
  }
  for (const l of closed) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    push(aKey, l.type, bKey)
    push(bKey, l.reverseType, aKey)
  }
  const nbr = (key: string, t: RelationshipType) => adj.get(key)?.get(t) ?? []
  const spousesOf = (key: string) => [...nbr(key, 'spouse'), ...nbr(key, 'partner')]

  const out = new Map<string, InLawRung>()
  const set = (aKey: string, bKey: string, type: RelationshipType, reason: Bi) => {
    if (aKey === bKey || !present.has(aKey) || !present.has(bKey)) return
    const pk = unorderedPair(aKey, bKey)
    if (out.has(pk)) return
    const [a, b, ty] = aKey < bKey ? [aKey, bKey, type] : [bKey, aKey, RELATIONSHIP_INVERSES[type]]
    out.set(pk, { aKey: a, bKey: b, type: ty, reason })
  }

  for (const p of people) {
    const me = p.key
    for (const s of spousesOf(me)) {
      // s's parents are my parent-in-law (belle-mère / beau-père). nbr(s,'child') = the
      // people s is a child OF = s's parents. The inverse (my parent is s's child-in-law)
      // is emitted when that parent's own spouse is processed as `me`.
      for (const parent of nbr(s, 'child')) set(parent, me, 'parent_in_law', IN_LAW_PARENT)
      // s's siblings are my sibling-in-law.
      for (const sib of nbr(s, 'sibling')) set(me, sib, 'sibling_in_law', IN_LAW_SIBLING)
    }
    // my sibling's spouse is my sibling-in-law.
    for (const sib of nbr(me, 'sibling')) for (const sp of spousesOf(sib)) set(me, sp, 'sibling_in_law', IN_LAW_SIBLING)
  }
  return out
}

// Every stored tie (ANY type) indexed by unordered pair — an explicit link always wins
// over a guessed one. Pure.
function storedPairMap(storedLinks: ContactLink[]): Map<string, ContactLink> {
  const stored = new Map<string, ContactLink>()
  for (const l of storedLinks) {
    const pk = unorderedPair(personKey(l.personAKind, l.personAId), personKey(l.personBKind, l.personBId))
    if (!stored.has(pk)) stored.set(pk, l)
  }
  return stored
}

// Reconcile ONE present pair (a < b) against what's stored + what the hierarchy
// implies, appending 0 or 1 proposal to `out`:
//   • stored `relative` + a known rung → MODIFY it up to the precise rung (oriented to
//     the stored row's a→b direction — PATCH keeps the endpoints and only swaps the
//     type — so an asymmetric rung like parent/child never points backwards);
//   • any other explicit stored tie    → leave ALONE (an explicit tie always wins);
//   • no stored tie + a known rung      → CREATE that precise directed tie;
//   • no stored tie + no rung           → CREATE a generic `relative` ONLY when
//     `fillGeneric` (inside a named group), so a huge intertwined web is never sprayed
//     with meaningless ties. `reason` rides a created/modified proposal (checklist
//     "why"). Pure — mutates only `out`.
function proposePair(
  a: string,
  b: string,
  inferred: Map<string, { aKey: string; bKey: string; type: RelationshipType }>,
  stored: Map<string, ContactLink>,
  fillGeneric: boolean,
  reason: Bi | undefined,
  out: FamilyLinkProposal[],
): void {
  const pk = `${a}|${b}`
  const have = stored.get(pk)
  const inf = inferred.get(pk)
  if (have) {
    if (have.type === 'relative' && inf) {
      const storedAKey = personKey(have.personAKind, have.personAId)
      const storedBKey = personKey(have.personBKind, have.personBId)
      const type = storedAKey === inf.aKey ? inf.type : RELATIONSHIP_INVERSES[inf.type]
      out.push({ aKey: storedAKey, bKey: storedBKey, type, op: 'modify', existingId: have.id, inferred: true, reason })
    }
    return
  }
  if (inf) out.push({ aKey: inf.aKey, bKey: inf.bKey, type: inf.type, op: 'create', existingId: null, inferred: true, reason })
  else if (fillGeneric) out.push({ aKey: a, bKey: b, type: 'relative', op: 'create', existingId: null, inferred: false, reason })
}

// Compute every link needed to make each « famille »-kind group 100% related, using the
// hierarchy the explicit links already give us (see proposePair — a precise rung where
// the closure can place one, a generic `relative` fallback where it can't). Pure +
// deterministic; the caller shows these in the approval checklist, then POSTs/PATCHes
// the chosen ones.
export function proposeFamilyLinks(
  people: Person[],
  storedLinks: ContactLink[],
  groups: ContactGroup[],
): FamilyLinkProposal[] {
  const present = new Set(people.map((p) => p.key))
  const inferred = inferredFamilyMap(people, storedLinks)
  const stored = storedPairMap(storedLinks)

  const out: FamilyLinkProposal[] = []
  const done = new Set<string>()
  for (const g of groups) {
    if (g.kind !== 'family') continue
    const keys = [...g.memberKeys].filter((k) => present.has(k)).sort() // a < b already
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pk = `${keys[i]}|${keys[j]}`
        if (done.has(pk)) continue
        done.add(pk)
        proposePair(keys[i], keys[j], inferred, stored, true, undefined, out)
      }
    }
  }
  return out
}

// A web-completed tie's checklist "why". The specific relationship label already reads
// on the row ("Léa · Cousine de Marc"); this line just says the app deduced the tie
// from the family's existing links.
const DEDUCED_KIN: Bi = { fr: 'Déduit des liens de la famille', en: 'Deduced from family ties' }

// The checklist "why" for a by-marriage niece/nephew (see proposeSpouseKinLinks): the
// tie reaches you through your conjoint·e, not by blood.
const SPOUSE_KIN: Bi = { fr: 'Famille de votre conjoint·e', en: "Your spouse's family" }

// Complete EVERY intertwined family, not just one named group: walk the whole connected
// family web — two families joined by a marriage/in-law land in ONE component — and
// propose every tie the hierarchy can type precisely (cousins, grandparent spans,
// aunt/uncle, siblings) across the entire web, spanning named-group boundaries. It never
// invents a generic `relative` for an unknowable pair (`fillGeneric` false): that would
// spray meaningless ties across a huge merged clan; it materializes only what the graph
// actually implies. Pure; deduped + merged by proposeAllFamilyLinks.
function proposeWebLinks(people: Person[], storedLinks: ContactLink[]): FamilyLinkProposal[] {
  const present = new Set(people.map((p) => p.key))
  const inferred = inferredFamilyMap(people, storedLinks)
  const stored = storedPairMap(storedLinks)

  // Connected components over the FAMILY edges (spouse/in-law are family types, so the
  // two sides of a marriage share one component).
  const uf = new UnionFind()
  people.forEach((p) => uf.add(p.key))
  for (const l of storedLinks) {
    if (!FAMILY_REL_TYPES.has(l.type)) continue
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    if (uf.has(aKey) && uf.has(bKey)) uf.union(aKey, bKey)
  }

  const out: FamilyLinkProposal[] = []
  for (const members of uf.components().values()) {
    const keys = members.filter((k) => present.has(k)).sort() // a < b already
    if (keys.length < 2) continue
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) proposePair(keys[i], keys[j], inferred, stored, false, DEDUCED_KIN, out)
  }
  return out
}

// A niece/nephew by MARRIAGE. In everyday Québécois usage your conjoint·e's blood niece
// IS your nièce — but the blood-only closure deliberately won't cross a marriage
// (spouse/partner are out of CLOSURE_TYPES), so « Compléter les familles » never used to
// surface it. Bridge it HERE as an opt-in suggestion: for each spouse/partner, share
// the people they are an aunt/uncle OF onto you. ONLY that direction — a conjoint·e's
// aunt/uncle is belle-famille (in-law), not "ma tante", so it isn't bridged. Built on
// the CLOSED graph so a spouse's DERIVED aunt/uncle (aunt = a sibling of a parent)
// bridges too, not only an explicitly-stored one. proposePair still applies the usual
// guards (an explicit stored tie wins; a generic `relative` gets lifted to the precise
// rung). Pure.
function proposeSpouseKinLinks(people: Person[], storedLinks: ContactLink[]): FamilyLinkProposal[] {
  const present = new Set(people.map((p) => p.key))
  const closed = closedLinks(people, storedLinks)
  const stored = storedPairMap(storedLinks)

  // Adjacency over the CLOSED graph, from each person's perspective:
  // adj[X].get('aunt_uncle') = the people X is an aunt/uncle OF.
  const adj = new Map<string, Map<RelationshipType, string[]>>()
  const push = (from: string, t: RelationshipType, to: string) => {
    let m = adj.get(from)
    if (!m) adj.set(from, (m = new Map()))
    let arr = m.get(t)
    if (!arr) m.set(t, (arr = []))
    arr.push(to)
  }
  for (const l of closed) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    push(aKey, l.type, bKey)
    push(bKey, l.reverseType, aKey)
  }
  const nbr = (key: string, t: RelationshipType) => adj.get(key)?.get(t) ?? []

  const out: FamilyLinkProposal[] = []
  const seen = new Set<string>()
  // Propose "me is `meType` of other" via the shared reconciler (canonical a < b).
  const bridge = (me: string, other: string, meType: RelationshipType) => {
    if (me === other || !present.has(me) || !present.has(other)) return
    const pk = unorderedPair(me, other)
    if (seen.has(pk)) return
    seen.add(pk)
    const a = me < other ? me : other
    const b = me < other ? other : me
    const type = a === me ? meType : RELATIONSHIP_INVERSES[meType]
    proposePair(a, b, new Map([[pk, { aKey: a, bKey: b, type }]]), stored, false, SPOUSE_KIN, out)
  }

  for (const p of people) {
    const me = p.key
    for (const s of [...nbr(me, 'spouse'), ...nbr(me, 'partner')]) {
      // spouse's niece/nephew → my niece/nephew (I become their aunt/uncle). ONE
      // direction only: a conjoint·e's niece reads as "ma nièce", but a conjoint·e's
      // aunt/uncle is belle-famille (in-law), not "ma tante" — so we don't bridge that.
      for (const x of nbr(s, 'aunt_uncle')) bridge(me, x, 'aunt_uncle')
    }
  }
  return out
}

// Upgrade a stored GENERIC « Belle-famille » (`in_law`) to the SPECIFIC gendered rung the
// graph now implies (belle-mère / beau-frère / belle-fille…) — the same approve-then-PATCH
// path that lifts a generic `relative` to a blood rung, but for in-laws. Only stored generic
// `in_law` rows are touched; an explicit specific in-law the operator set is left alone. The
// PATCH keeps the row's endpoints, so the type is oriented to the stored a→b direction. Pure.
const IN_LAW_PRECISE: Bi = { fr: 'Belle-famille précisée', en: 'In-law made specific' }
function proposeInLawUpgrades(people: Person[], storedLinks: ContactLink[]): FamilyLinkProposal[] {
  const map = inLawRungMap(people, storedLinks)
  const out: FamilyLinkProposal[] = []
  for (const l of storedLinks) {
    if (l.type !== 'in_law') continue
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    const rung = map.get(unorderedPair(aKey, bKey))
    if (!rung) continue
    const type = aKey === rung.aKey ? rung.type : RELATIONSHIP_INVERSES[rung.type]
    out.push({ aKey, bKey, type, op: 'modify', existingId: l.id, inferred: true, reason: IN_LAW_PRECISE })
  }
  return out
}

// The one-button "does it all" proposer: every link worth offering across the WHOLE
// circle, in one review checklist. It merges, in precedence order:
//   • Belle-famille upgrades (`proposeInLawUpgrades`) — lift a stored generic `in_law`
//     to its precise gendered rung (belle-mère / beau-frère…) where the graph types one;
//   • group completion (`proposeFamilyLinks`) — make each named famille group 100%
//     related, incl. the generic `relative` fallback for an unknowable in-group pair;
//   • transitive cross-family bridges (`inferLinks`) — co-parents → spouse, a shared
//     parent → sibling, a spouse's parents → in-law: the deductions that join TWO
//     families through a single junction link, each carrying its own human `reason`;
//   • by-marriage niece/nephew (`proposeSpouseKinLinks`) — a conjoint·e's blood
//     niece/nephew becomes yours, which the blood-only closure omits;
//   • the whole intertwined WEB (`proposeWebLinks`) — every precise rung the hierarchy
//     can type across the ENTIRE connected family (cousins, grandparent spans,
//     aunt/uncle…), spanning group boundaries, so completing works family-wide and not
//     one named group at a time.
// Deduped by unordered pair — the EARLIER source wins, so a group's precise rung and a
// bridge's specific reason both beat the web's generic one. Pure — the caller shows them
// for approval, then POST/PATCHes only the ticked ones.
export function proposeAllFamilyLinks(
  people: Person[],
  storedLinks: ContactLink[],
  groups: ContactGroup[],
): FamilyLinkProposal[] {
  const upgrades = proposeInLawUpgrades(people, storedLinks)
  const fromGroups = proposeFamilyLinks(people, storedLinks, groups)
  const covered = new Set([...upgrades, ...fromGroups].map((p) => unorderedPair(p.aKey, p.bKey)))
  // Keep only proposals for a pair nothing earlier already covers (registers as it goes).
  const take = (list: FamilyLinkProposal[]): FamilyLinkProposal[] => {
    const kept: FamilyLinkProposal[] = []
    for (const p of list) {
      const pk = unorderedPair(p.aKey, p.bKey)
      if (covered.has(pk)) continue
      covered.add(pk)
      kept.push(p)
    }
    return kept
  }
  const transitive = take(
    inferLinks(people, storedLinks).map((s) => ({
      aKey: s.aKey,
      bKey: s.bKey,
      type: s.type,
      op: 'create' as const,
      existingId: null,
      inferred: true,
      reason: s.reason,
    })),
  )
  // Niece/nephew by marriage (a conjoint·e's blood kin) — the closure won't cross the
  // marriage, so bridge it here, ahead of the generic web pass.
  const spouseKin = take(proposeSpouseKinLinks(people, storedLinks))
  const fromWeb = take(proposeWebLinks(people, storedLinks))
  return [...upgrades, ...fromGroups, ...transitive, ...spouseKin, ...fromWeb]
}
