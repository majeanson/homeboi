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
}

export interface IntakeLinkInput {
  // Indices into the combined [self, ...household] array.
  aIndex: number
  bIndex: number
  type: string
}

export interface IntakeSubmission {
  self: IntakePersonInput
  household: IntakePersonInput[]
  links: IntakeLinkInput[]
}

// Generous-but-bounded caps. Names short, notes a paragraph; a household of a dozen
// and a few dozen ties is plenty. Bounding counts + field lengths bounds total size.
const MAX_HOUSEHOLD = 12
const MAX_LINKS = 60
const CAP = { name: 80, email: 200, phone: 60, addr: 120, notes: 1000 }

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
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
  }
}

// Returns a clean IntakeSubmission, or null if the payload is unusable (no named
// self). Drops malformed household entries + out-of-range / unknown-type links
// rather than failing the whole submission.
export function sanitizeIntake(raw: unknown): IntakeSubmission | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const self = person(r.self)
  if (!self) return null

  const household = (Array.isArray(r.household) ? r.household : [])
    .slice(0, MAX_HOUSEHOLD)
    .map(person)
    .filter((p): p is IntakePersonInput => p !== null)

  const count = 1 + household.length // self + household
  const links = (Array.isArray(r.links) ? r.links : [])
    .slice(0, MAX_LINKS)
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

  return { self, household, links }
}
