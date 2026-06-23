// Frontend wire shape for a family-info intake submission. Twin of the server's
// validator in functions/_lib/intake.ts (the SPA can't import worker code under the
// build's project refs — same split as src/lib/cercle.ts ↔ functions/_lib/
// cercleRelations.ts). The relative's form assembles this; the operator-review merge
// reads it. People are index-addressed: links reference [self, ...household] by
// position (self = 0). Keep the two files in step.

import { fullName, type Contact, type Member, type RelationshipType } from './cercle'

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
  birthday: string | null
  gender: 'm' | 'f' | null
  email: string
  phone: string
  address: IntakeAddress | null
  notes: string
}

export interface IntakeLinkInput {
  aIndex: number
  bIndex: number
  type: RelationshipType
}

export interface IntakeSubmission {
  self: IntakePersonInput
  household: IntakePersonInput[]
  links: IntakeLinkInput[]
}

// What GET /api/intake returns per pending submission (payload inlined + envelope).
export interface PendingIntake extends IntakeSubmission {
  id: string
  targetKey: string | null
  createdAt: number
}

// ---- Dedupe: match an incoming person to one we already have -----------------
// So an open "add yourself" link (or a relative we'd half-entered as a member)
// merges into the SAME person instead of spawning a duplicate. The operator still
// confirms each match at review time — this only suggests.

export interface IntakeMatch {
  kind: 'contact' | 'member'
  id: string
  name: string
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

// Find the existing person an incoming card most likely IS, or null. Strongest
// signal first: a shared email or phone (people rarely share those); then an exact
// full-name match on a contact; then a name match on a Maisonnée member (so a
// relative we'd seeded as a member folds in). Conservative — a near-miss returns
// null and the operator just creates a new card.
export function matchIntakePerson(p: IntakePersonInput, contacts: Contact[], members: Member[]): IntakeMatch | null {
  const email = norm(p.email)
  const phone = digits(p.phone)
  const full = norm(`${p.firstName} ${p.lastName}`)
  const first = norm(p.firstName)

  for (const c of contacts) {
    if (email && norm(c.email) === email) return { kind: 'contact', id: c.id, name: fullName(c) }
    if (phone && phone.length >= 7 && digits(c.phone) === phone) return { kind: 'contact', id: c.id, name: fullName(c) }
  }
  for (const c of contacts) {
    if (full && norm(`${c.firstName} ${c.lastName}`) === full) return { kind: 'contact', id: c.id, name: fullName(c) }
  }
  for (const m of members) {
    const mn = norm(m.displayName)
    if (mn && (mn === full || mn === first)) return { kind: 'member', id: m.id, name: m.displayName }
  }
  return null
}
