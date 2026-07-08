import type { Env } from '../_lib/env'
import { ok, serverError } from '../_lib/json'
import { issueGuestToken } from '../_lib/auth'
import { hashPassword } from '../_lib/password'
import { newId, nowSec } from '../_lib/ids'
import { clearSampleData, countSampleData, seedSampleData } from '../_lib/sampleData'

// « Essaie sans peur » (bmad/08 A-8) — the public demo. One PUBLIC endpoint the
// marketing page calls: it lazily creates a singleton DEMO household (owned by a
// sentinel operator no one can log into), keeps it seeded with the same Québécois
// demo family every new signup gets, and mints a short-lived READ-ONLY 'showcase'
// guest token into it. The visitor lands on the full hub, watermarked by the
// existing guest banner (« Démo — lecture seule »), and can poke every surface
// with zero fear and zero setup — the same door the babysitter link uses, so no
// new access mode and no new privacy surface.
//
// Deliberately unauthenticated (like auth/signup — add to CSRF_EXEMPT): a
// first-time visitor has no cookie yet. Blast radius is bounded to the one demo
// household: the token is read-only ('showcase' scope, enforced centrally in
// worker/index.ts via guestScope), time-boxed, and the household only ever holds
// fabricated is_sample rows.
//
// A WRITABLE public sandbox (visitors editing the demo) is deferred — it needs
// either throwaway operator sessions or a new writable guest scope; see the A-8
// notes in bmad/08.

// `.invalid` is reserved (RFC 2606): this can never collide with a real signup
// email, and the random password below is never stored anywhere readable — the
// demo household has no human way in besides the read-only token.
const DEMO_EMAIL = 'demo@babillard.invalid'
const DEMO_NAME = 'La maisonnée démo'
const DEMO_TTL = 4 * 3600 // one afternoon of poking
// The seed anchors meals/events to "today"; a demo older than this reads dead
// (last week's suppers), so clear + reseed before minting the next visit in.
const DEMO_MAX_AGE = 24 * 3600

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const now = nowSec()

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
