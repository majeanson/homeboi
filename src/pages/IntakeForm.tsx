import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { ContactFields, EMPTY_CONTACT_CORE, type ContactCoreValue } from '../components/cercle/ContactFields'
import { SharePreviewBar, useSharePreview } from '../components/SharePreviewBar'
import { Icon, InlineIcon } from '../components/Icon'
import { Chip } from '../components/Chip'
import { StatusMessage } from '../components/StatusMessage'
import type { RelationshipType } from '../lib/cercle'
import type { IntakeSubmission, IntakePersonInput, IntakeAddress } from '../lib/intake'

// The relative-facing family-info form (#— intake). A relative opens a typed,
// time-boxed 'intake' share link, fills in their own card and optionally the people
// in their household + how they relate, and sends it back. The submission is
// quarantined server-side (migration 0075) — the operator reviews + merges it into
// Le cercle later. Reuses ContactFields (the same identity cluster the cercle form
// uses) so the relative sees familiar, consistent fields. Phone-first (relatives are
// on their own phone), single scrollable page, no account, no further access.
//
// "Build your family" here is deliberately SIMPLE — each added person + one relation
// to YOU — not the drag-bands FamilyBuilder (awkward on a phone). The operator's
// review still runs the full FamilyBuilder + proposeAllFamilyLinks to infer the rest
// (siblings, in-laws) from these self-relations.

interface GreetingData {
  kind: 'intake'
  householdName: string
  targetName: string | null
}

// The relation an added household member has TO the submitter. A small, friendly
// subset of RelationshipType — the operator can refine anything at review time.
const RELATION_CHOICES: { type: RelationshipType; key: 'relSpouse' | 'relChild' | 'relParent' | 'relSibling' | 'relOther' }[] = [
  { type: 'spouse', key: 'relSpouse' },
  { type: 'child', key: 'relChild' },
  { type: 'parent', key: 'relParent' },
  { type: 'sibling', key: 'relSibling' },
  { type: 'other', key: 'relOther' },
]

interface HouseholdDraft {
  id: number
  core: ContactCoreValue
  relation: RelationshipType
}

function toAddress(c: ContactCoreValue): IntakeAddress | null {
  const a: IntakeAddress = {}
  if (c.street.trim()) a.street = c.street.trim()
  if (c.city.trim()) a.city = c.city.trim()
  if (c.province.trim()) a.state = c.province.trim()
  if (c.postal.trim()) a.postalCode = c.postal.trim()
  return Object.keys(a).length ? a : null
}

function toPerson(c: ContactCoreValue, notes = ''): IntakePersonInput {
  return {
    firstName: c.firstName.trim(),
    lastName: c.lastName.trim(),
    nickname: c.nickname.trim(),
    birthday: c.birthday.trim() || null,
    gender: c.gender,
    email: c.email.trim(),
    phone: c.phone.trim(),
    address: toAddress(c),
    notes: notes.trim(),
  }
}

