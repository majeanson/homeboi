import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { CERCLE_KEY, BOARD_KEY } from '../../lib/queryKeys'
import {
  fullName,
  genderedRelLabel,
  type Contact,
  type ContactLink,
  type Member,
  type ContactGroupRaw,
  type RelationshipType,
} from '../../lib/cercle'
import { matchIntakePerson, type PendingIntake, type IntakePersonInput, type IntakeMatch } from '../../lib/intake'
import { ReviewChecklist } from '../ReviewChecklist'
import { StatusMessage } from '../StatusMessage'
import { Icon } from '../Icon'

// Operator review of family-info forms relatives sent back (the 'intake' share kind).
// Lives in Réglages ▸ Partage, beside where the links are minted. Calm: a passive
// "N fiches à réviser" count — never a push. Merging reuses the existing cercle POST
// endpoints + the ReviewChecklist primitive; after merge the operator can run the
// existing « Compléter les familles » to infer the rest (siblings, in-laws).
//
// DEDUPE: each incoming person is matched against people we already have (email /
// phone / name). When a match is found the row defaults to MERGING into that person
// (so a half-entered member or an open "add yourself" link never spawns a duplicate);
// the operator can flip any row back to "create new".

const INTAKE_KEY = ['intake'] as const

// IntakePersonInput → /api/cercle body. Empty strings become undefined so a blank
// incoming field never CLOBBERS an existing value on a merge (the PATCH only carries
// the fields the relative actually filled).
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
  }
}

function displayName(p: IntakePersonInput): string {
  return `${p.firstName} ${p.lastName}`.trim() || p.firstName
}

const matchKey = (m: IntakeMatch) => `${m.kind}:${m.id}`

interface ReviewItem {
  index: number // position in [self, ...household]; 0 = self
  person: IntakePersonInput
  relType: RelationshipType | null // how a household member relates to self
  candidate: IntakeMatch | null // an existing person this likely IS
}

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

  // The existing people, to dedupe incoming cards against + to PATCH on a merge.
  const { data: cercle } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () =>
      api<{ contacts: Contact[]; members: Member[]; links: ContactLink[]; groups?: ContactGroupRaw[] }>('cercle'),
  })
  const contacts = cercle?.contacts ?? []
  const members = cercle?.members ?? []

  const [openSub, setOpenSub] = useState<PendingIntake | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  // index → 'new' (create) | 'contact:id' / 'member:id' (merge into that person).
  const [decision, setDecision] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Resolve the per-person key the token aimed self at (per-person link), into a match.
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
    const built: ReviewItem[] = [
      // self: a per-person link's target wins; else match on the card.
      { index: 0, person: sub.self, relType: null, candidate: targetMatch(sub) ?? matchIntakePerson(sub.self, contacts, members) },
      ...sub.household.map((p, i): ReviewItem => ({
        index: i + 1,
        person: p,
        relType: relOf(i + 1),
        candidate: matchIntakePerson(p, contacts, members),
      })),
    ]
    // Default each row: merge into the match when there is one, else create new.
    const dec: Record<number, string> = {}
    for (const it of built) dec[it.index] = it.candidate ? matchKey(it.candidate) : 'new'
    setItems(built)
    setDecision(dec)
    setErr(null)
    setOpenSub(sub)
  }

  // Create OR merge one person; returns the resulting contact id (for linking).
  async function upsert(item: ReviewItem): Promise<string> {
    const choice = decision[item.index] ?? 'new'
    if (choice !== 'new') {
      const sep = choice.indexOf(':')
      const kind = choice.slice(0, sep)
      const id = choice.slice(sep + 1)
      if (kind === 'contact') {
        await api('cercle', { method: 'PATCH', body: { id, ...personBody(item.person) } })
        return id
      }
      // member: fold into the contact already linked to that member, or create one
      // linked to it (unifyCircle then treats member + contact as a single person).
      const linked = contacts.find((c) => c.memberId === id)
      if (linked) {
        await api('cercle', { method: 'PATCH', body: { id: linked.id, ...personBody(item.person) } })
        return linked.id
      }
      const res = await api<{ id: string }>('cercle', { method: 'POST', body: { ...personBody(item.person), memberId: id } })
      return res.id
    }
    const res = await api<{ id: string }>('cercle', { method: 'POST', body: personBody(item.person) })
    return res.id
  }

  async function merge(sub: PendingIntake, selected: ReviewItem[]) {
    setBusy(true)
    setErr(null)
    try {
      const idByIndex = new Map<number, string>()
      // self (index 0) is always imported; household only when ticked.
      const self = items.find((i) => i.index === 0)
      if (self) idByIndex.set(0, await upsert(self))
      for (const item of selected) {
        if (item.index === 0) continue
        idByIndex.set(item.index, await upsert(item))
      }
      // links whose both endpoints were imported (server auto-derives the inverse).
      for (const l of sub.links) {
        const aId = idByIndex.get(l.aIndex)
        const bId = idByIndex.get(l.bIndex)
        if (aId && bId) {
          await api('cercle-links', {
            method: 'POST',
            body: { aId, aKind: 'contact', bId, bKind: 'contact', type: l.type },
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

  // Nothing received yet → keep the section out of the way entirely (calm).
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

      {/* The per-submission picker: tick who to add, and for each known person choose
          merge-into-existing vs create-new. Self is always imported (handled in merge). */}
      <ReviewChecklist<ReviewItem>
        open={!!openSub}
        onClose={() => setOpenSub(null)}
        title={openSub ? t.intake.reviewItemTitle(displayName(openSub.self)) : ''}
        items={items}
        renderItem={(item) => (
          <>
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
                {decision[item.index] !== 'new'
                  ? t.intake.mergeInto(item.candidate.name)
                  : t.intake.createNew}
              </button>
            )}
          </>
        )}
        onApply={(sel) => openSub && void merge(openSub, sel)}
        applyAllLabel={(n) => t.intake.mergeAll(n)}
        applySelectedLabel={(n) => t.intake.mergeSelected(n)}
        busy={busy}
      />
    </OperatorSection>
  )
}
