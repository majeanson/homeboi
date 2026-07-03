import { useState } from 'react'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { resizeImage, imgUrl } from '../../lib/image'
import { useWrite } from '../../lib/write'
import { HOME_PINS_KEY } from '../../lib/queryKeys'
import { type HomePin, type HomePinKind, PIN_EMOJI } from '../../lib/carnets'
import { StatusMessage } from '../StatusMessage'
import { FormFooter } from '../FormFooter'
import { Icon } from '../Icon'

const PIN_KINDS: HomePinKind[] = ['where', 'howto', 'doc']

// Add / edit one « En cas de pépin » map entry on a home carnet: a location (where's
// the shutoff), a how-to (how the thermostat works), or a doc — with an optional
// photo. Calm reference, never a quantity. POST/PATCH via useWrite; the photo blob
// goes straight to /api/home-pins (returns a key), like the other carnet forms.
export function HomePinForm({
  carnetId,
  value,
  onSaved,
  onCancel,
}: {
  carnetId: string
  value?: HomePin | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const write = useWrite()
  const c = t.carnets

  const [kind, setKind] = useState<HomePinKind>(value?.kind ?? 'where')
  const [label, setLabel] = useState(value?.label ?? '')
  const [detail, setDetail] = useState(value?.detail ?? '')
  const [mediaKey, setMediaKey] = useState<string | null>(value?.mediaKey ?? null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const blob = await resizeImage(file, 1200)
      const { key } = await api<{ key: string }>('home-pins', { method: 'POST', body: blob })
      setMediaKey(key)
    } catch {
      /* R2 unset → keep the text pin */
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim() || busy) return
    const body = { carnetId, kind, label: label.trim(), detail: detail.trim() || null, mediaKey }
    setBusy(true)
    setErr(false)
    try {
      await write('home-pins', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...body } : body,
        affectedKeys: [HOME_PINS_KEY],
      })
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  const photo = mediaKey ? imgUrl(mediaKey) : null

  return (
    <form className="operator__inline-form" onSubmit={submit}>
      <label className="recur__row mono">
        <span>{c.pinKind}</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as HomePinKind)} aria-label={c.pinKind}>
          {PIN_KINDS.map((k) => (
            <option key={k} value={k}>
              {PIN_EMOJI[k]} {c.pinKinds[k]}
            </option>
          ))}
        </select>
      </label>

      <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={c.pinLabel} aria-label={c.pinLabel} />
      <textarea className="input" value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder={c.pinDetail} aria-label={c.pinDetail} />

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
      <FormFooter saveLabel={value ? t.common.save : c.addPin} saveDisabled={!label.trim()} busy={busy} onCancel={onCancel} />
    </form>
  )
}
