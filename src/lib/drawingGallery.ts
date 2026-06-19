import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

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

export const GALLERY_KEY = ['drawings']

export function useGallery() {
  return useQuery({ queryKey: GALLERY_KEY, queryFn: () => api<{ drawings: GalleryDrawing[] }>('drawings') })
}

// Upload the PNG + (optional) scene to fresh R2 keys — both save paths need this.
async function uploadDrawing(png: Blob, scene: string): Promise<{ media_key: string; scene_key?: string }> {
  const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: png })
  let scene_key: string | undefined
  if (scene) {
    try {
      const r = await api<{ key: string }>('note-media', { method: 'POST', body: new Blob([scene], { type: 'application/json' }) })
      scene_key = r.key
    } catch {
      /* scene optional — the PNG stands on its own */
    }
  }
  return { media_key: key, scene_key }
}

export function useSaveToGallery() {
  const qc = useQueryClient()
  // Keep a NEW drawing (its own blobs → independent of any fridge note).
  return async (png: Blob, scene = '') => {
    await api('drawings', { method: 'POST', body: await uploadDrawing(png, scene) })
    qc.invalidateQueries({ queryKey: GALLERY_KEY })
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
  const qc = useQueryClient()
  return async (id: string) => {
    await api('drawings', { method: 'DELETE', body: { id } })
    qc.invalidateQueries({ queryKey: GALLERY_KEY })
  }
}
