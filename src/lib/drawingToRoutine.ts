import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { resizeImage, PHOTO_MAX } from './image'
import type { DeckCard } from './routineTemplates'

// Turn a drawing (a PNG Blob from DrawPad) into the seed of a NEW kid-routine
// card (#14 → #17 C). We can't reuse the note's `nm_` R2 key directly: clearing
// the fridge note frees that blob (notes.ts DELETE), which would blank the
// routine card. So we re-upload the bytes to an independent `rcp_` key via
// /api/routine-card-photo (resized like every card photo, keeping R2 lean), then
// open the routine builder pre-seeded with one card carrying that photo. The
// builder still asks WHO it's for + a name — a routine needs a child + a title.
export interface RoutineSeed {
  cards: DeckCard[]
  cardsPhoto: string[]
  // Optional pre-fill for the routine's name (create mode only). A drawing leaves
  // it blank; a recipe→routine seed (#19, lib/recipeToRoutine) prefills the recipe
  // title so the parent doesn't retype it.
  name?: string
}

export function useDrawingToRoutine() {
  const nav = useNavigate()
  return async (png: Blob) => {
    try {
      const file = new File([png], 'dessin.png', { type: 'image/png' })
      const small = await resizeImage(file, PHOTO_MAX)
      const { key } = await api<{ key: string }>('routine-card-photo', { method: 'POST', body: small })
      const seed: RoutineSeed = { cards: [{ icon: '🎨', label: '' }], cardsPhoto: [key] }
      nav('/routine/new', { state: { routineSeed: seed } })
    } catch {
      // R2 unset / offline (503) — the photo can't be stored, so don't navigate to
      // a builder with a broken card. Silent: the drawing is still safe to pin/share.
    }
  }
}
