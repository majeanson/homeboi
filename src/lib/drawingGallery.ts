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

export function useSaveToGallery() {
  const qc = useQueryClient()
  return async (png: Blob, scene = '') => {
    // Upload its own blobs (independent lifecycle from any fridge note).
    const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: png })
    let sceneKey: string | undefined
    if (scene) {
      try {
        const r = await api<{ key: string }>('note-media', { method: 'POST', body: new Blob([scene], { type: 'application/json' }) })
        sceneKey = r.key
      } catch {
        /* scene optional — the PNG stands on its own */
      }
    }
    await api('drawings', { method: 'POST', body: { media_key: key, scene_key: sceneKey } })
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
