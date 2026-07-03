// « Partager une famille » — MATERIALIZE a family subgraph into the portable,
// id-less, index-addressed shape a share carries. A family is derived at read time
// (Union-Find over links, ./cercle), so before it can be handed to another household
// we snapshot the exact people + relationship edges + pets into an `IntakeSubmission`
// — the SAME wire shape a relative's intake form produces (./intake), so the recipient
// merges it through the existing IntakeReview flow (matchIntakePerson + /api/cercle*).
//
// Pure (no React, no network) so it's unit-testable and framework-free, mirroring
// ./cercle. The reverse direction (payload → cercle rows) lives client-side in the
// recipient's import page, reusing the intake merge.

import { parsePersonKey, petOwners, type Contact, type Member, type Pet, type ContactLink } from './cercle'
import type { IntakeSubmission, IntakePersonInput, IntakePetInput, IntakeLinkInput } from './intake'

export interface FamilyShareData {
  contacts: Contact[]
  members: Member[]
  pets: Pet[]
  // STORED links (unified.links), NOT the closure: we snapshot only what the user
  // actually built; the recipient re-derives implied ties (cousins, grandparents…)
  // with their own closure, so shipping closed links would double them on merge.
  links: ContactLink[]
}

const contactToPerson = (c: Contact): IntakePersonInput => ({
  firstName: c.firstName,
  lastName: c.lastName ?? '',
  nickname: c.nickname ?? '',
  birthday: c.birthday,
  gender: c.gender,
  email: c.email ?? '',
  phone: c.phone ?? '',
  // ContactAddress and IntakeAddress share the same field shape.
  address: c.address ?? null,
  notes: c.notes ?? '',
  photoKey: c.photoKey,
})

const memberToPerson = (m: Member): IntakePersonInput => ({
  firstName: m.displayName,
  lastName: '',
  nickname: '',
  birthday: m.birthday,
  gender: m.gender,
  email: m.email ?? '',
  phone: m.phone ?? '',
  address: null,
  notes: m.notes ?? '',
  // A member's face is a photo only when avatarKind is 'photo' (else it's a colour/initial).
  photoKey: m.avatarKind === 'photo' ? m.avatarRef : null,
})

// Snapshot a family (given its member person-keys) into a shareable IntakeSubmission,
// or null when there's no human to anchor it (a pets-only "family" can't be shared —
// intake needs a named `self`). Humans become [self, ...household] in the given order;
// links between two included humans map to index-addressed IntakeLinkInputs; pets ride
// along pointing at their owner's index (or self when the owner isn't in the family).
export function familyToShare(memberKeys: Iterable<string>, data: FamilyShareData): IntakeSubmission | null {
  const contactById = new Map(data.contacts.map((c) => [c.id, c]))
  const memberById = new Map(data.members.map((m) => [m.id, m]))
  const petById = new Map(data.pets.map((p) => [p.id, p]))

  const keys = [...new Set(memberKeys)]
  // Split into humans (contacts + members) and pets, preserving the given order.
  const humanKeys: string[] = []
  const petKeys: string[] = []
  const humans: IntakePersonInput[] = []
  for (const key of keys) {
    const { kind, id } = parsePersonKey(key)
    if (kind === 'contact') {
      const c = contactById.get(id)
      if (c) {
        humanKeys.push(key)
        humans.push(contactToPerson(c))
      }
    } else if (kind === 'member') {
      const m = memberById.get(id)
      if (m) {
        humanKeys.push(key)
        humans.push(memberToPerson(m))
      }
    } else if (kind === 'pet') {
      if (petById.has(id)) petKeys.push(key)
    }
  }
  if (humans.length === 0) return null

  const indexByKey = new Map(humanKeys.map((k, i) => [k, i]))
  const inFamily = new Set(humanKeys)

  // Relationship edges between two included humans (drop owner/pet — those are pet
  // ownership, handled below). Dedupe by unordered pair so a stored edge isn't
  // emitted twice; the recipient's cercle-links POST also rejects duplicate pairs.
  const seenPair = new Set<string>()
  const links: IntakeLinkInput[] = []
  for (const l of data.links) {
    if (l.type === 'owner' || l.type === 'pet') continue
    const aKey = `${l.personAKind}:${l.personAId}`
    const bKey = `${l.personBKind}:${l.personBId}`
    if (!inFamily.has(aKey) || !inFamily.has(bKey)) continue
    const aIndex = indexByKey.get(aKey)!
    const bIndex = indexByKey.get(bKey)!
    if (aIndex === bIndex) continue
    const pair = aIndex < bIndex ? `${aIndex}-${bIndex}` : `${bIndex}-${aIndex}`
    if (seenPair.has(pair)) continue
    seenPair.add(pair)
    links.push({ aIndex, bIndex, type: l.type })
  }

  // Pets → their owner's human index (first owner that's in the family), else self (0).
  const owners = petOwners(data.links)
  const pets: IntakePetInput[] = petKeys.map((petKey) => {
    const { id } = parsePersonKey(petKey)
    const p = petById.get(id)!
    let ownerIndex = 0
    const ownerKeys = owners.get(petKey)
    if (ownerKeys) {
      for (const ok of ownerKeys) {
        const idx = indexByKey.get(ok)
        if (idx != null) {
          ownerIndex = idx
          break
        }
      }
    }
    return { name: p.name, species: p.species ?? '', photoKey: p.photoKey, ownerIndex }
  })

  const [self, ...household] = humans
  return { self, household, links, pets }
}
