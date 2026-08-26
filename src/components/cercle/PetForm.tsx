import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { resizeImage, imgUrl } from '../../lib/image'
import { live } from '../../lib/query'
import { useConfirm } from '../../lib/confirm'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY, BUSINESSES_KEY } from '../../lib/queryKeys'
import { type Business } from '../../lib/businesses'
import {
  type Pet,
  type PetWeight,
  type Contact,
  type Member,
  type ContactLink,
  type Person,
  PET_SPECIES,
  unifyCircle,
  personKey,
  parsePersonKey,
} from '../../lib/cercle'
import { BirthdayPicker } from './BirthdayPicker'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { ColorPicker } from '../ColorPicker'
import { StatusMessage } from '../StatusMessage'
import { FormFooter } from '../FormFooter'
import { Disclosure } from '../Disclosure'
import { RowActions } from '../RowActions'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { THING_DEFAULTS } from '../../lib/things'

const PET_COLOUR = THING_DEFAULTS.pet.colour // the pet amber — one source in lib/things

// « Le cercle » → Pets: add / edit one animal — a ContactForm cousin (no relationships
// or vCard) with the care fields a household needs at a glance: species/breed,
// birthday, microchip #, feeding schedule, sitter instructions, a small weight log,
// and a VET picked from the existing Businesses. POST when new, PATCH when `value`.
// Writes via useWrite (offline-safe, refreshes the cercle); the photo blob goes through
// api() directly (blobs can't queue in the outbox).
export function PetForm({ value, onSaved, onCancel }: { value?: Pet | null; onSaved: () => void; onCancel?: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const confirm = useConfirm()
  const p = t.cercle.pet

  const [name, setName] = useState(value?.name ?? '')
  const [species, setSpecies] = useState(value?.species ?? '')
  const [breed, setBreed] = useState(value?.breed ?? '')
  const [birthday, setBirthday] = useState<string | null>(value?.birthday ?? null)
  const [microchip, setMicrochip] = useState(value?.microchip ?? '')
  const [feeding, setFeeding] = useState(value?.feeding ?? '')
  const [sitterNotes, setSitterNotes] = useState(value?.sitterNotes ?? '')
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [vetBusinessId, setVetBusinessId] = useState<string | null>(value?.vetBusinessId ?? null)
  const [weights, setWeights] = useState<PetWeight[]>(value?.weights ?? [])
  const [colour, setColour] = useState(value?.colour ?? PET_COLOUR)
  const [photoKey, setPhotoKey] = useState<string | null>(value?.photoKey ?? null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  // A new weight row being entered (date + kg + optional note), appended on +.
  const [wDate, setWDate] = useState('')
  const [wKg, setWKg] = useState('')
  // The vet search box text (the picked vet shows as a chip below, not in the box).
  const [vetQuery, setVetQuery] = useState('')

  // The Business directory for the vet picker (a vet IS a Business, not a person).
  const { data: bzData } = useQuery({ queryKey: BUSINESSES_KEY, queryFn: () => api<{ businesses: Business[] }>('businesses'), ...live })
  const businesses = bzData?.businesses ?? []
  const vet = businesses.find((b) => b.id === vetBusinessId) ?? null

  // Owner(s) — who this animal belongs to. A household MEMBER owner makes it a
  // Maisonnée pet (shows in the Maisonnée card); a friend (contact) owner makes it
  // the friend's pet (it follows them into Social). We POST/DELETE owner→pet links
  // alongside the pet write so the form is the one place you say "whose pet is this".
  const { data: cData } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<{ contacts: Contact[]; members: Member[]; links: ContactLink[] }>('cercle'),
    ...live,
  })
  // Pickable owners: members + contacts (deduped so a member+linked-contact is one),
  // never other pets.
  const ownerPeople = useMemo<Person[]>(
    () => unifyCircle(cData?.contacts ?? [], cData?.members ?? [], cData?.links ?? [], []).people.filter((pp) => pp.kind !== 'pet'),
    [cData],
  )
  const peopleByKey = useMemo(() => new Map(ownerPeople.map((pp) => [pp.key, pp])), [ownerPeople])
  // Stored owner links for THIS pet (edit mode): owner person-key → link id (to PATCH/DELETE).
  const existingOwners = useMemo(() => {
    const m = new Map<string, string>()
    if (!value) return m
    const petKey = personKey('pet', value.id)
    for (const l of cData?.links ?? []) {
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      if (l.type === 'owner' && bKey === petKey) m.set(aKey, l.id)
      else if (l.type === 'pet' && aKey === petKey) m.set(bKey, l.id)
    }
    return m
  }, [cData, value])

  const [ownerKeys, setOwnerKeys] = useState<Set<string>>(new Set())
  const [ownerQuery, setOwnerQuery] = useState('')
  // Seed the picked owners from the stored links once they load (edit mode only).
  const seeded = useRef(false)
  useEffect(() => {
    if (!seeded.current && value && cData) {
      setOwnerKeys(new Set(existingOwners.keys()))
      seeded.current = true
    }
  }, [value, cData, existingOwners])

  // Add the new owner links and drop the removed ones, after the pet exists.
  async function reconcileOwners(petId: string) {
    for (const key of ownerKeys) {
      if (existingOwners.has(key)) continue
      const { kind, id } = parsePersonKey(key)
      await write('cercle-links', {
        method: 'POST',
        body: { aId: id, aKind: kind, bId: petId, bKind: 'pet', type: 'owner' },
        affectedKeys: [CERCLE_KEY],
      }).catch(() => {})
    }
    for (const [key, linkId] of existingOwners) {
      if (!ownerKeys.has(key)) await write('cercle-links', { method: 'DELETE', body: { id: linkId }, affectedKeys: [CERCLE_KEY] }).catch(() => {})
    }
  }

  function addWeight() {
    const kg = Number(wKg)
    if (!wDate || !Number.isFinite(kg) || kg <= 0) return
    setWeights((w) => [...w, { date: wDate, kg }].sort((a, b) => a.date.localeCompare(b.date)))
    setWDate('')
    setWKg('')
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const blob = await resizeImage(file, 1024)
      const { key } = await api<{ key: string }>('pets', { method: 'POST', body: blob })
      setPhotoKey(key)
    } catch {
      /* R2 unset / failed upload → keep the initials tile */
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    const body = {
      name: name.trim(),
      species: species.trim() || null,
      breed: breed.trim() || null,
      birthday,
      microchip: microchip.trim() || null,
      feeding: feeding.trim() || null,
      sitterNotes: sitterNotes.trim() || null,
      vetBusinessId,
      weights,
      colour,
      photoKey,
      notes: notes.trim() || null,
    }
    setBusy(true)
    setErr(false)
    try {
      const res = await write<{ id?: string }>('pets', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...body } : body,
        affectedKeys: [CERCLE_KEY],
      })
      // Wire owner links once we know the pet id. A brand-new pet created OFFLINE has
      // no id yet (queued) — owners then wait for the next edit; the rest still saves.
      const petId = value?.id ?? res.data?.id ?? null
      if (petId) await reconcileOwners(petId)
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  // HEAVY delete (edit-only) — mirrors Cercle.deletePet(): a confirm dialog rather than
  // the row list's undo toast, same endpoint + affected key so it lands identically.
  async function remove() {
    if (!value || busy) return
    if (!(await confirm({ title: p.delete, message: value.name, tone: 'danger' }))) return
    setBusy(true)
    setErr(false)
    try {
      await write('pets', { method: 'DELETE', body: { id: value.id }, affectedKeys: [CERCLE_KEY] })
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  const photo = photoKey ? imgUrl(photoKey) : null

  return (
    <form className="operator__inline-form" onSubmit={submit}>
      {/* autoFocus: match the family (ContactForm/GroupForm) — the form opens ready to type. */}
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={p.name} aria-label={p.name} autoFocus />

      {/* Species — free text, with a suggestion list (typeaheadOnly). */}
      <EntityCombobox<string>
        value={species}
        onChange={setSpecies}
        options={PET_SPECIES.map((s): ComboOption<string> => ({ id: s[lang], label: s[lang], data: s[lang], icon: 'smiley-bold' }))}
        onPick={(opt) => setSpecies(opt.label)}
        placeholder={p.species}
        submitIcon={null}
        typeaheadOnly
      />

      <input className="input" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder={p.breed} aria-label={p.breed} />

      <label className="cf__label">{p.birthday}</label>
      <BirthdayPicker value={birthday} onChange={setBirthday} />

      {/* Owner(s) — drives where the animal lives in Le cercle. A member → Maisonnée;
          a friend → it shows with them in Social. Leave empty = the Maisonnée's. */}
      <label className="cf__label">{p.owner}</label>
      <EntityCombobox<Person>
        value={ownerQuery}
        onChange={setOwnerQuery}
        options={ownerPeople
          .filter((pp) => !ownerKeys.has(pp.key))
          .map((pp): ComboOption<Person> => ({ id: pp.key, label: pp.name, data: pp, icon: pp.kind === 'member' ? 'users-three-bold' : 'user-bold' }))}
        onPick={(opt) => {
          if (opt.data) setOwnerKeys((s) => new Set(s).add(opt.data!.key))
          setOwnerQuery('')
        }}
        placeholder={p.ownerPick}
        submitIcon={null}
        typeaheadOnly
      />
      {ownerKeys.size > 0 && (
        <ul className="pet-form__owners">
          {[...ownerKeys].map((k) => {
            const pp = peopleByKey.get(k)
            return (
              <li key={k} className="pet-form__owner">
                {pp && <Avatar kind={pp.avatarKind} photo={pp.avatarRef} colour={pp.colour} name={pp.firstName} size={28} />}
                <span className="pet-form__owner-name">{pp?.name ?? k}</span>
                <button
                  type="button"
                  className="row-actions__btn"
                  aria-label={t.common.cancel}
                  onClick={() => setOwnerKeys((s) => { const n = new Set(s); n.delete(k); return n })}
                >
                  <Icon name="x-bold" size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="pet-form__owner-hint mono">{p.ownerHint}</p>

      {/* EVERYTHING secondary — microchip, feeding, sitter notes, the dated weight log,
          the vet, the colour, the notes and the photo — behind one « Détails / santé »
          disclosure, so the identity fields (name/species/breed/birthday/owner) lead and
          the form stays a calm glance (NFR-CALM-1).

          The last four used to hang BELOW this fold, expanded: a disclosure with loose
          fields under it reads as holding nothing worth opening, and that tail was still
          ~350px of form — a colour swatch grid included — under a control that promised
          the details were tucked away.

          Opens itself when the pet already carries ANY of them, so editing never hides
          filled data (the ContactFields rule). The colour is deliberately NOT part of that
          test: it is seeded to PET_COLOUR for a brand-new pet, so counting it would mean
          the fold is never actually folded. */}
      <Disclosure
        label={t.cercle.pet.detailsHealth}
        defaultOpen={
          !!(
            microchip.trim() ||
            feeding.trim() ||
            sitterNotes.trim() ||
            weights.length > 0 ||
            vetBusinessId ||
            notes.trim() ||
            photoKey
          )
        }
      >
        <input className="input" value={microchip} onChange={(e) => setMicrochip(e.target.value)} placeholder={p.microchip} aria-label={p.microchip} />
        <textarea className="input" value={feeding} onChange={(e) => setFeeding(e.target.value)} placeholder={p.feeding} aria-label={p.feeding} rows={2} />
        <textarea className="input" value={sitterNotes} onChange={(e) => setSitterNotes(e.target.value)} placeholder={p.sitterNotes} aria-label={p.sitterNotes} rows={2} />

        {/* Weight log — a dated health log (NOT an inventory count). Add a row, remove one. */}
        <label className="cf__label">{p.weight}</label>
        {weights.length > 0 && (
          <ul className="pet-form__weights">
            {weights.map((w, i) => (
              <li key={i} className="pet-form__weight">
                <span className="mono">{w.date}</span>
                <span className="pet-form__weight-kg">{w.kg} {p.kg}</span>
                <RowActions onDelete={() => setWeights((ws) => ws.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        )}
        <div className="pet-form__weight-add">
          <input className="input" type="date" value={wDate} onChange={(e) => setWDate(e.target.value)} aria-label={p.weightDate} />
          <input className="input" type="number" inputMode="decimal" step="0.1" min="0" value={wKg} onChange={(e) => setWKg(e.target.value)} placeholder={p.kg} aria-label={p.weightKg} />
          <button type="button" className="btn btn--sm btn--ghost" onClick={addWeight} disabled={!wDate || !wKg}>
            <Icon name="plus-bold" size={14} /> {p.weightAdd}
          </button>
        </div>

        {/* Vet — pick an existing Business (or type to filter). Stores vet_business_id. */}
        <label className="cf__label">{p.vet}</label>
        <EntityCombobox<Business>
          value={vetQuery}
          onChange={setVetQuery}
          options={businesses.map((b): ComboOption<Business> => ({ id: b.id, label: b.name, badge: b.category ?? undefined, data: b, icon: 'storefront-bold' }))}
          onPick={(opt) => {
            setVetBusinessId(opt.data?.id ?? null)
            setVetQuery('')
          }}
          placeholder={p.vetPick}
          submitIcon={null}
          typeaheadOnly
        />
        {vet && (
          <p className="pet-form__vet mono">
            <Icon name="storefront-bold" size={13} /> {vet.name}
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setVetBusinessId(null)}>
              {t.common.cancel}
            </button>
          </p>
        )}

        <label className="cf__label">{p.colour}</label>
        <ColorPicker value={colour} onChange={setColour} label={p.colour} />

        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={p.notes} aria-label={p.notes} rows={2} />

        {/* Optional photo (hidden gracefully if R2 is unset → upload fails). */}
        <label className="business-form__photo">
          {photo ? (
            <img src={photo} alt="" className="business-form__photo-img" />
          ) : (
            <span className="business-form__photo-add">
              <Icon name="smiley-bold" size={20} /> {uploading ? p.uploading : p.addPhoto}
            </span>
          )}
          <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </label>
      </Disclosure>


      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter
        saveLabel={value ? t.common.save : p.add}
        saveDisabled={!name.trim()}
        busy={busy}
        onCancel={onCancel}
        onDelete={value ? remove : undefined}
        deleteLabel={p.delete}
      />
    </form>
  )
}
