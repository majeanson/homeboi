// « Fiche famille » — ONE merge of a family record into the cercle (2026-09-29).
//
// Two doors bring a family in, and until today each carried its own copy of this file:
// a relative's intake form (the 'intake' guest link, reviewed from Réglages) and a family
// another household shared (« Partager une famille » → /cercle/import). They carry the
// SAME payload type (IntakeSubmission) and ran the same algorithm — match each person
// against who we already have, create or patch, link the relationships, attach the pets
// to their owner — in ~150 lines written twice, which had already drifted: the intake
// copy only found a relationship written one way round, so « Théo, parent » could come
// through unlabelled. Both review in /cercle/import now (`?s=` a share, `?intake=` a
// submission) and merge here.
//
// What still differs is passed IN, not branched on: where a photo comes from (`photo`),
// whether the sender is always imported (`alwaysSelf`), and the family's name (`groupLabel`).
//
// Raw api() writes, deliberately — see write-rule.test.ts § 8: a merge reads ids back
// BETWEEN steps (create the person → link them → own the pet), so an outbox would
// half-apply it, which is worse than failing and being retried on purpose.

import { api } from './api'
import { uploadMedia } from './uploadMedia'
import { imgUrl } from './image'
import type { Contact, Member, RelationshipType } from './cercle'
import { matchIntakePerson, type IntakeMatch, type IntakePersonInput, type IntakePetInput, type IntakeSubmission } from './intake'

export type ReviewItem =
  | {
      kind: 'person'
      index: number // position in [self, ...household]; 0 = self
      person: IntakePersonInput
      relType: RelationshipType | null
      candidate: IntakeMatch | null
    }
  | { kind: 'pet'; petIndex: number; pet: IntakePetInput }

/** person index → 'new' | 'contact:<id>' | 'member:<id>' */
export type Decisions = Record<number, string>

export const matchKey = (m: IntakeMatch) => `${m.kind}:${m.id}`
export const displayName = (p: IntakePersonInput): string => `${p.firstName} ${p.lastName}`.trim() || p.firstName

// An incoming person → /api/cercle body. Blank fields → undefined so a merge never
// clobbers an existing value; the photo rides as photoKey.
export function personBody(p: IntakePersonInput, photoKey: string | null) {
  return {
    firstName: p.firstName,
    lastName: p.lastName || undefined,
    nickname: p.nickname || undefined,
    birthday: p.birthday || undefined,
    gender: p.gender ?? undefined,
    email: p.email || undefined,
    phone: p.phone || undefined,
    address: p.address ?? undefined,
    notes: p.notes || undefined,
    photoKey: photoKey ?? undefined,
  }
}

/**
 * The review rows and their default decisions: every person matched against who we
 * already have (a match defaults to MERGING — a duplicated family is the failure this
 * whole review exists to prevent), every pet listed. `selfCandidate` overrides the
 * match for the sender (an intake link aimed at one person knows who that is).
 */
export function buildReview(
  sub: IntakeSubmission,
  contacts: Contact[],
  members: Member[],
  selfCandidate?: IntakeMatch | null,
): { items: ReviewItem[]; decision: Decisions } {
  // A relationship to the sender, written EITHER way round.
  const relOf = (idx: number): RelationshipType | null =>
    sub.links.find((l) => (l.aIndex === idx && l.bIndex === 0) || (l.bIndex === idx && l.aIndex === 0))?.type ?? null
  const people: ReviewItem[] = [
    { kind: 'person', index: 0, person: sub.self, relType: null, candidate: selfCandidate ?? matchIntakePerson(sub.self, contacts, members) },
    ...sub.household.map(
      (p, i): ReviewItem => ({ kind: 'person', index: i + 1, person: p, relType: relOf(i + 1), candidate: matchIntakePerson(p, contacts, members) }),
    ),
  ]
  const pets = sub.pets.map((p, i): ReviewItem => ({ kind: 'pet', petIndex: i, pet: p }))
  const decision: Decisions = {}
  for (const it of people) if (it.kind === 'person') decision[it.index] = it.candidate ? matchKey(it.candidate) : 'new'
  return { items: [...people, ...pets], decision }
}

export interface MergeOptions {
  sub: IntakeSubmission
  /** Everything the review offered — the sender is taken from here when `alwaysSelf`. */
  items: ReviewItem[]
  /** What was ticked. */
  selected: ReviewItem[]
  decision: Decisions
  contacts: Contact[]
  /** The sender comes in even if unticked — they are who the intake form was for. */
  alwaysSelf: boolean
  /** Turn an incoming photo key into one this household owns (or null for none). */
  photo: (key: string | null) => Promise<string | null>
  /** The family's name → an explicit family group around the imported people. */
  groupLabel?: string | null
  /** One step done (for a progress bar). */
  onStep?: () => void
}

