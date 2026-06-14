import { badRequest, ok, serviceUnavailable, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { recipeFromImage, resolveLang } from '../_lib/ai'
import { refineSteps } from '../_lib/recipeImport'

// Read a recipe out of a PHOTO. The client sends raw image bytes (resized, same
// as recipe-image); the vision model OCRs + structures them into a DRAFT the
// cook reviews before saving — nothing is stored here. Operator-only (writing
// the recipe book is an adult action). AI unset → 503 so the UI says "fill it
// in by hand". This is the "read a photo" fast-fill, distinct from recipe-image
// which STORES the dish's display picture.
const MAX_BYTES = 6 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.AI) return serviceUnavailable('Lecture IA indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')

  const report = { error: null as string | null }
  const r = await recipeFromImage(ctx.env, new Uint8Array(buf), resolveLang(ctx.env, ctx.request), report)
  // OCR'd steps go through the shared refinement: the model often returns the
  // page's numbering verbatim ("1. …") or one packed paragraph. Servings + times
  // ride along now — the printed card usually states them and the form has fields.
  return withAiError(
    ok({
      title: r.title,
      ingredients: r.ingredients,
      steps: refineSteps(r.steps),
      servings: r.servings,
      servingsUnit: r.servingsUnit,
      times: r.times,
    }),
    report,
  )
}, 'operator')
