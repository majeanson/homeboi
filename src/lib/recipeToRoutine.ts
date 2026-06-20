import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { resizeImage, PHOTO_MAX, imgUrl } from './image'
import { isSectionHeading } from './recipeSections'
import type { Recipe } from './recipes'
import type { RoutineSeed } from './drawingToRoutine'

// Copy ONE recipe step photo (an `rsi_` key the recipe owns) to a fresh,
// independent `rcp_` routine-card key. We must NOT reuse the recipe's key:
// editing or deleting the recipe frees that blob (recipes.ts), which would blank
// the routine card — the same reason lib/drawingToRoutine re-uploads instead of
// sharing the note's `nm_` key. Returns '' on any failure (R2 unset → /api/img
// 404s, or offline) so that card simply falls back to its emoji.
async function copyStepPhoto(srcKey: string): Promise<string> {
  try {
    const res = await fetch(imgUrl(srcKey))
    if (!res.ok) return ''
    const blob = await res.blob()
    const file = new File([blob], 'etape.jpg', { type: blob.type || 'image/jpeg' })
    const small = await resizeImage(file, PHOTO_MAX)
    const { key } = await api<{ key: string }>('routine-card-photo', { method: 'POST', body: small })
    return key
  } catch {
    return ''
  }
}

// Turn a recipe into the seed of a NEW kid cooking routine (#19): each real
// cooking step (section `## ` headings skipped) becomes a picture card — the step
// text is the card label, its step photo (when any) copied to an independent card
// photo, so a toddler can "cook" the recipe as a read-aloud picture routine. The
// builder still asks WHO it's for. Reuses the same seed channel as
// lib/drawingToRoutine (router state → RoutineFormPage → RoutineForm), so no new
// route, store, or migration — the routine's existing cardsPhoto field carries it.
export function useRecipeToRoutine() {
  const nav = useNavigate()
  return async (recipe: Recipe) => {
    const steps = recipe.steps ?? []
    // Keep the original index so a step's photo (parallel to the full steps array,
    // heading slots included) stays aligned after we drop heading rows.
    const real = steps
      .map((step, i) => ({ step, i }))
      .filter(({ step }) => step.trim() && !isSectionHeading(step))
    const cards = real.map(({ step }) => ({ icon: '👩‍🍳', label: step.trim() }))
    // Copy each step's photo (if any) to a fresh, independent key — in parallel;
    // '' where the step has none. Empty keys leave the card on its emoji.
    const cardsPhoto = await Promise.all(
      real.map(({ i }) => {
        const src = recipe.stepImages?.[i]
        return src ? copyStepPhoto(src) : Promise.resolve('')
      }),
    )
    const seed: RoutineSeed = { name: `👩‍🍳 ${recipe.title}`, cards, cardsPhoto }
    nav('/routine/new', { state: { routineSeed: seed } })
  }
}
