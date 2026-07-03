// Family-info intake — the wire shape a relative's form submits, plus a defensive
// sanitiser. Pure (no Env, no CF types) so it's unit-testable AND importable from
// the frontend (the form assembles this shape; the operator-review merge reads it).
//
// People are index-addressed: `links` reference [self, ...household] by position
// (self = 0, household[0] = 1, …) because submitted people have no ids yet. The
// server stores this opaquely (migration 0075) — the actual cercle merge happens
// client-side at review time via the existing /api/cercle* endpoints, so the only
// server job here is to bound the shape so a hostile/oversized blob can't land.

// Mirror of src/lib/cercle.ts RelationshipType (kept in sync by hand; both small).
// Used only to reject junk tie strings — the operator still reviews every link.
const RELATIONSHIP_TYPES = new Set([
  'parent', 'child', 'sibling', 'spouse', 'partner',
  'grandparent', 'grandchild', 'aunt_uncle', 'niece_nephew', 'cousin', 'in_law',
  'step_family', 'relative', 'owner', 'pet',
  'best_friend', 'friend', 'colleague', 'neighbor', 'other',
])

export interface IntakeAddress {
  street?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface IntakePersonInput {
  firstName: string
  lastName: string
  nickname: string
  birthday: string | null // 'YYYY-MM-DD' or '0000-MM-DD' (year unknown)
  gender: 'm' | 'f' | null
  email: string
  phone: string
  address: IntakeAddress | null
  notes: string
  photoKey: string | null // a staged R2 key (guest/intake-media); resolved on merge
}

export interface IntakeLinkInput {
  // Indices into the combined [self, ...household] array.
  aIndex: number
  bIndex: number
  type: string
}

export interface IntakePetInput {
  name: string
  species: string
  photoKey: string | null
  ownerIndex: number // index into [self, ...household] of the owner (self = 0)
}

export interface IntakeSubmission {
  self: IntakePersonInput
  household: IntakePersonInput[]
  links: IntakeLinkInput[]
  pets: IntakePetInput[]
}

// Which optional sections the form asks for (name is always required). A compact
// bitmask rides the link token; absent ⇒ ask everything. Twin of src/lib/intake.ts
// (decode only — the SPA owns encode at link-creation time).
export interface IntakeScope {
  bday: boolean
  contact: boolean
  addr: boolean
  household: boolean
  pets: boolean
  photo: boolean
}
export const INTAKE_FIELDS_ALL = 1 | 2 | 4 | 8 | 16 | 32 // 63

export function decodeIntakeScope(f: number | null | undefined): IntakeScope {
  const m = f == null ? INTAKE_FIELDS_ALL : f
  return {
    bday: !!(m & 1),
    contact: !!(m & 2),
    addr: !!(m & 4),
    household: !!(m & 8),
    pets: !!(m & 16),
    photo: !!(m & 32),
  }
}

// Generous-but-bounded caps. Names short, notes a paragraph; a household of a dozen
// and a few dozen ties is plenty. Bounding counts + field lengths bounds total size.
// These are the INTAKE defaults (a relative's own form); a caller with a bigger,
// trusted payload (an operator sharing a whole extended family — see
// functions/api/family-share.ts) can raise the count caps via `caps` below. The
// per-FIELD length caps (CAP) always apply — total size stays bounded either way.
const MAX_HOUSEHOLD = 12
const MAX_PETS = 12
const CAP = { name: 80, email: 200, phone: 60, addr: 120, notes: 1000, species: 60 }
const MAX_LINKS = 60

// Optional overrides for the COUNT caps (not the field-length caps). Absent → the
// intake defaults above. A share of a large family passes higher ceilings.
export interface SanitizeCaps {
  maxHousehold?: number
  maxPets?: number
  maxLinks?: number
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

// A staged R2 media key we minted (guest/intake-media → prefix `ik_`). Validate the
// shape so a client can't smuggle an arbitrary R2 path or a giant string; anything
// else → null (no photo). Keys are `<prefix>_<id>` (opaque, safe chars only).
function mediaKey(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null
}

function birthday(v: unknown): string | null {
  // 'YYYY-MM-DD' or '0000-MM-DD' (year unknown). Anything else → null.
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

function gender(v: unknown): 'm' | 'f' | null {
  return v === 'm' || v === 'f' ? v : null
}

function address(v: unknown): IntakeAddress | null {
  if (typeof v !== 'object' || v === null) return null
  const a = v as Record<string, unknown>
  const out: IntakeAddress = {
    street: str(a.street, CAP.addr),
    city: str(a.city, CAP.addr),
    state: str(a.state, CAP.addr),
    postalCode: str(a.postalCode, CAP.addr),
    country: str(a.country, CAP.addr),
  }
  // All-blank ⇒ no address (keeps the row clean, hides the field downstream).
  return Object.values(out).some((s) => s) ? out : null
}

function person(v: unknown): IntakePersonInput | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  const firstName = str(p.firstName, CAP.name)
  if (!firstName) return null // a card with no name is meaningless
  return {
    firstName,
    lastName: str(p.lastName, CAP.name),
    nickname: str(p.nickname, CAP.name),
    birthday: birthday(p.birthday),
    gender: gender(p.gender),
    email: str(p.email, CAP.email),
    phone: str(p.phone, CAP.phone),
    address: address(p.address),
    notes: str(p.notes, CAP.notes),
    photoKey: mediaKey(p.photoKey),
  }
}

function pet(v: unknown, count: number): IntakePetInput | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  const name = str(p.name, CAP.name)
  if (!name) return null
  let ownerIndex = Number(p.ownerIndex)
  // Default/clamp the owner to self when out of range, so a pet never dangles.
  if (!Number.isInteger(ownerIndex) || ownerIndex < 0 || ownerIndex >= count) ownerIndex = 0
  return { name, species: str(p.species, CAP.species), photoKey: mediaKey(p.photoKey), ownerIndex }
}

// Redact a person's fields to those the link's scope actually asked for. The name
// (first/last/nickname/notes) is always allowed; the optional sections are gated.
function redactPerson(p: IntakePersonInput, scope: IntakeScope): IntakePersonInput {
  return {
    ...p,
    birthday: scope.bday ? p.birthday : null,
    email: scope.contact ? p.email : '',
    phone: scope.contact ? p.phone : '',
    address: scope.addr ? p.address : null,
    photoKey: scope.photo ? p.photoKey : null,
  }
}

// SERVER-SIDE enforcement of the field-scope bitmask (the UI already hides the
// out-of-scope sections; this makes a crafted POST honour the link's scope too, so
// a name-only link can't smuggle household/pets/address/photos). Dropping the
// household also drops any link referencing a now-absent member.
function applyScope(s: IntakeSubmission, scope: IntakeScope): IntakeSubmission {
  const self = redactPerson(s.self, scope)
  const household = scope.household ? s.household.map((p) => redactPerson(p, scope)) : []
  const pets = scope.pets ? s.pets.map((p) => ({ ...p, photoKey: scope.photo ? p.photoKey : null })) : []
  const count = 1 + household.length // self + (kept) household
  const links = s.links.filter((l) => l.aIndex < count && l.bIndex < count)
  return { self, household, links, pets }
}

// Returns a clean IntakeSubmission, or null if the payload is unusable (no named
// self). Drops malformed household/pet entries + out-of-range / unknown-type links
// rather than failing the whole submission. When `scope` is passed (the link's
// field bitmask, from the signed token), out-of-scope sections are dropped too.
export function sanitizeIntake(raw: unknown, scope?: IntakeScope, caps: SanitizeCaps = {}): IntakeSubmission | null {
  const maxHousehold = caps.maxHousehold ?? MAX_HOUSEHOLD
  const maxPets = caps.maxPets ?? MAX_PETS
  const maxLinks = caps.maxLinks ?? MAX_LINKS
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const self = person(r.self)
  if (!self) return null

  const household = (Array.isArray(r.household) ? r.household : [])
    .slice(0, maxHousehold)
    .map(person)
    .filter((p): p is IntakePersonInput => p !== null)

  const count = 1 + household.length // self + household
  const links = (Array.isArray(r.links) ? r.links : [])
    .slice(0, maxLinks)
    .map((l): IntakeLinkInput | null => {
      if (typeof l !== 'object' || l === null) return null
      const o = l as Record<string, unknown>
      const aIndex = Number(o.aIndex)
      const bIndex = Number(o.bIndex)
      const type = typeof o.type === 'string' ? o.type : ''
      if (!Number.isInteger(aIndex) || !Number.isInteger(bIndex)) return null
      if (aIndex < 0 || bIndex < 0 || aIndex >= count || bIndex >= count || aIndex === bIndex) return null
      if (!RELATIONSHIP_TYPES.has(type)) return null
      return { aIndex, bIndex, type }
    })
    .filter((l): l is IntakeLinkInput => l !== null)

  const pets = (Array.isArray(r.pets) ? r.pets : [])
    .slice(0, maxPets)
    .map((p) => pet(p, count))
    .filter((p): p is IntakePetInput => p !== null)

  const clean = { self, household, links, pets }
  return scope ? applyScope(clean, scope) : clean
}

// All staged R2 media keys a submission references (self + household + pets). Used
// to free the blobs on dismiss and to spare them from the orphan sweep while pending.
export function intakeMediaKeys(s: IntakeSubmission): string[] {
  const keys: string[] = []
  if (s.self.photoKey) keys.push(s.self.photoKey)
  for (const p of s.household) if (p.photoKey) keys.push(p.photoKey)
  for (const p of s.pets) if (p.photoKey) keys.push(p.photoKey)
  return keys
}

// Null out any photoKey the guest didn't actually stage (guest/intake-media) for this
// household — the shape check (`mediaKey`) only proves the string LOOKS like a key, not
// that this submission owns it, so a crafted POST could otherwise smuggle an arbitrary
// R2 key onto a merged member/pet at accept. `owned` comes from a staged_media lookup;
// keep it a pure transform so it stays unit-testable and the handler just supplies the set.
export function redactUnownedIntakeMedia(s: IntakeSubmission, owned: Set<string>): IntakeSubmission {
  const fix = <T extends { photoKey: string | null }>(p: T): T =>
    p.photoKey && !owned.has(p.photoKey) ? { ...p, photoKey: null } : p
  return { ...s, self: fix(s.self), household: s.household.map(fix), pets: s.pets.map(fix) }
}
