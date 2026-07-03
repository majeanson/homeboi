import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { guestWindowKey } from '../lib/queryKeys'
import { uploadMedia, MediaUnavailableError } from '../lib/uploadMedia'
import { ContactFields, EMPTY_CONTACT_CORE, type ContactCoreValue } from '../components/cercle/ContactFields'
import { SharePreviewBar, useSharePreview } from '../components/SharePreviewBar'
import { Avatar } from '../components/Avatar'
import { Icon, InlineIcon } from '../components/Icon'
import { Chip } from '../components/Chip'
import { StatusMessage } from '../components/StatusMessage'
import { FormFooter } from '../components/FormFooter'
import type { RelationshipType } from '../lib/cercle'
import {
  decodeIntakeScope,
  type IntakeScope,
  type IntakeSubmission,
  type IntakePersonInput,
  type IntakePetInput,
  type IntakeAddress,
} from '../lib/intake'

// The relative-facing family-info form (the 'intake' share kind). A relative opens a
// typed, time-boxed link, fills in their own card and — if the operator's link asked
// for it — their household, pets, and a photo each, then sends it back. The submission
// is quarantined server-side (migration 0075); photos are staged in R2 (0076) and
// resolved at review. Reuses ContactFields (same identity cluster as the cercle form)
// + uploadMedia. Phone-first, single scrollable page, no account, no further access.
//
// "Build your family" here is deliberately SIMPLE — each added person + one relation
// to YOU — not the drag-bands FamilyBuilder (awkward on a phone). The operator's
// review still runs proposeAllFamilyLinks to infer the rest (siblings, in-laws).

interface GreetingData {
  kind: 'intake'
  householdName: string
  targetName: string | null
  scope?: IntakeScope
}

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
  photoKey: string | null
}
interface PetDraft {
  id: number
  name: string
  species: string
  photoKey: string | null
}

function toAddress(c: ContactCoreValue): IntakeAddress | null {
  const a: IntakeAddress = {}
  if (c.street.trim()) a.street = c.street.trim()
  if (c.city.trim()) a.city = c.city.trim()
  if (c.province.trim()) a.state = c.province.trim()
  if (c.postal.trim()) a.postalCode = c.postal.trim()
  return Object.keys(a).length ? a : null
}

function toPerson(c: ContactCoreValue, notes: string, photoKey: string | null): IntakePersonInput {
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
    photoKey,
  }
}

// Tap-to-add photo for a person or pet. Resizes + stages the blob via the intake
// media endpoint; reports R2-unavailable so the caller hides every photo control.
function PhotoPick({
  photoKey,
  name,
  onChange,
  onUnavailable,
}: {
  photoKey: string | null
  name: string
  onChange: (key: string | null) => void
  onUnavailable: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function pick(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadMedia('guest/intake-media', file))
    } catch (e) {
      if (e instanceof MediaUnavailableError) onUnavailable()
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }
  return (
    <div className="intake__photo">
      <Avatar kind={photoKey ? 'photo' : null} photo={photoKey} colour="#2A8F85" name={name || '?'} size={64} />
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="intake__photo-actions">
        <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => ref.current?.click()}>
          <Icon name="camera-bold" size={15} /> {busy ? t.common.loading : photoKey ? t.intake.photoChange : t.intake.photoAdd}
        </button>
        {photoKey && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(null)}>
            {t.intake.photoRemove}
          </button>
        )}
      </div>
    </div>
  )
}

