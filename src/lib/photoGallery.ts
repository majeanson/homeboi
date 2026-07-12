import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { imgUrl } from './image'
import { live } from './query'
import { uploadMediaRow } from './uploadMedia'
import { PHOTOS_KEY } from './queryKeys'
import { useT } from '../i18n'
import { useRecordUndo } from './toast'

// The household photo gallery (`photos`) — the family pictures that drift across the
// wall board (PhotoFrame) and the screensaver (PhotoMosaic). Réglages ▸ Photos was
// its ONLY door: a photo you snapped for a fridge note / un mot lived only on that
// note, and clearing the note took it with it. So this is the photo twin of
// lib/drawingGallery's « Garder dans Mes dessins », and it follows the same rule:
//
//   a kept photo owns its OWN R2 blob (a fresh `ph_` upload), never the note's `nm_`
//   one — so clearing the note can't free a photo you decided to keep, and pruning
//   the frame can't blank the note.
//
// The set is capped server-side (MAX_PHOTOS = 30, oldest pruned with its blob), so
// keeping is bounded by design and needs no cleanup here.

export interface HouseholdPhoto {
  id: string
  key: string
}

/** The frame's photos. `poll` = the board/screensaver's live cadence (lib/query). */
export function usePhotos({ poll = false }: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: PHOTOS_KEY,
    queryFn: () => api<{ photos: HouseholdPhoto[] }>('photos'),
    ...(poll ? live : {}),
  })
}

// Add a photo to the frame. Stays on `api()` (via uploadMediaRow) rather than
// useWrite: it's atomically coupled to an R2 blob upload that can't ride the offline
// outbox, so queueing the row alone would mean a row with no bytes (same call the
// drawings gallery makes). Returns the new row id, for an undoable toast.
export function useSavePhoto() {
  const qc = useQueryClient()
  return async (blob: Blob): Promise<string> => {
    const { id } = await uploadMediaRow<{ id: string; key: string }>('photos', blob, { filename: 'photo.jpg' })
    qc.invalidateQueries({ queryKey: PHOTOS_KEY })
    return id
  }
}

export function useDeletePhoto() {
  const qc = useQueryClient()
  return async (id: string) => {
    await api('photos', { method: 'DELETE', body: { id } })
    qc.invalidateQueries({ queryKey: PHOTOS_KEY })
  }
}

// Keep a photo into the frame with the calm, undoable toast — the one call every
// "…and keep this one" affordance makes (the memo composer's 📎 chip today). Fetching
// the blob back from its served R2 url is what makes the copy INDEPENDENT: the bytes
// are re-uploaded under a fresh `ph_` key that only the gallery row references.
// Best-effort: a failed keep (R2 unset / offline) resolves to null without throwing.
export function useKeepPhotoInGalleryToast() {
  const save = useSavePhoto()
  const remove = useDeletePhoto()
  const record = useRecordUndo()
  const t = useT()
  return async (source: Blob | string, onUndo?: () => void): Promise<string | null> => {
    try {
      // A key (the already-uploaded note attachment) → fetch its bytes back; a Blob
      // (the file straight off the camera) → keep the original, full-size.
      const blob = typeof source === 'string' ? await fetch(imgUrl(source)).then((r) => r.blob()) : source
      const id = await save(blob)
      record({
        message: t.memo.savedToPhotos,
        onUndo: () => {
          onUndo?.()
          void remove(id).catch(() => {})
        },
      })
      return id
    } catch {
      return null
    }
  }
}
