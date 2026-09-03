import { badRequest, ok, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { VISION_MODEL_ID, recipeFromImage, resolveLang } from '../_lib/ai'
import { refineSteps } from '../_lib/recipeImport'
import { detectLang } from '../_lib/langDetect'

// Read a recipe out of a PHOTO. The client sends raw image bytes (resized, same
// as recipe-image); the vision model OCRs + structures them into a DRAFT the
// cook reviews before saving — nothing is stored here. Any actor — a parent-mode
// kiosk builds recipes too (recipes CRUD was never operator-gated); only member
// admin + device pairing stay operator-only. `requiresAi` 503s when AI is off
// (binding unset OR household switched it off) so the UI says "fill it in by hand".
// This is the "read a photo" fast-fill, distinct from recipe-image which STORES the
// dish's display picture.
const MAX_BYTES = 6 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')

  const report = { error: null as string | null }
  const r = await recipeFromImage(ctx.env, new Uint8Array(buf), resolveLang(ctx.env, ctx.request), report)
  const steps = refineSteps(r.steps)
  // OCR'd steps go through the shared refinement: the model often returns the
  // page's numbering verbatim ("1. …") or one packed paragraph. Servings + times
  // ride along now — the printed card usually states them and the form has fields.
  return withAiError(
    ok({
      title: r.title,
      ingredients: r.ingredients,
      steps,
      servings: r.servings,
      servingsUnit: r.servingsUnit,
      times: r.times,
      // Read-aloud language guessed from the photo's own text ('fr'|'en'|null);
      // null leaves the form on "Auto" — exactly the "can't detect → leave" rule.
      lang: detectLang([r.title, ...r.ingredients, ...steps].join('\n')),
      // Which model read the photo — the verify panel's read report names it.
      model: VISION_MODEL_ID,
    }),
    report,
  )
}, undefined, { requiresAi: true })
