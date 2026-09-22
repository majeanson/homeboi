// The Functions runtime bindings. Optional bindings are marked optional and
// guarded at the handler entry (graceful-degrade) rather than assumed present.

export interface Env {
  // D1 — required. All household state.
  DB: D1Database

  // Workers AI — OPTIONAL. Capture intent-router + weekly recap. When unset
  // (or local dev without `wrangler login`), capture falls back to a manual
  // type-picker; the rest of the app works.
  AI?: Ai

  // R2 — OPTIONAL. Family photos (wall-board frame) + member avatar images.
  // When unset, the photo features hide (graceful-degrade). Images are resized
  // on upload and the home-photo count is capped, so this stays in R2's free
  // tier (10 GB, no egress).
  PHOTOS?: R2Bucket

  // HMAC key for the operator session cookie + device tokens. Required to sign
  // or verify anything; validated to be >= 32 chars at use (see auth.ts).
  SESSION_SECRET?: string

  // OPTIONAL personal-deployment login gate. When set, /api/auth/login requires
  // this exact password (constant-time checked). Unset = open login, fine for
  // local dev / a trusted LAN. There is no per-user password store — this is a
  // single shared secret for a household-owned deployment, not a SaaS.
  LOGIN_PASSWORD?: string

  // OPTIONAL outbound email (functions/_lib/mail.ts — Resend's REST API). Both unset
  // → no email is ever sent: « Mot de passe oublié » hides its door on /login
  // (health.mail) and /api/auth/forgot answers 503. Set both to switch it on:
  // `wrangler secret put RESEND_API_KEY` and a `MAIL_FROM` var like
  // « Babillard <babillard@marcportal.com> » on a domain verified in Resend.
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  // OPTIONAL: where the nightly cron's alert goes (functions/_lib/nightly.ts) — a
  // failed backup, a stale sandbox the sweep could not delete, and a Monday digest.
  // Needs mail wired too. Set in the dashboard / `wrangler secret put ALERT_EMAIL`,
  // never in the repo. Unset → log only, and /api/health says `alerts: false`.
  ALERT_EMAIL?: string
  // OPTIONAL: the address a STRANGER can write to — printed on /confidentialite and
  // /conditions and in Réglages ▸ Système (Wave 4). Deliberately NOT `ALERT_EMAIL`:
  // that one is where the machine complains to the operator at 3 a.m., this one is
  // where a person who has not signed up asks a question, and conflating them puts a
  // private address on a public page. Unset → the contact block hides and the policy
  // says the app is run privately, which is honest; **Québec's Law 25 wants a reachable
  // human before signup opens to the public (Wave 5), so setting this is a gate on
  // that, not on this.** A plain var, not a secret — it is meant to be read.
  CONTACT_EMAIL?: string

  // OPTIONAL deploy-callback secret for POST /api/remarks/shipped (_lib/deployHook.ts):
  // the shared secret GitHub Actions presents after a successful deploy of main, to mark
  // a remark « expédiée » with the commit that fixed it. ≥32 chars.
  //
  // UNLIKE LOGIN_PASSWORD, UNSET CLOSES THE DOOR (503). An unset gate on an
  // unauthenticated write is a hole, not a convenience — do not copy the login shape.
  //
  // `wrangler secret put DEPLOY_NOTIFY_SECRET`, and the SAME value as the repo's
  // DEPLOY_NOTIFY_SECRET Actions secret. Never in the repo. Unset on either side fails
  // closed: the Worker 503s, and the notify script skips with a ::warning::.
  // /api/health reports it as `deployHook`.
  DEPLOY_NOTIFY_SECRET?: string

  // OPTIONAL rate-limit bindings (wrangler.toml [[ratelimits]], _lib/rateLimit.ts):
  // the brute-force bound on login/signup/forgot/reset/demo/pairing/join and the
  // password doors. Unset → allow (dev, unit tests); health reports `rateLimit`.
  LIMIT_IP?: RateLimit
  LIMIT_KEY?: RateLimit

  // OPTIONAL NASA api.nasa.gov key for the board's "Photo du jour" daily-wonder
  // band — it powers all three sources the band rotates through (APOD, EPIC's
  // daily Earth photo, and the Mars rover). Unset falls back to DEMO_KEY (fine
  // behind the handler's 6 h edge cache); set via `.dev.vars` (local) /
  // `wrangler secret put NASA_APOD_KEY` (prod) to lift the rate limit. Each
  // source degrades to hidden if its feed is unreachable.
  NASA_APOD_KEY?: string

  // OPTIONAL Mistral API key for the high-accuracy CLOUD recipe-photo reader
  // (Mistral OCR, pay-as-you-go per page; free "Experiment" tier for testing). Unset
  // = the feature hides and photo reads use the on-device Tesseract OCR (free,
  // private) only. Set via `.dev.vars` (local) / `wrangler secret put MISTRAL_API_KEY`
  // (prod). Sending an image to Mistral leaves the device, so the endpoint also
  // respects the household AI switch. See functions/_lib/mistralOcr.ts.
  MISTRAL_API_KEY?: string

  // Plaintext vars from wrangler.toml.
  APP_NAME?: string
  DEFAULT_LANG?: string

  // OPTIONAL dev signal. Set to 'development' ONLY in .dev.vars (local); absent in
  // prod. `wrangler dev` presents the custom-domain host to the Worker even locally
  // (from the custom_domain route), so the hostname can't tell dev from prod — this
  // var is how worker/index.ts knows to skip the force-HTTPS redirect in local dev.
  ENVIRONMENT?: string
}

// Pages Functions context, narrowed to our Env. `data` carries values the
// middleware attaches (the resolved household id, if any).
export type Ctx = EventContext<Env, string, { householdId?: string }>
