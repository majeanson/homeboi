// The Functions runtime bindings. Optional bindings are marked optional and
// guarded at the handler entry (graceful-degrade) rather than assumed present.

export interface Env {
  // D1 — required. All household state.
  DB: D1Database

  // Workers AI — OPTIONAL. Capture intent-router + weekly recap. When unset
  // (or local dev without `wrangler login`), capture falls back to a manual
  // type-picker; the rest of the app works.
  AI?: Ai

  // HMAC key for the operator session cookie + device tokens. Required to sign
  // or verify anything; validated to be >= 32 chars at use (see auth.ts).
  SESSION_SECRET?: string

  // Plaintext vars from wrangler.toml.
  APP_NAME?: string
  DEFAULT_LANG?: string
}

// Pages Functions context, narrowed to our Env. `data` carries values the
// middleware attaches (the resolved household id, if any).
export type Ctx = EventContext<Env, string, { householdId?: string }>
