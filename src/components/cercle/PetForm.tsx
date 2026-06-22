import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { resizeImage, imgUrl } from '../../lib/image'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY, BUSINESSES_KEY } from '../../lib/queryKeys'
import { type Business } from '../../lib/businesses'
import { type Pet, type PetWeight, PET_SPECIES } from '../../lib/cercle'
import { BirthdayPicker } from './BirthdayPicker'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { ColorPicker } from '../ColorPicker'
import { StatusMessage } from '../StatusMessage'
import { RowActions } from '../RowActions'
import { Icon } from '../Icon'

const PET_COLOUR = '#C7873F' // the pet amber (mirrors PET_ACCENT in lib/cercle)

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
      await write('pets', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...body } : body,
        affectedKeys: [CERCLE_KEY],
      })
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
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={p.name} aria-label={p.name} />

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

      <input className="input" value={microchip} onChange={(e) => setMicrochip(e.target.value)} placeholder={p.microchip} aria-label={p.microchip} />
      <textarea className="input" value={feeding} onChange={(e) => setFeeding(e.target.value)} placeholder={p.feeding} aria-label={p.feeding} rows={2} />
      <textarea className="input" value={sitterNotes} onChange={(e) => setSitterNotes(e.target.value)} placeholder={p.sitterNotes} aria-label={p.sitterNotes} rows={2} />

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

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <button type="submit" className="btn" disabled={!name.trim() || busy}>
        {value ? t.common.save : p.add}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  )
}
