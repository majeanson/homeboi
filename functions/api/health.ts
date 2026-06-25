import type { Env } from '../_lib/env'
import { ok } from '../_lib/json'
import { resolveActor } from '../_lib/household'
import { householdAiEnabled } from '../_lib/aiPref'

// Liveness + a peek at which optional bindings are wired, so the operator hub
// can show "voice available / degraded" honestly. `invite` tells the signup
// page whether to ask for the invite code (LOGIN_PASSWORD doubles as it) —
// only its existence is exposed, never the value.
//
// Two AI flags, the single source the SPA reads (see src/lib/ai.ts `useAi`):
//   - `aiAvailable` — the env.AI binding is wired on this deployment (a fact). The
//     Réglages ▸ IA toggle can only enable AI when this is true.
//   - `ai` — the EFFECTIVE state: the binding is wired AND the household hasn't
//     switched AI off. The whole UI hides every AI affordance when this is false,
//     and it's what each AI endpoint enforces server-side. This is resolved
//     per-household, so it needs the actor; an anonymous caller (signup page) just
//     sees the binding presence, which is all it uses.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const aiAvailable = !!ctx.env.AI
  // resolveActor is non-throwing (returns null when there are no creds), so health
  // stays open to the unauthenticated signup page while still being household-aware
  // for a signed-in operator / paired kiosk.
  const actor = aiAvailable ? await resolveActor(ctx.env, ctx.request).catch(() => null) : null
  const ai = aiAvailable && (actor ? await householdAiEnabled(ctx.env, actor.householdId) : true)
  return ok({
    ok: true,
    app: ctx.env.APP_NAME ?? 'Babillard',
    ai,
    aiAvailable,
    // The high-accuracy cloud recipe reader (Mistral OCR) is wired on this deployment
    // (MISTRAL_API_KEY set). Just a presence fact, like aiAvailable — the SPA shows
    // the "lecture haute précision" toggle only when true.
    cloudOcr: !!ctx.env.MISTRAL_API_KEY,
    invite: !!ctx.env.LOGIN_PASSWORD,
    sessionSecret: !!ctx.env.SESSION_SECRET && ctx.env.SESSION_SECRET.length >= 32,
  })
}
