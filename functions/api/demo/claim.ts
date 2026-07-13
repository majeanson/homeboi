import { authed } from '../../_lib/route'
import { badRequest, conflict, forbidden, readJson, serverError, unauthorized } from '../../_lib/json'
import { issueSession, sessionCookies } from '../../_lib/auth'
import { hashPassword, safeEqual } from '../../_lib/password'
import { nowSec } from '../../_lib/ids'
import { DEMO_SANDBOX_DOMAIN, isSandboxEmail } from '../../_lib/demoHousehold'

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
// floor, same PBKDF2 hashPassword, same LOGIN_PASSWORD invite gate (claiming is a
// signup in disguise — it must not be a way around a gated deployment), same
// one-household-per-email conflict answer.
//
// The session cookie encodes the OLD email (issueSession), so after the UPDATE the
// current cookie would resolve to nothing and 401 the very next request. The
// response therefore re-issues session cookies for the new email — the visitor
// keeps their session, their household, and everything they tried.
export const onRequestPost = authed(async (ctx, actor) => {
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
  const required = ctx.env.LOGIN_PASSWORD
  if (required && !safeEqual(body?.invite ?? '', required)) {
    return forbidden('Code d’invitation invalide.')
  }

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
      ctx.env.DB.prepare('UPDATE operators SET email = ?, password_hash = ? WHERE email = ? AND household_id = ?').bind(
        email,
        await hashPassword(password),
        actor.email,
        actor.householdId,
      ),
    ]
    if (name) {
      statements.push(
        ctx.env.DB.prepare('UPDATE households SET name = ?, updated_at = ? WHERE id = ?').bind(
          name,
          ts,
          actor.householdId,
        ),
      )
    }
    const [opUpdate] = await ctx.env.DB.batch(statements)
    // No row moved ⇒ the sweep deleted the sandbox between resolve and claim
    // (the TTL kill switch) — the session is already structurally dead.
    if ((opUpdate.meta?.changes ?? 0) === 0) return unauthorized()
  } catch {
    return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')
  }

  // Re-issue the session for the NEW email so the current device stays signed in.
  try {
    const { session, csrf } = await issueSession(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}, 'operator')
