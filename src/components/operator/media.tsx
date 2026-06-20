import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api, isStatus } from '../../lib/api'
import { useUndoableRemove } from '../../lib/undoRemove'
import { imgUrl } from '../../lib/image'
import { uploadMedia, MediaUnavailableError } from '../../lib/uploadMedia'
import { isGuest } from '../../lib/device'
import { Icon } from '../Icon'
import { EmptyState } from '../EmptyState'

// Weekly recap: an on-demand, calm reflection (NFR-CALM/COST — a button, never a
// loop). Hides itself when AI is unavailable (503) so it never shows a dead button.
export function RecapSection({ help }: { help?: HelpMode }) {
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
    <OperatorSection title={t.operator.recapTitle} help={help} helpKey="recap" hint={recap || undefined}>
      {!isGuest() && (
        <button type="button" className="btn btn--primary" onClick={generate} disabled={busy}>
          {busy ? t.operator.recapThinking : t.operator.recapGen}
        </button>
      )}
    </OperatorSection>
  )
}

// Home photos: family pictures that drift across the wall board. Upload straight
// from a phone (camera or gallery); they're resized small before upload and the
// set is capped server-side, so this stays free. Hides itself if R2 is unbound.
export function PhotosSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['photos'],
    queryFn: () => api<{ photos: { id: string; key: string }[] }>('photos'),
  })
  const photos = data?.photos ?? []
  const undoableRemove = useUndoableRemove()
  // Read-only guest: photos are viewable, but no delete-per-tile and no upload.
  const ro = isGuest()
  const [busy, setBusy] = useState(false)
  // Batch progress: {done, total} while uploading several at once, null when idle.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  // Add one OR many photos in a single pick (camera roll multi-select). Resized
  // and uploaded one at a time — sequential so the server-side prune can't race
  // itself — with a "2/5" counter so a big batch doesn't look frozen.
  async function addFiles(files: File[]) {
    if (!files.length) return
    setBusy(true)
    setProgress({ done: 0, total: files.length })
    try {
      for (let i = 0; i < files.length; i++) {
        // Sequential so the server-side prune can't race itself.
        await uploadMedia('photos', files[i])
        setProgress({ done: i + 1, total: files.length })
      }
      qc.invalidateQueries({ queryKey: ['photos'] })
    } catch (e) {
      if (e instanceof MediaUnavailableError) setUnavailable(true)
      // A mid-batch failure still surfaces what DID upload.
      qc.invalidateQueries({ queryKey: ['photos'] })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  // Deferred delete via the shared hook: drop the tile now but HOLD the DELETE
  // behind the undo toast, so the R2 object isn't removed until the window passes —
  // a mis-tap costs nothing and needs no re-upload. (The hook snapshots just this
  // row, so two quick deletes stacking in one window can't resurrect each other.)
  function remove(id: string) {
    undoableRemove({
      queryKey: ['photos'],
      listProp: 'photos',
      id,
      label: '', // a photo has no name — use the dedicated copy instead
      message: t.undo.photoRemoved,
      commit: () => api('photos', { method: 'DELETE', body: { id } }),
      after: () => qc.invalidateQueries({ queryKey: ['photos'] }),
    })
  }

  if (unavailable) return null
  return (
    <OperatorSection title={t.operator.photos} help={help} helpKey="photos">
      {photos.length === 0 ? (
        <EmptyState>{t.operator.noPhotos}</EmptyState>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.id} className="photo-grid__item">
              <img src={imgUrl(p.key)} alt="" loading="lazy" />
              {!ro && (
                <button
                  type="button"
                  className="photo-grid__del"
                  onClick={() => remove(p.id)}
                  aria-label={t.operator.delete}
                >
                  <Icon name="x-bold" size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!ro && (
        <label className="btn btn--primary">
          {busy
            ? progress
              ? t.operator.photoUploadingN(progress.done, progress.total)
              : t.operator.photoUploading
            : t.operator.photoAdd}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) addFiles(files)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </OperatorSection>
  )
}
