import { mailEnabled } from '../_lib/mail'
import { rateLimitEnabled } from '../_lib/rateLimit'
import { alertsEnabled } from '../_lib/nightly'
import { deployHookEnabled } from '../_lib/deployHook'
import type { Env } from '../_lib/env'
import { ok } from '../_lib/json'
import { resolveActor } from '../_lib/household'
import { householdAiEnabled } from '../_lib/aiPref'
import { inviteRequired } from '../_lib/signupGate'

// Liveness + a peek at which optional bindings are wired, so the operator hub
// can show "voice available / degraded" honestly. `invite` tells the signup
// page whether to ask for the invite code (_lib/signupGate.ts decides) —
// only whether one is asked is exposed, never the value.
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
    invite: inviteRequired(ctx.env),
    sessionSecret: !!ctx.env.SESSION_SECRET && ctx.env.SESSION_SECRET.length >= 32,
    // Presence facts for the two bindings the SPA otherwise only discovers by
    // failing (R2 upload → 503, realtime WS → connect error). The Réglages
    // diagnostics health card reads these to explain degraded features BEFORE
    // anyone hits the failure path. REALTIME_HUB is a Worker-only binding kept
    // off the Functions Env type on purpose (see _lib/realtime.ts) — feature-
    // detected structurally here for the same reason.
    photos: !!ctx.env.PHOTOS,
    // « Mot de passe oublié » shows its door on /login only when this is true.
    mail: mailEnabled(ctx.env),
    // Both rate-limit bindings wired (_lib/rateLimit.ts). Unset means the login doors
    // are unbounded — visible on the health card rather than silent.
    rateLimit: rateLimitEnabled(ctx.env),
    // The nightly cron can reach a human (ALERT_EMAIL + mail wired, _lib/nightly.ts).
    alerts: alertsEnabled(ctx.env),
    // The deploy callback that closes the « Les remarques » loop. Unset means
    // « expédiée » silently never appears — the same "an unset binding must not be
    // invisible" argument rateLimit and alerts make, and this one fails CLOSED.
    deployHook: deployHookEnabled(ctx.env),
    realtime: !!(ctx.env as { REALTIME_HUB?: unknown }).REALTIME_HUB,
    // …and the one VALUE on this endpoint, not a presence flag (Wave 4). The legal
    // pages must render for someone who has never signed in — no session, no household,
    // nothing else to ask — and a contact door whose address lives in the bundle cannot
    // be changed without a deploy. It is a public address by definition; `ALERT_EMAIL`
    // stays a secret and never appears here.
    contact: ctx.env.CONTACT_EMAIL ?? null,
  })
}