export function IntakeForm() {
  const t = useT()
  const preview = useSharePreview()

  const { data } = useQuery({
    queryKey: ['guest-window', preview ?? 'self', 'intake'],
    queryFn: () => api<GreetingData>(`guest/window${preview ? `?kind=${preview}` : ''}`),
  })

  const [self, setSelf] = useState<ContactCoreValue>(EMPTY_CONTACT_CORE)
  const [notes, setNotes] = useState('')
  const [household, setHousehold] = useState<HouseholdDraft[]>([])
  const nextId = useRef(1)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function addPerson() {
    setHousehold((h) => [...h, { id: nextId.current++, core: EMPTY_CONTACT_CORE, relation: 'child' }])
  }
  function patchPerson(id: number, patch: Partial<ContactCoreValue>) {
    setHousehold((h) => h.map((p) => (p.id === id ? { ...p, core: { ...p.core, ...patch } } : p)))
  }
  function setRelation(id: number, relation: RelationshipType) {
    setHousehold((h) => h.map((p) => (p.id === id ? { ...p, relation } : p)))
  }
  function removePerson(id: number) {
    setHousehold((h) => h.filter((p) => p.id !== id))
  }

  async function submit() {
    if (busy) return
    if (!self.firstName.trim()) {
      setErr(t.intake.firstNameRequired)
      return
    }
    setBusy(true)
    setErr(null)
    // Keep only named household members; links address them by final position.
    const named = household.filter((p) => p.core.firstName.trim())
    const submission: IntakeSubmission = {
      self: toPerson(self, notes),
      household: named.map((p) => toPerson(p.core)),
      links: named.map((p, i) => ({ aIndex: i + 1, bIndex: 0, type: p.relation })),
    }
    try {
      await api('guest/intake-submit', { method: 'POST', body: submission })
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const hello = data?.targetName ? t.intake.greetingNamed(data.targetName) : t.intake.greeting

  if (done) {
    return (
      <div className="scene intake" aria-label={t.intake.title}>
        <div className="scene__body intake__done">
          <div className="intake__done-mark">
            <Icon name="check-bold" size={40} />
          </div>
          <h2 className="intake__done-title">{t.intake.sentTitle}</h2>
          <p className="intake__done-sub mono">{t.intake.sentSub}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="scene intake" aria-label={t.intake.title}>
      {preview && <SharePreviewBar />}
      <header className="scene__head">
        <div className="scene__head-titles">
          <h2 className="pm-sheet__title">
            <InlineIcon name="hand-heart-bold" /> {hello}
          </h2>
          {data?.householdName && <span className="scene__head-sub mono">{data.householdName}</span>}
        </div>
      </header>

      <div className="scene__body intake__body">
        <p className="intake__intro mono">{t.intake.intro}</p>

        {/* 1 — your own card. The shared cercle field cluster. */}
        <section className="intake__sec">
          <h3 className="intake__h">{t.intake.yourInfo}</h3>
          <div className="cf">
            <ContactFields value={self} onChange={(p) => setSelf((s) => ({ ...s, ...p }))} autoFocus />
            <label className="cf__field">
              <span className="cf__label">{t.intake.notesLabel}</span>
              <textarea
                className="cf__input cf__textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t.intake.notesHint}
              />
            </label>
          </div>
        </section>

        {/* 2 — optional household. Each person + one relation to YOU. */}
        <section className="intake__sec">
          <h3 className="intake__h">{t.intake.householdTitle}</h3>
          <p className="intake__hint mono">{t.intake.householdHint}</p>

          {household.map((p) => (
            <div key={p.id} className="cf intake__person">
              <div className="intake__person-head">
                <span className="cf__label">{p.core.firstName.trim() || t.intake.personFallback}</span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => removePerson(p.id)}>
                  <Icon name="trash-bold" size={15} /> {t.intake.remove}
                </button>
              </div>
              <ContactFields
                value={p.core}
                onChange={(patch) => patchPerson(p.id, patch)}
                showContact={false}
                showAddress={false}
              />
              <div className="cf__field">
                <span className="cf__label">{t.intake.relationToYou}</span>
                <div className="cf__gender-chips">
                  {RELATION_CHOICES.map((r) => (
                    <Chip key={r.type} selected={p.relation === r.type} onClick={() => setRelation(p.id, r.type)}>
                      {t.intake[r.key]}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <button type="button" className="btn" onClick={addPerson}>
            <InlineIcon name="plus-bold" /> {t.intake.addPerson}
          </button>
        </section>

        {err && <StatusMessage tone="error">{err}</StatusMessage>}

        <div className="intake__send">
          <button type="button" className="btn btn--primary" disabled={busy || !self.firstName.trim()} onClick={submit}>
            <Icon name="arrow-right-bold" size={18} /> {busy ? t.intake.sending : t.intake.submit}
          </button>
        </div>
      </div>
    </div>
  )
}
