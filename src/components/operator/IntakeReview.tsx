import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { CERCLE_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { THING_DEFAULTS } from '../../lib/things'
import {
  fullName,
  genderedRelLabel,
  type Contact,
  type ContactLink,
  type Member,
  type ContactGroupRaw,
  type RelationshipType,
} from '../../lib/cercle'
import {
  matchIntakePerson,
  type PendingIntake,
  type IntakePersonInput,
  type IntakePetInput,
  type IntakeMatch,
} from '../../lib/intake'
import { ReviewChecklist } from '../ReviewChecklist'
import { StatusMessage } from '../StatusMessage'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'

// Operator review of family-info forms relatives sent back (the 'intake' share kind).
// Lives in Réglages ▸ Partage. Calm: a passive "N fiches à réviser" count, never a
// push. Merging reuses the existing cercle/pets POST endpoints + ReviewChecklist;
// after merge the operator can run « Compléter les familles » to infer the rest.
//
// DEDUPE: each incoming person is matched against people we already have (email /
// phone / name) and the row defaults to MERGING into that person (no duplicate); the
// operator can flip any row back to "create new". Photos arrive as STAGED R2 keys and
// ride straight onto the new/updated contact or pet. Pets attach to their owner.

const INTAKE_KEY = ['intake'] as const

// IntakePersonInput → /api/cercle body. Empty strings → undefined so a blank incoming
// field never CLOBBERS an existing value on a merge; the staged photo rides as photoKey.
function personBody(p: IntakePersonInput) {
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
    photoKey: p.photoKey ?? undefined,
  }
}

function displayName(p: IntakePersonInput): string {
  return `${p.firstName} ${p.lastName}`.trim() || p.firstName
}

const matchKey = (m: IntakeMatch) => `${m.kind}:${m.id}`

type ReviewItem =
  | {
      kind: 'person'
      index: number // position in [self, ...household]; 0 = self
      person: IntakePersonInput
      relType: RelationshipType | null
      candidate: IntakeMatch | null
    }
  | { kind: 'pet'; petIndex: number; pet: IntakePetInput }

