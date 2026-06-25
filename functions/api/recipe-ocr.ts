import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { mistralOcr } from '../_lib/mistralOcr'
import { householdAiEnabled } from '../_lib/aiPref'

// Read a recipe photo with the OPTIONAL high-accuracy CLOUD OCR (Mistral). The client
// sends raw image bytes (resized, same as recipe-vision) and gets back the faithful
// TEXT, which it then structures through /api/recipe-import — identical to the
// on-device read, just a better reader. Distinct from recipe-vision (Workers AI,
// in-network): this leaves the device, so it's gated behind BOTH the MISTRAL_API_KEY
// being set AND the household AI switch. 503 when unavailable so the client falls
// back to the on-device Tesseract read. Any actor (a kiosk builds recipes too).
const MAX_BYTES = 6 * 1024 * 1024

export const onRequestPost = authed(async (ctx, actor) => {
  if (!ctx.env.MISTRAL_API_KEY || !(await householdAiEnabled(ctx.env, actor.householdId))) {
    return serviceUnavailable('Lecture haute précision indisponible.')
  }
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')
  const text = await mistralOcr(ctx.env, new Uint8Array(buf))
  return ok({ text })
})
