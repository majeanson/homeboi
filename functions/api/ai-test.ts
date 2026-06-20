import { ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { pingTextModel, pingVisionModel } from '../_lib/ai'
import { householdAiEnabled } from '../_lib/aiPref'

// Operator-only LIVE AI check for Réglages ("does the AI actually work right
// now?"). Unlike /api/health (which only reports whether the AI binding is
// wired), this runs a tiny real inference against BOTH models the app uses — so
// a retired text model or the gated-vision license block (err 5016) shows up as
// a concrete pass/fail with the error message, the same breakages that otherwise
// only surface in the AI error log after a feature has already failed for a user.
// Any actor: a parent-mode kiosk may run it too (it already burns inferences via
// the capture spine) — only member admin + device pairing stay operator-only.
export const onRequestPost = authed(async (ctx, actor) => {
  if (!ctx.env.AI) return serviceUnavailable('AI binding not configured on this deployment.')
  // The household's own off switch (Réglages ▸ IA) wins over the binding: never burn
  // a real inference when AI has been disabled, even from this diagnostic.
  if (!(await householdAiEnabled(ctx.env, actor.householdId)))
    return serviceUnavailable('AI is switched off for this household (Réglages ▸ IA).')
  // Both pings in parallel — each already swallows its own failure into a result.
  const [text, vision] = await Promise.all([pingTextModel(ctx.env), pingVisionModel(ctx.env)])
  return ok({ checks: [text, vision] })
})