export function IntakeReview({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data } = useQuery({
    queryKey: INTAKE_KEY,
    queryFn: () => api<{ submissions: PendingIntake[] }>('intake'),
  })
  const submissions = data?.submissions ?? []

  const { data: cercle } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () =>
      api<{ contacts: Contact[]; members: Member[]; links: ContactLink[]; groups?: ContactGroupRaw[] }>('cercle'),
  })
  const contacts = cercle?.contacts ?? []
  const members = cercle?.members ?? []

  const [openSub, setOpenSub] = useState<PendingIntake | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [decision, setDecision] = useState<Record<number, string>>({}) // person index → 'new' | 'contact:id'/'member:id'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function targetMatch(sub: PendingIntake): IntakeMatch | null {
    if (!sub.targetKey) return null
    const sep = sub.targetKey.indexOf(':')
    const kind = sub.targetKey.slice(0, sep) as 'contact' | 'member'
    const id = sub.targetKey.slice(sep + 1)
    if (kind === 'contact') {
      const c = contacts.find((x) => x.id === id)
      return c ? { kind, id, name: fullName(c) } : null
    }
    const m = members.find((x) => x.id === id)
    return m ? { kind, id, name: m.displayName } : null
  }

  function openReview(sub: PendingIntake) {
    const relOf = (idx: number): RelationshipType | null =>
      sub.links.find((l) => l.aIndex === idx && l.bIndex === 0)?.type ?? null
    const people: ReviewItem[] = [
      {
        kind: 'person',
        index: 0,
        person: sub.self,
        relType: null,
        candidate: targetMatch(sub) ?? matchIntakePerson(sub.self, contacts, members),
      },
      ...sub.household.map((p, i): ReviewItem => ({
        kind: 'person',
        index: i + 1,
        person: p,
        relType: relOf(i + 1),
        candidate: matchIntakePerson(p, contacts, members),
      })),
    ]
    const petItems: ReviewItem[] = sub.pets.map((p, i): ReviewItem => ({ kind: 'pet', petIndex: i, pet: p }))
    const dec: Record<number, string> = {}
    for (const it of people) if (it.kind === 'person') dec[it.index] = it.candidate ? matchKey(it.candidate) : 'new'
    setItems([...people, ...petItems])
    setDecision(dec)
    setErr(null)
    setOpenSub(sub)
  }

  // Create OR merge one person; returns the resulting contact id (for linking/owning).
  async function upsertPerson(index: number, person: IntakePersonInput): Promise<string> {
    const choice = decision[index] ?? 'new'
    if (choice !== 'new') {
      const sep = choice.indexOf(':')
      const kind = choice.slice(0, sep)
      const id = choice.slice(sep + 1)
      if (kind === 'contact') {
        await api('cercle', { method: 'PATCH', body: { id, ...personBody(person) } })
        return id
      }
      const linked = contacts.find((c) => c.memberId === id)
      if (linked) {
        await api('cercle', { method: 'PATCH', body: { id: linked.id, ...personBody(person) } })
        return linked.id
      }
      const res = await api<{ id: string }>('cercle', { method: 'POST', body: { ...personBody(person), memberId: id } })
      return res.id
    }
    const res = await api<{ id: string }>('cercle', { method: 'POST', body: personBody(person) })
    return res.id
  }

  async function merge(sub: PendingIntake, selected: ReviewItem[]) {
    setBusy(true)
    setErr(null)
    try {
      const idByIndex = new Map<number, string>()
      // Self (index 0) is always imported; household only when ticked.
      const self = items.find((i): i is Extract<ReviewItem, { kind: 'person' }> => i.kind === 'person' && i.index === 0)
      if (self) idByIndex.set(0, await upsertPerson(0, self.person))
      for (const item of selected) {
        if (item.kind !== 'person' || item.index === 0) continue
        idByIndex.set(item.index, await upsertPerson(item.index, item.person))
      }
      // Relationship links among imported people (server auto-derives the inverse).
      for (const l of sub.links) {
        const aId = idByIndex.get(l.aIndex)
        const bId = idByIndex.get(l.bIndex)
        if (aId && bId) {
          await api('cercle-links', { method: 'POST', body: { aId, aKind: 'contact', bId, bKind: 'contact', type: l.type } })
        }
      }
      // Pets: create each, then link it to its owner (fallback to self if the owner
      // wasn't imported), so the animal lands in the family.
      const selfId = idByIndex.get(0)
      for (const item of selected) {
        if (item.kind !== 'pet') continue
        const ownerId = idByIndex.get(item.pet.ownerIndex) ?? selfId
        const res = await api<{ id: string }>('pets', {
          method: 'POST',
          body: { name: item.pet.name, species: item.pet.species || undefined, photoKey: item.pet.photoKey ?? undefined },
        })
        if (ownerId) {
          await api('cercle-links', {
            method: 'POST',
            body: { aId: ownerId, aKind: 'contact', bId: res.id, bKind: 'pet', type: 'owner' },
          })
        }
      }

      await api('intake', { method: 'PATCH', body: { id: sub.id, status: 'merged' } })
      setOpenSub(null)
      qc.invalidateQueries({ queryKey: CERCLE_KEY })
      qc.invalidateQueries({ queryKey: BOARD_KEY })
      qc.invalidateQueries({ queryKey: INTAKE_KEY })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function dismiss(sub: PendingIntake) {
    const okay = await confirm({ message: t.intake.dismissConfirm, confirmLabel: t.intake.dismiss, tone: 'danger' })
    if (!okay) return
    await api('intake', { method: 'PATCH', body: { id: sub.id, status: 'dismissed' } })
    qc.invalidateQueries({ queryKey: INTAKE_KEY })
  }

  if (submissions.length === 0) return null

  return (
    <OperatorSection title={`${t.intake.reviewTitle} · ${t.intake.reviewPending(submissions.length)}`} help={help} helpKey="guest">
      <p className="operator__hint mono">{t.intake.reviewHint}</p>
      {err && <StatusMessage tone="error">{err}</StatusMessage>}

      <div className="intake-review">
        {submissions.map((sub) => (
          <div key={sub.id} className="intake-review__row">
            <span className="intake-review__name">{displayName(sub.self)}</span>
            <div className="row-actions">
              <button type="button" className="btn btn--sm btn--primary" onClick={() => openReview(sub)}>
                <Icon name="check-bold" size={15} /> {t.intake.reviewOne}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => void dismiss(sub)}>
                <Icon name="trash-bold" size={15} /> {t.intake.dismiss}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Per-submission picker: tick who/what to add; each known person can merge into
          an existing one or create new. Self is always imported (handled in merge). */}
      <ReviewChecklist<ReviewItem>
        open={!!openSub}
        onClose={() => setOpenSub(null)}
        title={openSub ? t.intake.reviewItemTitle(displayName(openSub.self)) : ''}
        items={items}
        renderItem={(item) =>
          item.kind === 'pet' ? (
            <>
              <Avatar kind={item.pet.photoKey ? 'photo' : null} photo={item.pet.photoKey} colour={THING_DEFAULTS.pet.colour} name={item.pet.name} size={28} />
              <span className="review__name">{item.pet.name}</span>
              <span className="review__sub mono">{item.pet.species || t.intake.petFallback}</span>
            </>
          ) : (
            <>
              <Avatar
                kind={item.person.photoKey ? 'photo' : null}
                photo={item.person.photoKey}
                colour="#2A8F85"
                name={item.person.firstName}
                size={28}
              />
              <span className="review__name">{displayName(item.person)}</span>
              <span className="review__sub mono">
                {item.index === 0
                  ? t.intake.thePerson
                  : item.relType
                    ? genderedRelLabel(item.relType, item.person.gender, lang)
                    : ''}
              </span>
              {item.candidate && (
                <button
                  type="button"
                  className={'chip intake-review__merge' + (decision[item.index] !== 'new' ? ' is-on' : '')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDecision((d) => ({
                      ...d,
                      [item.index]: d[item.index] === 'new' ? matchKey(item.candidate!) : 'new',
                    }))
                  }}
                >
                  <Icon name={decision[item.index] !== 'new' ? 'check-bold' : 'plus-bold'} size={12} />
                  {decision[item.index] !== 'new' ? t.intake.mergeInto(item.candidate.name) : t.intake.createNew}
                </button>
              )}
            </>
          )
        }
        onApply={(sel) => openSub && void merge(openSub, sel)}
        applyAllLabel={(n) => t.intake.mergeAll(n)}
        applySelectedLabel={(n) => t.intake.mergeSelected(n)}
        busy={busy}
      />
    </OperatorSection>
  )
}
