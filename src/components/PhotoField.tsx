import { useState } from 'react'
import { api } from '../lib/api'
import { resizeImage, imgUrl } from '../lib/image'
import { Icon, type IconName } from './Icon'

// THE optional-single-photo field — pick one image, see it, replace it by picking
// again. The shape three forms had each written out for themselves (`CarnetForm`'s
// thing photo, `BusinessForm`'s card photo, and now a trip's cover), byte-identical
// down to the `.business-form__photo` class names and differing only in the icon,
// the label and the endpoint. PARITY's ≥3-sites rule, met.
//
// It owns the whole upload leg: resize → POST the blob to `endpoint` → hand the
// caller back the opaque `{key}` (the P2-8 memo-media pattern). The host still owns
// the WRITE — it stores that key in its own `media_key`/`mediaKey` field when the
// form is saved — so a picked-then-cancelled photo never lands on a row.
//
// **R2-unset degrades silently, on purpose.** The upload throws, we swallow it and
// keep the placeholder: the form still saves, just without a photo. That is the
// house rule for every optional binding (`functions/_lib/env.ts`) and the reason
// this component never surfaces an error — a household with no R2 is not broken,
// it just has no pictures.
export function PhotoField({
  value,
  onChange,
  endpoint,
  icon,
  addLabel,
  uploadingLabel,
  className,
}: {
  /** The stored R2 key, or null. */
  value: string | null
  /** Called with the new key once an upload succeeds. Never called on failure. */
  onChange: (key: string) => void
  /** The blob POST target — each entity uploads to its own endpoint. */
  endpoint: string
  /** The placeholder glyph (a camera, a storefront, a suitcase…). */
  icon: IconName
  /** The placeholder line, e.g. « Ajouter une photo ». */
  addLabel: string
  /** Shown in place of `addLabel` while the blob uploads. */
  uploadingLabel: string
  className?: string
}) {
  const [uploading, setUploading] = useState(false)
  const photo = value ? imgUrl(value) : null

  async function pick(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const blob = await resizeImage(file, 1024)
      const { key } = await api<{ key: string }>(endpoint, { method: 'POST', body: blob })
      onChange(key)
    } catch {
      /* R2 unset / failed upload → keep the placeholder; the form still saves */
    } finally {
      setUploading(false)
    }
  }

  return (
    <label className={'business-form__photo' + (className ? ` ${className}` : '')}>
      {photo ? (
        <img src={photo} alt="" className="business-form__photo-img" />
      ) : (
        <span className="business-form__photo-add">
          <Icon name={icon} size={20} /> {uploading ? uploadingLabel : addLabel}
        </span>
      )}
      <input type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </label>
  )
}
