import { Field } from '../Field'
import { useState } from 'react'
import { useT } from '../../i18n'
import { useConfirm } from '../../lib/confirm'
import { useWrite } from '../../lib/write'
import { useCars } from '../../lib/carPrefs'
import { CARNETS_KEY, BOARD_KEY, TASKS_KEY } from '../../lib/queryKeys'
import { createdId } from '../../lib/undoCreate'
import { anchorSecToDate, dateToAnchorSec } from '../../lib/recurLabel'
import { suggestIcon } from '../../lib/subjects'
import {
  type Carnet,
  type CarnetKind,
  type CarnetFacts,
  CARNET_KINDS,
  CARNET_COLOUR,
  KIND_EMOJI,
} from '../../lib/carnets'
import { StatusMessage } from '../StatusMessage'
import { PhotoField } from '../PhotoField'
import { FormFooter } from '../FormFooter'
import { Disclosure } from '../Disclosure'
import { LookPicker } from '../LookPicker'

// Add / edit ONE carnet's identity (a house, a car, a water heater, a room). A child
// carries `parentId`; the kind seeds its default emoji. POST when new, PATCH when
// `value`. Writes via useWrite (offline-safe); the photo blob goes through api()
// directly (blobs can't queue in the outbox), exactly like BusinessForm.
export function CarnetForm({
  value,
  parentId,
  defaultKind = 'thing',
  lookOpen,
  onSaved,
  onCancel,
}: {
  value?: Carnet | null
  parentId?: string | null
  defaultKind?: CarnetKind
  /** Open the look fold from the start: the « une chose à moi » door, where the look IS the point. */
  lookOpen?: boolean | undefined
  onSaved: (id?: string) => void
  onCancel?: () => void
}) {
  const t = useT()
  const write = useWrite()
  const confirm = useConfirm()
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
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  // An 'auto' carnet can bridge to an existing « L'auto » car (link_id = car id), so
  // its scene links over to the car's schedule. L'auto's own data stays untouched.
  const { cars } = useCars()

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
      const res = await write<{ id?: string }>('carnets', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...body } : body,
        // TASKS_KEY: a new carnet is a subject a task can be filed under right away.
        affectedKeys: [CARNETS_KEY, BOARD_KEY, TASKS_KEY],
      })
      // The new id, when the server gave one (a queued create has none yet): the subject
      // picker files the task under it at once.
      onSaved(value?.id ?? createdId(res))
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  // HEAVY delete (edit-only) — mirrors CercleCarnetPage.removeCarnet(): a confirm
  // dialog (the carnet + its descendants cascade server-side), same endpoint +
  // affected keys as the scene's own delete, so an in-form delete lands identically.
  async function remove() {
    if (!value || busy) return
    if (!(await confirm({ message: c.deleteConfirm(value.name), confirmLabel: c.delete, tone: 'danger' }))) return
    setBusy(true)
    setErr(false)
    try {
      await write('carnets', { method: 'DELETE', body: { id: value.id }, affectedKeys: [CARNETS_KEY, BOARD_KEY] })
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }


  return (
    <form className="operator__inline-form" onSubmit={submit}>
      {/* No autoFocus — house rule: a SCREEN, sheet or dialog opening never summons the keyboard (autofocus.test.ts): this form also opens to EDIT, and on a phone the keyboard would cover it before it is read. */}
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={c.namePh} aria-label={c.name} />

      <Field inline className="mono" label={c.kindLabel}>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as CarnetKind)} aria-label={c.kindLabel}>
          {CARNET_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_EMOJI[k]} {c.kind[k]}
            </option>
          ))}
        </select>
      </Field>

      {kind === 'auto' && cars.length > 0 && (
        <Field inline className="mono" label={c.linkCar}>
          <select className="input" value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label={c.linkCar}>
            <option value="">{c.noCarLink}</option>
            {cars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* The look, the one control every task and subject form shares (LookPicker, 0148). A
          carnet is a SOURCE: its tasks inherit this look, so it has no « like » of its own and
          a cleared icon goes back to the kind's glyph (KIND_EMOJI). The emoji stays where it has
          always lived, facts.emoji: one place for one fact. */}
      <LookPicker
        value={{ icon: emoji.trim() || null, colour }}
        onChange={(v) => {
          setEmoji(v.icon ?? '')
          if (v.colour) setColour(v.colour)
        }}
        fallbackIcon={KIND_EMOJI[kind]}
        suggest={suggestIcon(name)}
        defaultOpen={lookOpen}
      />

      {/* Secondary spec fields — installed date, lifespan, model, warranty — collapsed
          behind a « Fiche technique » disclosure so the identity (name/kind/emoji/
          colour) leads and the form stays a calm glance (NFR-CALM-1). Open by default
          when editing a carnet that already carries any of them. */}
      <Disclosure
        label={t.carnets.techSheet}
        defaultOpen={!!(installed || lifeYears || model.trim() || warranty)}
      >
        <Field inline className="mono" label={c.installed}>
          <input className="input" type="date" value={installed} onChange={(e) => setInstalled(e.target.value)} aria-label={c.installed} />
        </Field>

        <Field inline className="mono" label={c.lifespan}>
          <input
            className="input"
            inputMode="numeric"
            value={lifeYears}
            onChange={(e) => setLifeYears(e.target.value)}
            placeholder={c.lifespanPh}
            aria-label={c.lifespan}
            style={{ maxWidth: '6rem' }}
          />
        </Field>

        <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={c.model} aria-label={c.model} />

        <Field inline className="mono" label={c.warranty}>
          <input className="input" type="date" value={warranty} onChange={(e) => setWarranty(e.target.value)} aria-label={c.warranty} />
        </Field>
      </Disclosure>

      <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={c.notes} aria-label={c.notes} />

      {/* Optional photo of the thing (degrades to the emoji disc when R2 is unset). */}
      <PhotoField value={photoKey} onChange={setPhotoKey} endpoint="carnets" icon="camera-bold" addLabel={c.addPhoto} uploadingLabel={c.uploading} />

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter
        saveLabel={value ? t.common.save : c.add}
        saveDisabled={!name.trim()}
        busy={busy}
        onCancel={onCancel}
        onDelete={value ? remove : undefined}
        deleteLabel={c.delete}
      />
    </form>
  )
}
