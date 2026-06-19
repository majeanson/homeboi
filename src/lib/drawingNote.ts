import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import { BOARD_KEY } from './queryKeys'

// Pin a NEW drawing as a fridge note (#14): upload the PNG to R2 (note-media) then
// file a drawing note. Media uploads can't be queued offline (the blob must land),
// so this uses api() directly like MemoControls; the board poll/realtime reconciles
// the card. Used where there's no capture sheet to lean on — e.g. the toddler board's
// own "Dessiner" tile, so a kid can start a drawing without a parent's ＋ sheet.
export function useSaveDrawingNote() {
  const qc = useQueryClient()
  return async (png: Blob, scene = '') => {
    try {
      const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: png })
      let sceneKey: string | undefined
      if (scene) {
        try {
          const r = await api<{ key: string }>('note-media', { method: 'POST', body: new Blob([scene], { type: 'application/json' }) })
          sceneKey = r.key
        } catch {
          /* scene optional — keep the PNG even if the scene upload fails */
        }
      }
      await api('notes', { method: 'POST', body: { media_kind: 'drawing', media_key: key, scene_key: sceneKey, text: '' } })
    } catch (e) {
      if (!(e instanceof ApiError)) throw e // server said no → let the refetch correct it
    } finally {
      qc.invalidateQueries({ queryKey: BOARD_KEY })
    }
  }
}
