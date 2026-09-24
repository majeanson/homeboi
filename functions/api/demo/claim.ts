import { authed } from '../../_lib/route'
import { badRequest, conflict, forbidden, readJson, serverError, tooManyRequests, unauthorized } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { signInAs, sessionCookies } from '../../_lib/auth'
import { hashPassword } from '../../_lib/password'
import { inviteAccepted } from '../../_lib/signupGate'
import { nowSec } from '../../_lib/ids'
import { DEMO_SANDBOX_DOMAIN, isSandboxEmail } from '../../_lib/demoHousehold'
import { mailEnabled } from '../../_lib/mail'
import { sendVerification } from '../../_lib/verify'

// « Garder ma maisonnée » — convert a demo SANDBOX into a real account (the claim
// flow demo.ts always deferred). The visitor already IS an ordinary operator of a
// real household; all that makes it a throwaway is the `demo-<id>@babillard.invalid`
// email the sweep keys on. So claiming is one UPDATE: rewrite the operators row's
// email + password_hash IN PLACE. The household id never changes — every row the
// visitor created (meals, mots, routines…) survives untouched, and once the email
// no longer matches the sandbox LIKE pattern the sweep can never delete it (and it
// stops counting against DEMO_SANDBOX_CAP, freeing a demo slot).
//
// Validation mirrors auth/signup exactly: same email regex, same 8-char password
// floor, same PBKDF2 hashPassword, same invite gate, _lib/signupGate.ts (claiming is a
// signup in disguise — it must not be a way around a gated deployment), same
// one-household-per-email conflict answer — and the same `verified_at` judgement +
// verification letter (0138). The sandbox operator is born with verified_at NULL, and
// until 2026-09-23 the claim never touched it: every claimed account stayed unverified
// forever, locked out of the two doors 0138 gates (worker/claim.d1.test.ts).
//
// The session cookie encodes the OLD email (signInAs), so after the UPDATE the
// current cookie would resolve to nothing and 401 the very next request. The
// response therefore re-issues session cookies for the new email — the visitor
// keeps their session, their household, and everything they tried.
export const onRequestPost = authed(async (ctx, actor) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  // Only a sandbox operator may claim — a real account has nothing to convert.
  if (!actor.email || !isSandboxEmail(actor.email)) {
    return forbidden('Cette action est réservée à une maisonnée d’essai.')
  }

  const body = await readJson<{ email?: string; password?: string; householdName?: string; invite?: string }>(
    ctx.request,
  )
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Courriel invalide.')
  // A claimed address must leave the sandbox namespace, or the sweep would still
  // (or the legacy singleton logic could) treat the household as disposable.
  if (email.endsWith(DEMO_SANDBOX_DOMAIN)) return badRequest('Courriel invalide.')
  const password = body?.password ?? ''
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')

  // Same gate posture as signup: when the deployment is invite-gated, claiming
  // a permanent account needs the code too (the demo mint itself stays open).
  if (!inviteAccepted(ctx.env, body?.invite)) return forbidden('Code d’invitation invalide.')

  const existing = await ctx.env.DB.prepare('SELECT email FROM operators WHERE email = ?').bind(email).first()
  if (existing) return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')

  const ts = nowSec()
  // Optional rename — the sandbox is born « La maisonnée démo », and making it
  // yours usually means naming it. Same trim/cap as signup; absent = keep.
  const name = body?.householdName?.trim().slice(0, 60)
  try {
    const statements = [
      // operators.email is the PRIMARY KEY — updating it in place keeps the row
      // (and thus the household + all its content) while moving it outside the
      // sweep's LIKE pattern. A race with a same-email signup loses on the PK.
      ctx.env.DB.prepare(
        'UPDATE operators SET email = ?, password_hash = ?, verified_at = ? WHERE email = ? AND household_id = ?',
      ).bind(email, await hashPassword(password), mailEnabled(ctx.env) ? null : ts, actor.email, actor.householdId),
      // Stamped whether or not it is renamed: a claimed household must never read as
      // « untouched » to anything keying on updated_at.
      name
        ? ctx.env.DB.prepare('UPDATE households SET name = ?, updated_at = ? WHERE id = ?').bind(name, ts, actor.householdId)
        : ctx.env.DB.prepare('UPDATE households SET updated_at = ? WHERE id = ?').bind(ts, actor.householdId),
    ]
    const [opUpdate] = await ctx.env.DB.batch(statements)
    // No row moved ⇒ the sweep deleted the sandbox between resolve and claim
    // (the TTL kill switch) — the session is already structurally dead.
    if ((opUpdate.meta?.changes ?? 0) === 0) return unauthorized()
  } catch {
    return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')
  }

  // Best-effort, exactly as signup: a lost letter is recoverable from Réglages, a claim
  // that 500s because mail hiccuped is not.
  try {
    await sendVerification(ctx.env, email, new URL(ctx.request.url).origin)
  } catch (err) {
    console.error('[mail] verify claim', err)
  }

  // Re-issue the session for the NEW email so the current device stays signed in.
  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}, 'operator')
