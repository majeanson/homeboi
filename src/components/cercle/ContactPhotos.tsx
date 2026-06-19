import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { imgUrl, resizeImage, PHOTO_MAX } from '../../lib/image'
import { useOnline } from '../../lib/online'
import { ZoomableImg } from '../ZoomableImg'
import { Icon } from '../Icon'

interface ContactPhoto {
  id: string
  photoKey: string
  caption: string | null
  createdAt: number
}

// The per-person photo gallery shown inside the contact editor (edit pass only —
// it needs a saved contact id). Attach extra pictures with a short caption: an ID
// card, a screenshot of a coworker, a snapshot together. Blobs ride R2 through the
// shared /api/cercle image upload (like the avatar); the row links {key, caption}
// to this contact. Online-only (a photo can't be queued offline — the blob upload
// needs R2), so the add control disables when offline.
export function ContactPhotos({ contactId }: { contactId: string }) {
  const t = useT()
  const qc = useQueryClient()
  const online = useOnline()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  // Prefixed under 'cercle' so a realtime cercle nudge (or a CERCLE_KEY
  // invalidation) refreshes the gallery too.
  const photosKey = ['cercle', 'photos', contactId]
  const { data } = useQuery({
    queryKey: photosKey,
    queryFn: () => api<{ photos: ContactPhoto[] }>(`cercle-photos?contactId=${encodeURIComponent(contactId)}`),
  })
  const photos = data?.photos ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: photosKey })

  async function addPhoto(file: File | undefined) {
    if (!file || busy) return
    setBusy(true)
    try {
      const blob = await resizeImage(file, PHOTO_MAX)
      const { key } = await api<{ key: string }>('cercle', { method: 'POST', body: blob })
      await api('cercle-photos', { method: 'POST', body: { contactId, photoKey: key } })
      refresh()
    } catch {
      /* upload failed (offline / R2 unset) — silently keep the current gallery */
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveCaption(p: ContactPhoto, next: string) {
    const trimmed = next.trim()
    if (trimmed === (p.caption ?? '')) return
    try {
      await api('cercle-photos', { method: 'PATCH', body: { id: p.id, caption: trimmed || null } })
      refresh()
    } catch {
      /* leave the field as typed; a later edit retries */
    }
  }

  async function removePhoto(p: ContactPhoto) {
    try {
      await api('cercle-photos', { method: 'DELETE', body: { id: p.id } })
      refresh()
    } catch {
      /* keep it on screen if the delete didn't land */
    }
  }

  return (
    <div className="cf__field cf-photos">
      <span className="cf__label">
        <Icon name="image-square-bold" size={14} /> {t.cercle.photos}
      </span>

      {photos.length > 0 && (
        <div className="cf-photos__grid">
          {photos.map((p) => (
            <figure key={p.id} className="cf-photos__item">
              <ZoomableImg src={imgUrl(p.photoKey)} alt={p.caption ?? ''} className="cf-photos__img" />
              <button
                type="button"
                className="cf-photos__del"
                aria-label={t.cercle.removePhotoFromGallery}
                onClick={() => removePhoto(p)}
              >
                <Icon name="x-bold" size={12} />
              </button>
              <input
                className="cf-photos__caption"
                defaultValue={p.caption ?? ''}
                placeholder={t.cercle.photoCaption}
                onBlur={(e) => saveCaption(p, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
            </figure>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => addPhoto(e.target.files?.[0])} />
      <button
        type="button"
        className="btn btn--sm"
        disabled={!online || busy}
        onClick={() => fileRef.current?.click()}
      >
        <Icon name="camera-bold" size={16} /> {t.cercle.addPhotoToGallery}
      </button>
      <p className="cf-photos__hint mono">{online ? t.cercle.photosHint : t.cercle.photoOnline}</p>
    </div>
  )
}