function persons(o: Pick<MergeOptions, 'items' | 'selected' | 'alwaysSelf'>) {
  const isPerson = (i: ReviewItem): i is Extract<ReviewItem, { kind: 'person' }> => i.kind === 'person'
  const ticked = o.selected.filter(isPerson)
  const self = o.items.filter(isPerson).find((i) => i.index === 0)
  return o.alwaysSelf && self && !ticked.some((i) => i.index === 0) ? [self, ...ticked] : ticked
}

/** How many writes a merge will make — the progress bar's denominator. */
export function mergeSteps(o: Pick<MergeOptions, 'sub' | 'items' | 'selected' | 'alwaysSelf' | 'groupLabel'>): number {
  const people = persons(o)
  const idx = new Set(people.map((p) => p.index))
  const links = o.sub.links.filter((l) => idx.has(l.aIndex) && idx.has(l.bIndex)).length
  const pets = o.selected.filter((i) => i.kind === 'pet').length
  const group = o.groupLabel && people.length > 1 ? 1 + people.length : 0
  return Math.max(1, people.length + links + pets + group)
}

/** Merge the reviewed family into the cercle. Throws on the first failed write. */
export async function mergeIntoCercle(o: MergeOptions): Promise<void> {
  const step = o.onStep ?? (() => {})

  // Create OR merge one person; returns the resulting contact id (for linking/owning).
  async function upsert(index: number, person: IntakePersonInput): Promise<string> {
    const body = personBody(person, await o.photo(person.photoKey))
    const choice = o.decision[index] ?? 'new'
    if (choice !== 'new') {
      const sep = choice.indexOf(':')
      const kind = choice.slice(0, sep)
      const id = choice.slice(sep + 1)
      if (kind === 'contact') {
        await api('cercle', { method: 'PATCH', body: { id, ...body } })
        return id
      }
      // One of our members: patch its linked contact if it has one, else create a
      // contact hard-linked to the member.
      const linked = o.contacts.find((c) => c.memberId === id)
      if (linked) {
        await api('cercle', { method: 'PATCH', body: { id: linked.id, ...body } })
        return linked.id
      }
      return (await api<{ id: string }>('cercle', { method: 'POST', body: { ...body, memberId: id } })).id
    }
    return (await api<{ id: string }>('cercle', { method: 'POST', body })).id
  }

  const idByIndex = new Map<number, string>()
  for (const p of persons(o)) {
    idByIndex.set(p.index, await upsert(p.index, p.person))
    step()
  }
  // Relationship links between two imported people (the server derives the inverse).
  for (const l of o.sub.links) {
    const aId = idByIndex.get(l.aIndex)
    const bId = idByIndex.get(l.bIndex)
    if (aId && bId) {
      await api('cercle-links', { method: 'POST', body: { aId, aKind: 'contact', bId, bKind: 'contact', type: l.type } })
      step()
    }
  }
  // Pets: create each, then link it to its owner — or, when the owner was not imported,
  // to the sender, else to whoever came in first — so the animal lands in the family.
  const fallbackOwner = idByIndex.get(0) ?? (idByIndex.values().next().value as string | undefined)
  for (const item of o.selected) {
    if (item.kind !== 'pet') continue
    const ownerId = idByIndex.get(item.pet.ownerIndex) ?? fallbackOwner
    const photoKey = await o.photo(item.pet.photoKey)
    const res = await api<{ id: string }>('pets', {
      method: 'POST',
      body: { name: item.pet.name, species: item.pet.species || undefined, photoKey: photoKey ?? undefined },
    })
    if (ownerId) {
      await api('cercle-links', { method: 'POST', body: { aId: ownerId, aKind: 'contact', bId: res.id, bKind: 'pet', type: 'owner' } })
    }
    step()
  }
  // The family's name as an explicit group, so people land together even when the
  // relationship edges alone would not cluster them. Best-effort: people and links are in.
  const imported = [...idByIndex.values()]
  if (o.groupLabel && imported.length > 1) {
    try {
      const g = await api<{ id: string }>('cercle-groups', { method: 'POST', body: { name: o.groupLabel, kind: 'family' } })
      step()
      for (const pid of imported) {
        await api('cercle-groups', { method: 'POST', body: { groupId: g.id, personId: pid, personKind: 'contact' } })
        step()
      }
    } catch {
      /* the group label is a nicety */
    }
  }
}

/** A staged intake photo already belongs to this household — keep the key. */
export const ownPhoto = async (key: string | null) => key

/**
 * A SHARED family's photo lives under the sharer's `fs_` key. Re-copy it into a blob WE
 * own, so nothing stays shared live. Best-effort: any failure (R2 unset here, blob gone)
 * → no photo, and the person still comes in.
 */
export async function copyPhotoToOwn(key: string | null): Promise<string | null> {
  if (!key) return null
  try {
    const res = await fetch(imgUrl(key), { credentials: 'same-origin' })
    if (!res.ok) return null
    return await uploadMedia('cercle', await res.blob(), { resize: false })
  } catch {
    return null
  }
}
