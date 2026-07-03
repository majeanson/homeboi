import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useWrite } from './write'
import { uploadMedia } from './uploadMedia'
import { imgUrl } from './image'
import { BOARD_KEY, DRAWINGS_KEY } from './queryKeys'
import { useT } from '../i18n'
import { useRecordUndo } from './toast'

// The drawing collection / gallery (#14): kept drawings (the lasting "Mes dessins",
// especially a toddler's), distinct from transient fridge notes. Each entry owns
// its own R2 blobs so a cleared note never frees a kept drawing — so SAVING uploads
// the PNG + editable scene fresh (note-media) before recording the row.

export interface GalleryDrawing {
  id: string
  member_id: string | null
  media_key: string
  scene_key: string | null
  created_at: number
}

// Alias the shared key so the many call sites below read the same; the canonical
// spelling lives in lib/queryKeys (DRAWINGS_KEY) so it can't drift into two caches.
const GALLERY_KEY = DRAWINGS_KEY

export function useGallery() {
  return useQuery({ queryKey: GALLERY_KEY, queryFn: () => api<{ drawings: GalleryDrawing[] }>('drawings') })
}

// Upload the PNG + (optional) scene to fresh R2 keys — both save paths need this.
// The PNG (already export-capped by DrawPad) rides the shared media path
// (uploadMedia: POST → {key}, 503 → MediaUnavailableError); the scene is a JSON
// sidecar (not an image), so it stays a raw note-media POST.
async function uploadDrawing(png: Blob, scene: string): Promise<{ media_key: string; scene_key?: string }> {
  const media_key = await uploadMedia('note-media', png, { resize: false })
  let scene_key: string | undefined
  if (scene) {
    try {
      const r = await api<{ key: string }>('note-media', { method: 'POST', body: new Blob([scene], { type: 'application/json' }) })
      scene_key = r.key
    } catch {
      /* scene optional — the PNG stands on its own */
    }
  }
  return { media_key, scene_key }
}

// NB on the save/update writes below: they stay on `api()` ON PURPOSE. Each is
// atomically coupled to an R2 blob upload (uploadDrawing) that must succeed FIRST
// and itself can't be queued — so routing the trailing POST/PATCH through the
// offline outbox would split a 2-step op across online/offline (a queued row with
// no blobs). The DELETE has no such coupling, so it goes through useWrite (below).
export function useSaveToGallery() {
  const qc = useQueryClient()
  // Keep a NEW drawing (its own blobs → independent of any fridge note). Returns the
  // new row id so the caller can offer an undoable "kept" toast (delete it back).
  return async (png: Blob, scene = ''): Promise<string> => {
    const { id } = await api<{ id: string }>('drawings', { method: 'POST', body: await uploadDrawing(png, scene) })
    qc.invalidateQueries({ queryKey: GALLERY_KEY })
    return id
  }
}

export function useUpdateInGallery() {
  const qc = useQueryClient()
  // Continue an existing drawing IN PLACE (replaces its blobs; the server frees the
  // old ones). Used when re-opening a gallery item rather than the ＋ new flow.
  return async (id: string, png: Blob, scene = '') => {
    await api('drawings', { method: 'PATCH', body: { id, ...(await uploadDrawing(png, scene)) } })
    qc.invalidateQueries({ queryKey: GALLERY_KEY })
  }
}

export function useDeleteFromGallery() {
  const write = useWrite()
  // Delete is just `{ id }` (no R2 upload), so route it through the offline outbox:
  // optimistically drop the row from the gallery cache (instant + survives offline),
  // queue the write when offline, and reconcile GALLERY_KEY on the next poll/replay.
  return async (id: string) => {
    await write('drawings', {
      method: 'DELETE',
      body: { id },
      affectedKeys: [GALLERY_KEY],
      optimistic: (qc) =>
        qc.setQueryData<{ drawings: GalleryDrawing[] }>(GALLERY_KEY, (d) =>
          d ? { drawings: d.drawings.filter((g) => g.id !== id) } : d,
        ),
    }).catch(() => {})
  }
}

// Fetch a drawing's bytes back from its served R2 URLs, so it can be COPIED into an
// independent drawing elsewhere. This is the basis of "never lose a drawing": every
// conversion (gallery ↔ fridge note, → routine card) makes its OWN blobs, so
// deleting one copy never frees another's. Scene is optional (re-editable layers).
async function fetchDrawingBlobs(media_key: string, scene_key?: string | null): Promise<{ png: Blob; scene: string }> {
  const png = await fetch(imgUrl(media_key)).then((r) => r.blob())
  let scene = ''
  if (scene_key) {
    try {
      scene = await fetch(imgUrl(scene_key)).then((r) => r.text())
    } catch {
      /* scene optional — the PNG stands on its own */
    }
  }
  return { png, scene }
}

// Pin an existing drawing (by its keys) onto the fridge board as a NEW note — a
// fresh INDEPENDENT copy, so later clearing the note never frees the source blobs.
export function usePinToFridge() {
  const qc = useQueryClient()
  return async (media_key: string, scene_key?: string | null) => {
    const { png, scene } = await fetchDrawingBlobs(media_key, scene_key)
    const up = await uploadDrawing(png, scene)
    await api('notes', { method: 'POST', body: { media_kind: 'drawing', media_key: up.media_key, scene_key: up.scene_key, text: '' } })
    qc.invalidateQueries({ queryKey: BOARD_KEY })
  }
}

// Keep a drawing that lives elsewhere (a fridge note) into the gallery — again a
// fresh INDEPENDENT copy, so clearing the note never frees the kept drawing.
function useKeepKeysInGallery() {
  const save = useSaveToGallery()
  // Returns the new gallery row id (for an undoable "kept" toast).
  return async (media_key: string, scene_key?: string | null): Promise<string> => {
    const { png, scene } = await fetchDrawingBlobs(media_key, scene_key)
    return save(png, scene)
  }
}

// Keeping a drawing into « Mes dessins » used to give no clear feedback (just a quiet
// badge swap). These wrap the keep in the calm, undoable toast so EVERY save-to-gallery
// across the app (board paint badge, in-pad "Garder", the ＋ memo sheet) reads the same.
// Best-effort: a failed keep (R2 unset / offline) resolves to null without throwing.
// `onUndo` is an extra side-effect to run if the keep is taken back (e.g. revert a badge).

// Keep a fresh drawing (png + scene) with a confirming, undoable toast.
export function useKeepInGalleryToast() {
  const save = useSaveToGallery()
  const remove = useDeleteFromGallery()
  const record = useRecordUndo()
  const t = useT()
  return async (png: Blob, scene = '', onUndo?: () => void): Promise<string | null> => {
    try {
      const id = await save(png, scene)
      record({ message: t.memo.savedToGallery, onUndo: () => { onUndo?.(); void remove(id).catch(() => {}) } })
      return id
    } catch {
      return null
    }
  }
}

// Keep an existing drawing (by its R2 keys → an independent copy) with the same toast.
export function useKeepKeysInGalleryToast() {
  const keep = useKeepKeysInGallery()
  const remove = useDeleteFromGallery()
  const record = useRecordUndo()
  const t = useT()
  return async (media_key: string, scene_key?: string | null, onUndo?: () => void): Promise<string | null> => {
    try {
      const id = await keep(media_key, scene_key)
      record({ message: t.memo.savedToGallery, onUndo: () => { onUndo?.(); void remove(id).catch(() => {}) } })
      return id
    } catch {
      return null
    }
  }
}