export function IntakeForm() {
  const t = useT()
  const preview = useSharePreview()

  const { data } = useQuery({
    queryKey: guestWindowKey(preview, 'intake'),
    queryFn: () => api<GreetingData>(`guest/window${preview ? `?kind=${preview}` : ''}`),
  })

  // Which sections to show — chosen by the operator at link creation; default to all
  // while the greeting loads (or for an operator preview without a scoped token).
  const scope: IntakeScope = data?.scope ?? decodeIntakeScope(null)

  const [self, setSelf] = useState<ContactCoreValue>(EMPTY_CONTACT_CORE)
  const [selfPhoto, setSelfPhoto] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [household, setHousehold] = useState<HouseholdDraft[]>([])
  const [pets, setPets] = useState<PetDraft[]>([])
  const nextId = useRef(1)
  // Flips off if R2 is unbound (first upload 503s) — hides every photo control.
  const [photosOff, setPhotosOff] = useState(false)
  const showPhoto = scope.photo && !photosOff

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function addPerson() {
    setHousehold((h) => [...h, { id: nextId.current++, core: EMPTY_CONTACT_CORE, relation: 'child', photoKey: null }])
  }
  function patchPerson(id: number, patch: Partial<ContactCoreValue>) {
    setHousehold((h) => h.map((p) => (p.id === id ? { ...p, core: { ...p.core, ...patch } } : p)))
  }
  function setRelation(id: number, relation: RelationshipType) {
    setHousehold((h) => h.map((p) => (p.id === id ? { ...p, relation } : p)))
  }
  function setPersonPhoto(id: number, key: string | null) {
    setHousehold((h) => h.map((p) => (p.id === id ? { ...p, photoKey: key } : p)))
  }
  function removePerson(id: number) {
    setHousehold((h) => h.filter((p) => p.id !== id))
  }

  function addPet() {
    setPets((p) => [...p, { id: nextId.current++, name: '', species: '', photoKey: null }])
  }
  function patchPet(id: number, patch: Partial<PetDraft>) {
    setPets((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  function removePet(id: number) {
    setPets((ps) => ps.filter((p) => p.id !== id))
  }

  async function submit() {
    if (busy) return
    if (!self.firstName.trim()) {
      setErr(t.intake.firstNameRequired)
      return
    }
    setBusy(true)
    setErr(null)
    // Keep only named entries; links/pets address people by final position (self = 0).
    const named = household.filter((p) => p.core.firstName.trim())
    const namedPets = pets.filter((p) => p.name.trim())
    const submission: IntakeSubmission = {
      self: toPerson(self, notes, selfPhoto),
      household: named.map((p) => toPerson(p.core, '', p.photoKey)),
      links: named.map((p, i) => ({ aIndex: i + 1, bIndex: 0, type: p.relation })),
      pets: namedPets.map(
        (p): IntakePetInput => ({ name: p.name.trim(), species: p.species.trim(), photoKey: p.photoKey, ownerIndex: 0 }),
      ),
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

        {/* 1 — your own card. The shared cercle field cluster (+ optional photo). */}
        <section className="intake__sec">
          <h3 className="intake__h">{t.intake.yourInfo}</h3>
          <div className="cf">
            {showPhoto && (
              <PhotoPick photoKey={selfPhoto} name={self.firstName} onChange={setSelfPhoto} onUnavailable={() => setPhotosOff(true)} />
            )}
            <ContactFields
              value={self}
              onChange={(p) => setSelf((s) => ({ ...s, ...p }))}
              autoFocus
              showBirthday={scope.bday}
              showContact={scope.contact}
              showAddress={scope.addr}
            />
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
        {scope.household && (
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
                {showPhoto && (
                  <PhotoPick
                    photoKey={p.photoKey}
                    name={p.core.firstName}
                    onChange={(key) => setPersonPhoto(p.id, key)}
                    onUnavailable={() => setPhotosOff(true)}
                  />
                )}
                <ContactFields
                  value={p.core}
                  onChange={(patch) => patchPerson(p.id, patch)}
                  showBirthday={scope.bday}
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
        )}

        {/* 3 — optional pets. */}
        {scope.pets && (
          <section className="intake__sec">
            <h3 className="intake__h">{t.intake.petsTitle}</h3>
            <p className="intake__hint mono">{t.intake.petsHint}</p>

            {pets.map((p) => (
              <div key={p.id} className="cf intake__person">
                <div className="intake__person-head">
                  <span className="cf__label">{p.name.trim() || t.intake.petFallback}</span>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => removePet(p.id)}>
                    <Icon name="trash-bold" size={15} /> {t.intake.remove}
                  </button>
                </div>
                {showPhoto && (
                  <PhotoPick
                    photoKey={p.photoKey}
                    name={p.name}
                    onChange={(key) => patchPet(p.id, { photoKey: key })}
                    onUnavailable={() => setPhotosOff(true)}
                  />
                )}
                <div className="cf__grid">
                  <label className="cf__field">
                    <span className="cf__label">{t.intake.petName}</span>
                    <input className="cf__input" value={p.name} onChange={(e) => patchPet(p.id, { name: e.target.value })} />
                  </label>
                  <label className="cf__field">
                    <span className="cf__label">{t.intake.petSpecies}</span>
                    <input
                      className="cf__input"
                      value={p.species}
                      onChange={(e) => patchPet(p.id, { species: e.target.value })}
                      placeholder={t.intake.petSpeciesHint}
                    />
                  </label>
                </div>
              </div>
            ))}

            <button type="button" className="btn" onClick={addPet}>
              <InlineIcon name="plus-bold" /> {t.intake.addPet}
            </button>
          </section>
        )}

        {err && <StatusMessage tone="error">{err}</StatusMessage>}

        {/* Guest "send" CTA via the shared FormFooter (no cancel/delete — a guest fills
            and sends). Keeps the arrow glyph + the sending busy label. */}
        <FormFooter
          saveType="button"
          onSave={submit}
          saveLabel={busy ? t.intake.sending : t.intake.submit}
          saveDisabled={!self.firstName.trim()}
          busy={busy}
          saveIcon="arrow-right-bold"
        />
      </div>
    </div>
  )
}
