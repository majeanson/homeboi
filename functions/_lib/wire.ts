// WIRE TYPES — the shape a GET handler answers with, named ONCE so the e2e fixture in
// e2e/mocks.ts is typed against it and `tsc -b` (which covers e2e/) fails the day the
// two drift apart.
//
// Why this file exists (2026-11-05, wave 0.4 of plans/2026-11-05-SOLIDIFY.md): the
// `health` fixture carried four keys — {ai, aiAvailable, rateLimit, alerts} — while the
// handler had grown to fifteen. Nothing noticed, because `ROUTES` is a
// `Record<string, unknown>` and an unknown GET answers `{}` 200. The effect in every
// browser test: `photos`, `realtime` and `cloudOcr` were always falsy, so the R2 and
// realtime rows of the health card showed « off » and no spec could ever exercise a
// photo door. A fixture that lies about the wire is worse than none: it passes.
//
// Pure types, no imports, so e2e/ (compiled with DOM + node, not workers-types) can
// import it. One interface per handler, added as each fixture is typed; the handler
// builds a `const wire: XWire = {…}` and returns `ok(wire)`, so a key added on one side
// is a compile error on the other.

export interface HealthWire {
  ok: boolean
  app: string
  /** Workers AI is bound AND the household has not switched it off. */
  ai: boolean
  /** Workers AI is bound at all (the operator's « IA » toggle only matters when true). */
  aiAvailable: boolean
  /** MISTRAL_API_KEY is set — the cloud OCR reader for recipe photos. */
  cloudOcr: boolean
  /** BROWSER is bound — the headless browser for recipe URL import. */
  browserRun: boolean
  /** Signup needs an invite code. */
  invite: boolean
  /** SESSION_SECRET is set and ≥ 32 chars (validated at use, never weakened). */
  sessionSecret: boolean
  /** R2 (PHOTOS) is bound — photo / voice-clip / drawing features show. */
  photos: boolean
  /** RESEND_API_KEY + MAIL_FROM are set — password reset and the nightly alert can send. */
  mail: boolean
  rateLimit: boolean
  /** ALERT_EMAIL is set — the nightly cron can reach a human. */
  alerts: boolean
  /** DEPLOY_NOTIFY_SECRET is set — CI can close the « Regle-remarque » loop. */
  deployHook: boolean
  /** The RealtimeHub Durable Object is bound — /api/live upgrades; else clients poll. */
  realtime: boolean
  /** CONTACT_EMAIL, the Law 25 contact door, or null. */
  contact: string | null
}
