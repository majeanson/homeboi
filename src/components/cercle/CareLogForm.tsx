import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { resizeImage, imgUrl } from '../../lib/image'
import { useWrite } from '../../lib/write'
import { live } from '../../lib/query'
import { parseMoney } from '../../lib/money'
import { CARNETS_KEY, CARE_LOG_KEY, BUSINESSES_KEY } from '../../lib/queryKeys'
import { anchorSecToDate, dateToAnchorSec, todayAnchorDate } from '../../lib/recurLabel'
import { type CareLog } from '../../lib/carnets'
import { type Business } from '../../lib/businesses'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { StatusMessage } from '../StatusMessage'
import { Icon } from '../Icon'

const LOG_KINDS: CareLog['kind'][] = ['service', 'install', 'purchase', 'note']

// Add / edit one « carnet » history entry: a dated service / install / purchase /
// note, with an optional cost, the installer (a cercle business), and attached docs
// (invoice / manual / photo, in R2). The doc blobs POST straight to /api/care-log
// (returns a key); the entry itself writes via useWrite. This is Marc's water-heater
// example — "install date + invoice + notes" — as one row.
export function CareLogForm({
  carnetId,
  value,
  onSaved,
  onCancel,
}: {
  carnetId: string
  value?: CareLog | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const write = useWrite()
  const c = t.carnets

  const [at, setAt] = useState(value ? anchorSecToDate(value.at) : todayAnchorDate())
  const [kind, setKind] = useState<CareLog['kind']>(value?.kind ?? 'service')
  const [title, setTitle] = useState(value?.title ?? '')
  const [note, setNote] = useState(value?.note ?? '')
  const [cost, setCost] = useState(value?.costCents != null ? String(value.costCents / 100) : '')
  const [businessId, setBusinessId] = useState<string | null>(value?.businessId ?? null)
  const [installer, setInstaller] = useState('')
  const [mediaKeys, setMediaKeys] = useState<string[]>(value?.mediaKeys ?? [])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const { data: bizData } = useQuery({ queryKey: BUSINESSES_KEY, queryFn: () => api<{ businesses: Business[] }>('businesses'), ...live })
  const businesses = bizData?.businesses ?? []
  const bizName = businessId ? businesses.find((b) => b.id === businessId)?.name ?? '' : installer
  const options: ComboOption<Business>[] = businesses.map((b) => ({ id: b.id, label: b.name, data: b, icon: 'storefront-bold', iconColor: b.colour ?? undefined }))

  async function addDocs(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const keys: string[] = []
      for (const file of Array.from(files)) {
        const blob = file.type.startsWith('image/') ? await resizeImage(file, 1400) : file
        const { key } = await api<{ key: string }>('care-log', { method: 'POST', body: blob })
        keys.push(key)
      }
      setMediaKeys((prev) => [...prev, ...keys])
    } catch {
      /* R2 unset / failed → keep what we had */
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    const body = {
      carnetId,
      at: dateToAnchorSec(at) ?? undefined,
      kind,
      title: title.trim(),
      note: note.trim() || null,
      costCents: parseMoney(cost),
      businessId,
      mediaKeys,
    }
    setBusy(true)
    setErr(false)
    try {
      await write('care-log', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...body } : body,
        affectedKeys: [CARE_LOG_KEY, CARNETS_KEY, ['board']],
      })
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="operator__inline-form" onSubmit={submit}>
      <label className="recur__row mono">
        <span>{c.logDate}</span>
        <input className="input" type="date" value={at} onChange={(e) => setAt(e.target.value)} aria-label={c.logDate} />
      </label>

      <label className="recur__row mono">
        <span>{c.logKind}</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as CareLog['kind'])} aria-label={c.logKind}>
          {LOG_KINDS.map((k) => (
            <option key={k} value={k}>
              {c.logKinds[k]}
            </option>
          ))}
        </select>
      </label>

      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.logTitle} aria-label={c.logTitle} />
      <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={c.logNote} aria-label={c.logNote} />

      <label className="recur__row mono">
        <span>{c.cost}</span>
        <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={c.costPh} aria-label={c.cost} style={{ maxWidth: '8rem' }} />
      </label>

      {/* Installer / servicer — pick an existing cercle business (optional). */}
      <EntityCombobox<Business>
        value={bizName}
        onChange={(v) => {
          setInstaller(v)
          setBusinessId(null)
        }}
        options={options}
        onPick={(opt) => {
          setBusinessId(opt.data.id)
          setInstaller(opt.label)
        }}
        placeholder={c.installer}
        submitIcon={null}
        typeaheadOnly
      />

      {/* Attached docs — invoice / manual / photo (degrade when R2 is unset). */}
      <label className="business-form__photo">
        <span className="business-form__photo-add">
          <Icon name="receipt-bold" size={20} /> {uploading ? c.uploading : c.addDoc}
        </span>
        <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void addDocs(e.target.files)} />
      </label>
      {mediaKeys.length > 0 && (
        <div className="carnet-docs">
          {mediaKeys.map((k) => (
            <span key={k} className="carnet-docs__doc">
              <img src={imgUrl(k)} alt="" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
              <button type="button" className="carnet-docs__rm" aria-label={t.common.delete} onClick={() => setMediaKeys((prev) => prev.filter((x) => x !== k))}>
                <Icon name="x-bold" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <button type="submit" className="btn" disabled={!title.trim() || busy}>
        {value ? t.common.save : c.addEntry}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  )
}
