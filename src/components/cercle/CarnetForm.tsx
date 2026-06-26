import { useState } from 'react'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { resizeImage, imgUrl } from '../../lib/image'
import { useWrite } from '../../lib/write'
import { useCars } from '../../lib/carPrefs'
import { CARNETS_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { anchorSecToDate, dateToAnchorSec } from '../../lib/recurLabel'
import {
  type Carnet,
  type CarnetKind,
  type CarnetFacts,
  CARNET_KINDS,
  CARNET_COLOUR,
  KIND_EMOJI,
} from '../../lib/carnets'
import { ColorPicker } from '../ColorPicker'
import { StatusMessage } from '../StatusMessage'
import { Icon } from '../Icon'

// Add / edit ONE carnet's identity (a house, a car, a water heater, a room). A child
// carries `parentId`; the kind seeds its default emoji. POST when new, PATCH when
// `value`. Writes via useWrite (offline-safe); the photo blob goes through api()
// directly (blobs can't queue in the outbox), exactly like BusinessForm.
export function CarnetForm({
  value,
  parentId,
  defaultKind = 'thing',
  onSaved,
  onCancel,
}: {
  value?: Carnet | null
  parentId?: string | null
  defaultKind?: CarnetKind
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const write = useWrite()
  const c = t.carnets

  const [name, setName] = useState(value?.name ?? '')
  const [kind, setKind] = useState<CarnetKind>(value?.kind ?? defaultKind)
  const [emoji, setEmoji] = useState((value?.facts?.emoji as string) ?? '')
  const [colour, setColour] = useState(value?.color ?? CARNET_COLOUR)
  const [photoKey, setPhotoKey] = useState<string | null>(value?.mediaKey ?? null)
  const [installed, setInstalled] = useState(anchorSecToDate(value?.installedAt ?? null))
  const [lifeYears, setLifeYears] = useState(value?.lifespanMonths != null ? String(Math.round(value.lifespanMonths / 12)) : '')
  const [model, setModel] = useState((value?.facts?.model as string) ?? '')
  const [warranty, setWarranty] = useState(anchorSecToDate((value?.facts?.warrantyUntil as number) ?? null))
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [linkId, setLinkId] = useState<string>(value?.linkId ?? '')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  // An 'auto' carnet can bridge to an existing « L'auto » car (link_id = car id), so
  // its scene links over to the car's schedule. L'auto's own data stays untouched.
  const { cars } = useCars()

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const blob = await resizeImage(file, 1024)
      const { key } = await api<{ key: string }>('carnets', { method: 'POST', body: blob })
      setPhotoKey(key)
    } catch {
      /* R2 unset / failed upload → keep the emoji disc */
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    const years = Number(lifeYears)
    const facts: CarnetFacts = {}
    if (emoji.trim()) facts.emoji = emoji.trim()
    if (model.trim()) facts.model = model.trim()
    const warrantySec = dateToAnchorSec(warranty)
    if (warrantySec) facts.warrantyUntil = warrantySec
    const body = {
      kind,
      name: name.trim(),
      color: colour,
      mediaKey: photoKey,
      facts: Object.keys(facts).length ? facts : null,
      installedAt: installed ? dateToAnchorSec(installed) : null,
      lifespanMonths: Number.isFinite(years) && years > 0 ? Math.round(years * 12) : null,
      notes: notes.trim() || null,
      linkId: kind === 'auto' ? linkId || null : null,
      ...(value ? {} : { parentId: parentId ?? null }),
    }
    setBusy(true)
    setErr(false)
    try {
      await write('carnets', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...body } : body,
        affectedKeys: [CARNETS_KEY, BOARD_KEY],
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
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={c.namePh} aria-label={c.name} />

      <label className="recur__row mono">
        <span>{c.kindLabel}</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as CarnetKind)} aria-label={c.kindLabel}>
          {CARNET_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_EMOJI[k]} {c.kind[k]}
            </option>
          ))}
        </select>
      </label>

      {kind === 'auto' && cars.length > 0 && (
        <label className="recur__row mono">
          <span>{c.linkCar}</span>
          <select className="input" value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label={c.linkCar}>
            <option value="">{c.noCarLink}</option>
            {cars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="recur__row mono">
        <span>{c.emoji}</span>
        <input
          className="input"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder={KIND_EMOJI[kind]}
          aria-label={c.emoji}
          maxLength={4}
          style={{ maxWidth: '5rem' }}
        />
      </label>

      <ColorPicker value={colour} onChange={setColour} label={c.colour} />

      <label className="recur__row mono">
        <span>{c.installed}</span>
        <input className="input" type="date" value={installed} onChange={(e) => setInstalled(e.target.value)} aria-label={c.installed} />
      </label>

      <label className="recur__row mono">
        <span>{c.lifespan}</span>
        <input
          className="input"
          inputMode="numeric"
          value={lifeYears}
          onChange={(e) => setLifeYears(e.target.value)}
          placeholder={c.lifespanPh}
          aria-label={c.lifespan}
          style={{ maxWidth: '6rem' }}
        />
      </label>

      <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={c.model} aria-label={c.model} />

      <label className="recur__row mono">
        <span>{c.warranty}</span>
        <input className="input" type="date" value={warranty} onChange={(e) => setWarranty(e.target.value)} aria-label={c.warranty} />
      </label>

      <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={c.notes} aria-label={c.notes} />

      {/* Optional photo of the thing (degrades to the emoji disc when R2 is unset). */}
      <label className="business-form__photo">
        {photo ? (
          <img src={photo} alt="" className="business-form__photo-img" />
        ) : (
          <span className="business-form__photo-add">
            <Icon name="camera-bold" size={20} /> {uploading ? c.uploading : c.addPhoto}
          </span>
        )}
        <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
      </label>

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <button type="submit" className="btn" disabled={!name.trim() || busy}>
        {value ? t.common.save : c.add}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  )
}
