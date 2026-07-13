import type { Env } from '../_lib/env'
import { ok, serverError } from '../_lib/json'
import { issueGuestToken, issueSession, sessionCookies } from '../_lib/auth'
import { hashPassword } from '../_lib/password'
import { newId, nowSec } from '../_lib/ids'
import { clearSampleData, countSampleData, seedSampleData } from '../_lib/sampleData'
import {
  DEMO_SANDBOX_CAP,
  DEMO_SANDBOX_TTL,
  countDemoSandboxes,
  sandboxEmail,
  sweepExpiredDemoSandboxes,
} from '../_lib/demoHousehold'

// « Essaie pour vrai » (bmad/08 A-8, interactive stage) — the public demo. One
// PUBLIC endpoint the marketing page calls. It now mints a per-visitor SANDBOX:
// a throwaway seeded household with a real operator session, so the visitor can
// genuinely USE the app — add a supper, check a list, leave a mot — instead of
// window-shopping it. No new auth mode: the visitor IS an ordinary operator of
// a household nobody else can reach, whose email (`demo-<id>@babillard.invalid`,
// RFC 2606) can never collide with a signup and whose random password is never
// stored anywhere readable. Lifetime is DEMO_SANDBOX_TTL: every mint sweeps a
// couple of expired sandboxes (bounded, the todos sweepStale stance), and
// deleting the operators row kills the session structurally.
//
// The legacy READ-ONLY singleton (a 'showcase' guest token into one shared,
// always-reseeded household) remains as the FALLBACK when the sandbox cap is
// hit — free-tier polling budget — so the demo door never closes, it just
// narrows. The response shape tells the SPA which door opened:
//   { sandbox: true, expiresAt }            → session cookies set, go to /board
//   { guestToken, expiresAt }               → legacy /board?guest=<token>
//
// Deliberately unauthenticated (in CSRF_EXEMPT, like auth/signup): a first-time
// visitor has no cookie yet. Blast radius stays bounded per visitor: their own
// fabricated household, swept within a day.
//
// Known accepted costs, deliberately NOT gated here: a sandbox operator can call
// the AI endpoints (capture/suggest/vide-frigo) and upload R2 media — both
// bounded by the TTL + cap, and the sweep frees the blobs it can find
// (demoHousehold.ts MEDIA_* inventory). A « garde ma maisonnée » claim flow
// (convert a sandbox into a real account) is the natural next step — deferred.

const DEMO_EMAIL = 'demo@babillard.invalid' // the legacy read-only singleton
const DEMO_NAME = 'La maisonnée démo'
const DEMO_TTL = 4 * 3600 // read-only fallback: one afternoon of poking
// The seed anchors meals/events to "today"; a singleton older than this reads
// dead (last week's suppers), so clear + reseed before minting the next visit in.
const DEMO_MAX_AGE = 24 * 3600

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const now = nowSec()

  // Amortized cleanup first — expired sandboxes die on the next visitor's mint.
  try {
    await sweepExpiredDemoSandboxes(ctx.env, now)
  } catch {
    /* best-effort; never blocks the mint */
  }

  // Cap check: past the ceiling, fall back to the shared read-only singleton.
  let alive = DEMO_SANDBOX_CAP
  try {
    alive = await countDemoSandboxes(ctx.env)
  } catch {
    /* count failed → be conservative, use the fallback */
  }
  if (alive >= DEMO_SANDBOX_CAP) return mintShowcaseFallback(ctx, now)

  // ---- The sandbox: household + throwaway operator + seed + session ---------
  const householdId = newId()
  const email = sandboxEmail(householdId)
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        'INSERT INTO households (id, name, tier, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(householdId, DEMO_NAME, 'free', 'active', now, now),
      ctx.env.DB.prepare(
        'INSERT INTO operators (email, household_id, created_at, password_hash) VALUES (?, ?, ?, ?)',
      ).bind(email, householdId, now, await hashPassword(newId() + newId())),
    ])
  } catch {
    return serverError('Démo indisponible pour le moment.')
  }
  // Same seed a real signup gets — the board must read alive on first paint.
  // Best-effort like signup: an empty sandbox is still a working sandbox.
  try {
    await seedSampleData(ctx.env, householdId, now)
  } catch {
    /* non-fatal */
  }

  try {
    const { session, csrf } = await issueSession(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ sandbox: true, expiresAt: now + DEMO_SANDBOX_TTL }), {
      status: 200,
      headers,
    })
  } catch {
    return serverError('Démo indisponible pour le moment.')
  }
}

// ---- Legacy read-only fallback (the pre-sandbox behaviour, unchanged) --------
async function mintShowcaseFallback(ctx: EventContext<Env, string, unknown>, now: number): Promise<Response> {
  // Find-or-create the singleton demo household (operators.email is the PK, so a
  // race between two first visitors resolves to one row — the loser re-reads).
  let row = await ctx.env.DB.prepare('SELECT household_id FROM operators WHERE email = ?')
    .bind(DEMO_EMAIL)
    .first<{ household_id: string }>()
  if (!row) {
    const householdId = newId()
    try {
      await ctx.env.DB.batch([
        ctx.env.DB.prepare(
          'INSERT INTO households (id, name, tier, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(householdId, DEMO_NAME, 'free', 'active', now, now),
        ctx.env.DB.prepare(
          'INSERT INTO operators (email, household_id, created_at, password_hash) VALUES (?, ?, ?, ?)',
        ).bind(DEMO_EMAIL, householdId, now, await hashPassword(newId() + newId())),
      ])
      row = { household_id: householdId }
    } catch {
      row = await ctx.env.DB.prepare('SELECT household_id FROM operators WHERE email = ?')
        .bind(DEMO_EMAIL)
        .first<{ household_id: string }>()
      if (!row) return serverError('Démo indisponible pour le moment.')
    }
  }
  const householdId = row.household_id

  // Keep the demo alive: seed an empty one, refresh a stale one (the sample rows'
  // newest created_at doubles as "when was it seeded"). Two concurrent refreshes
  // can in theory double-seed between clear and seed; the window is tiny, the rows
  // are fabricated, and the next staleness pass clears it — not worth a lock.
  if ((await countSampleData(ctx.env, householdId)) === 0) {
    await seedSampleData(ctx.env, householdId, now)
  } else {
    const newest = await ctx.env.DB.prepare(
      'SELECT MAX(created_at) AS ts FROM members WHERE household_id = ? AND is_sample = 1',
    )
      .bind(householdId)
      .first<{ ts: number | null }>()
    if (newest?.ts != null && now - newest.ts > DEMO_MAX_AGE) {
      await clearSampleData(ctx.env, householdId)
      await seedSampleData(ctx.env, householdId, now)
    }
  }

  // Mint the read-only showcase token (requires SESSION_SECRET, like every token).
  const guestId = newId()
  let guestToken: string
  try {
    guestToken = await issueGuestToken(ctx.env, guestId, householdId, DEMO_TTL, 'showcase')
  } catch {
    return serverError('Démo indisponible pour le moment.')
  }
  // Bookkeeping row so the link is listable/revocable like any minted share link.
  // Best-effort — the token stands on its own (same stance as guest/start).
  try {
    await ctx.env.DB.prepare(
      'INSERT INTO guests (id, household_id, kind, target_key, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(guestId, householdId, 'showcase', null, now, now + DEMO_TTL)
      .run()
  } catch {
    /* bookkeeping only */
  }

  return ok({ guestToken, expiresAt: now + DEMO_TTL })
}
