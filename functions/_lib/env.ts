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

  // OPTIONAL NASA api.nasa.gov key for the board's "Photo du jour" daily-wonder
  // band — it powers all three sources the band rotates through (APOD, EPIC's
  // daily Earth photo, and the Mars rover). Unset falls back to DEMO_KEY (fine
  // behind the handler's 6 h edge cache); set via `.dev.vars` (local) /
  // `wrangler secret put NASA_APOD_KEY` (prod) to lift the rate limit. Each
  // source degrades to hidden if its feed is unreachable.
  NASA_APOD_KEY?: string

  // Plaintext vars from wrangler.toml.
  APP_NAME?: string
  DEFAULT_LANG?: string
}

// Pages Functions context, narrowed to our Env. `data` carries values the
// middleware attaches (the resolved household id, if any).
export type Ctx = EventContext<Env, string, { householdId?: string }>
