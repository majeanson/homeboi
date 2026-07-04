import { api } from './api'
import { imgUrl } from './image'
import { uploadMedia } from './uploadMedia'
import type { RecipeSharePayload } from './share'

// Copy a shared snapshot into the SIGNED-IN visitor's own account (the « Ajouter à mon
// livre » path on the public /partage page). Media in a share points at share-owned R2
// keys the importer doesn't own, so we re-fetch each blob through the public /api/img
// route and re-upload it under the importer's account, then POST the entity. Direct
// api()/uploadMedia (not useWrite) is correct here: a multi-step, online-only import that
// can't ride the offline outbox (a blob can't be queued), mirroring FamilyImportPage.

const HTTPS = /^https?:\/\//i

// Re-host one share-owned image under our own account. Best-effort: a failed copy
// degrades to no image rather than blocking the whole import (optional-R2 contract).
async function copySharedImage(endpoint: string, key: string): Promise<string> {
  try {
    const res = await fetch(imgUrl(key))
    if (!res.ok) return ''
    const blob = await res.blob()
    return await uploadMedia(endpoint, blob, { resize: false })
  } catch {
    return ''
  }
}

// Add a shared recipe to my book. Returns the new recipe id (→ navigate to it).
export async function importRecipeShare(p: RecipeSharePayload): Promise<string> {
  // A remote https image passes through untouched; a share-owned key is re-hosted.
  let image: string | null = p.image
  if (image && !HTTPS.test(image)) image = (await copySharedImage('recipe-image', image)) || null
  const stepImages = await Promise.all(
    p.stepImages.map((k) => (k ? copySharedImage('recipe-step-image', k) : Promise.resolve(''))),
  )
  const { id } = await api<{ id: string }>('recipes', {
    method: 'POST',
    body: {
      title: p.title,
      ingredients: p.ingredients,
      steps: p.steps,
      servings: p.servings,
      servingsUnit: p.servingsUnit,
      prepMin: p.prepMin,
      cookMin: p.cookMin,
      totalMin: p.totalMin,
      notes: p.notes,
      source: p.source,
      image,
      tags: p.tags,
      stepImages,
      lang: p.lang,
    },
  })
  return id
}
