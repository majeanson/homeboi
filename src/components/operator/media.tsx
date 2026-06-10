import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api, isStatus } from '../../lib/api'
import { resizeImage, imgUrl, PHOTO_MAX } from '../../lib/image'

// Weekly recap: an on-demand, calm reflection (NFR-CALM/COST — a button, never a
// loop). Hides itself when AI is unavailable (503) so it never shows a dead button.
export function RecapSection() {
  const t = useT()
  const [recap, setRecap] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const r = await api<{ recap: string | null }>('recap')
      setRecap(r.recap)
    } catch (e) {
      if (isStatus(e, 503)) setUnavailable(true)
    } finally {
      setBusy(false)
    }
  }

  if (unavailable) return null
  return (
    <section className="surface operator__section">
      <h2>{t.operator.recapTitle}</h2>
      <p className="mono">{t.operator.recapHint}</p>
      {recap && <p className="lead">{recap}</p>}
      <button type="button" className="btn" onClick={generate} disabled={busy}>
        {busy ? t.operator.recapThinking : t.operator.recapGen}
      </button>
    </section>
  )
}

// Home photos: family pictures that drift across the wall board. Upload straight
// from a phone (camera or gallery); they're resized small before upload and the
// set is capped server-side, so this stays free. Hides itself if R2 is unbound.
export function PhotosSection() {
  const t = useT()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['photos'],
    queryFn: () => api<{ photos: { id: string; key: string }[] }>('photos'),
  })
  const photos = data?.photos ?? []
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  async function add(file: File) {
    setBusy(true)
    try {
      const blob = await resizeImage(file, PHOTO_MAX)
      await api('photos', { method: 'POST', body: blob })
      qc.invalidateQueries({ queryKey: ['photos'] })
    } catch (e) {
      if (isStatus(e, 503)) setUnavailable(true)
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    await api('photos', { method: 'DELETE', body: { id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['photos'] })
  }

  if (unavailable) return null
  return (
    <section className="surface operator__section">
      <h2>{t.operator.photos}</h2>
      <p className="mono">{t.operator.photoHint}</p>
      {photos.length === 0 ? (
        <p className="board__empty mono">{t.operator.noPhotos}</p>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.id} className="photo-grid__item">
              <img src={imgUrl(p.key)} alt="" loading="lazy" />
              <button
                type="button"
                className="photo-grid__del"
                onClick={() => remove(p.id)}
                aria-label={t.operator.delete}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="btn">
        {busy ? t.operator.photoUploading : t.operator.photoAdd}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) add(f)
            e.target.value = ''
          }}
        />
      </label>
    </section>
  )
}
