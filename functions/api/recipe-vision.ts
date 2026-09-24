import { badRequest, ok, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { VISION_MODEL_ID, resolveLang, transcribeImage } from '../_lib/ai'
import { draft, draftFromText } from '../_lib/recipeDraft'

// Read a recipe out of a PHOTO. The client sends raw image bytes (resized, same as
// recipe-image); nothing is stored here. Any actor — a parent-mode kiosk builds
// recipes too (recipes CRUD was never operator-gated); only member admin + device
// pairing stay operator-only. `requiresAi` 503s when AI is off (binding unset OR
// household switched it off) so the UI says "fill it in by hand". This is the
// "read a photo" fast-fill, distinct from recipe-image which STORES the dish's
// display picture.
//
// TWO PASSES, on purpose (2026-09-24). The vision model only TRANSCRIBES the photo,
// as plain text; the transcript is then structured by the SAME path a pasted recipe
// takes (_lib/recipeDraft). Asked to read and structure in one generative pass it
// put a paragraph card's method in the ingredients and the footer in the steps,
// invented prep/cook times from the durations in the method, and when max_tokens
// cut its JSON the prose fallback read raw JSON lines — quotes and all. The same
// card as TEXT came out perfect. A transcription cannot be truncated into
// nonsense, and the text path already cross-checks every number against it.
const MAX_BYTES = 6 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')

  const report = { error: null as string | null }
  const lang = resolveLang(ctx.env, ctx.request)
  const transcript = await transcribeImage(ctx.env, new Uint8Array(buf), lang, report)
  // Which model read the photo — the verify panel's read report names it, beside
  // the structuring the draft carries (`structuring` / `model`).
  const reader = { reader: 'vision' as const, readerModel: VISION_MODEL_ID }
  if (!transcript) return withAiError(ok({ ...draft({ empty: true }), ...reader }), report)
  // `requiresAi` guaranteed AI is usable for this household — the text model may run.
  const d = await draftFromText(ctx.env, transcript, lang, true)
  return withAiError(ok({ ...d, ...reader }), report)
}, undefined, { requiresAi: true })
