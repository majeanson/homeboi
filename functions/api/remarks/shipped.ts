import type { Env } from '../../_lib/env'
import { badRequest, conflict, notFound, ok, serviceUnavailable, tooManyRequests, unauthorized } from '../../_lib/json'
import { clientIp, overLimit } from '../../_lib/rateLimit'
import { checkDeploySecret, DEPLOY_HEADER } from '../../_lib/deployHook'
import { newId, nowSec } from '../../_lib/ids'
import { broadcastInvalidate, keysForPath } from '../../_lib/realtime'

// POST /api/remarks/shipped — « Règle-remarque ». The DEPLOY PIPELINE's callback, and
// the one write in this app that no human and no Actor performs.
//
// The loop: someone files a remark through an ordinary useWrite() POST /api/remarks.
// Claude Code reads the open queue through the READ-ONLY MCP server (functions/api/mcp.ts
// — the agent never writes, and nothing here changes that). It commits the fix with a
// `Règle-remarque: <id>` trailer. GitHub Actions, AFTER a successful deploy of main,
// POSTs here with the commit sha and the « Explication: » paragraph, and the remark
// becomes 'shipped'. The household then taps « C'est réglé » (→ 'confirmed') or « Pas
// réglé » (→ back to 'open', with their own words).
//
// THAT LAST SENTENCE IS THE POINT. CI can only ever reach an intermediate state that one
// tap undoes. « Réglée » always means a human said so.
//
// ── WHY NOT authed() ──────────────────────────────────────────────────────────────
// authed() mandates an Actor, and everything downstream of it is keyed off
// actor.householdId: household scoping, the request's time zone (_lib/tz.ts), idempotency
// and the realtime broadcast. A deploy has no household — it addresses ONE ROW BY ID and
// reads the household off that row. Giving CI an Actor would mean minting a household
// credential for a pipeline, which is strictly more authority than this needs. Skipping
// the wrapper is safe: worker/index.ts has the error boundary, and this file does its own
// broadcast at the bottom because nothing else will.
//
// ── WHAT THIS ENDPOINT CANNOT DO ──────────────────────────────────────────────────
// No INSERT into `remarks`, no DELETE, no read path, no GET — and it can never write
// 'confirmed'. It UPDATEs one existing row open→shipped and INSERTs one journal event.
// That bound is load-bearing for the threat model in worker/index.ts's CSRF_EXEMPT
// comment: keep it true. The household is never a parameter; it is read off the row.
//
// Shape: an unauthenticated, CSRF-exempt, rate-limited, body-capped POST (the retired
// CSP report door's shape, 2026-09-16 → 09-25) with a real gate bolted on.

const MAX_BYTES = 8 * 1024
const EXPLANATION_MAX = 2000
const SHA_RE = /^[0-9a-f]{7,64}$/
// The id alphabet of _lib/ids.ts newId(), and nothing else — so a path traversal or a
// shell metacharacter arriving from a commit message is refused before it reaches D1.
const ID_RE = /^[A-Za-z0-9]{6,32}$/

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // 1. The flood bound FIRST — before the compare, before any read — so a rejected
  //    attempt costs nothing (login.ts's ordering). Address-keyed only: the id is ~70
  //    bits and sits BEHIND the secret, and a per-id bound would only hand a flooder a
  //    way to lock out the real CI.
  if (await overLimit(ctx.env, 'ip', clientIp(ctx.request))) return tooManyRequests()

  // 2. The gate. UNSET ⇒ CLOSED. See _lib/deployHook.ts for why the polarity is the
  //    inverse of INVITE_CODE's, and why '' counts as unset.
  const gate = checkDeploySecret(ctx.env.DEPLOY_NOTIFY_SECRET, ctx.request.headers.get(DEPLOY_HEADER))
  if (gate === 'unconfigured') {
    // 503, not 404 and not 401: this deployment has no hook wired, which is a fact about
    // US, not a verdict on the caller — the same answer /api/auth/forgot gives when mail
    // is unset. It also reads correctly in the Actions log: « the Worker has no secret »
    // rather than « your secret is wrong ».
    return serviceUnavailable('Deploy notifications are not configured.')
  }
  if (gate === 'denied') {
    // 401, not 403: the secret IS the identity here. In this codebase forbidden() means
    // an authenticated actor lacking a privilege.
    return unauthorized('Bad deploy secret.')
  }

  // 3. The body cap, in BYTES. Refuse rather than truncate the envelope: truncated JSON
  //    does not parse, and a 400 that says so is more useful in the Actions log than a
  //    parse error. The FIELD is truncated below; the ENVELOPE is refused.
  const declared = Number(ctx.request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BYTES) return badRequest('Body too large.')
  let raw: ArrayBuffer
  try {
    raw = await ctx.request.arrayBuffer()
  } catch {
    return badRequest('Unreadable body.')
  }
  if (raw.byteLength > MAX_BYTES) return badRequest('Body too large.')
  let body: { id?: unknown; sha?: unknown; explanation?: unknown } | null = null
  try {
    body = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return badRequest('Invalid JSON.')
  }

  // 4. Every field validated to a SHAPE before it touches the database. What arrives here
  //    was authored in a commit message, outside this app and outside review.
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!ID_RE.test(id)) return badRequest('Invalid remark id.')
  const sha = typeof body?.sha === 'string' ? body.sha.toLowerCase() : ''
  // Validated to hex BEFORE storage, so a link built from it later cannot be anything
  // but a commit reference.
  if (!SHA_RE.test(sha)) return badRequest('Invalid commit sha.')
  // The one free-text field. Truncated, never rejected: a long explanation is a fine
  // thing that we simply do not store all of. Rendered as TEXT by the UI — never as HTML.
  const explanation = (typeof body?.explanation === 'string' ? body.explanation : '').slice(0, EXPLANATION_MAX).trim()

  // 5. Find the row WITHOUT an actor: the opaque id is the locator, the secret was the
  //    authorization, and the household comes off the row — never off the request.
  const row = await ctx.env.DB.prepare(
    'SELECT id, household_id, status FROM remarks WHERE id = ?1 AND deleted_at IS NULL',
  )
    .bind(id)
    .first<{ id: string; household_id: string; status: string }>()

  // Unknown or deleted → 404, and honestly so: the trailer named something that is not
  // there, which is a typo worth seeing in the Actions log rather than a silent 204. A
  // soft-deleted remark reads as unknown on purpose — « supprimée » means the journal is
  // closed, and a deploy must not reopen it.
  if (!row) return notFound('No open remark with that id.')

  // Already CONFIRMED → 409, nothing written. A human has said it is fixed; letting a
  // machine drag it back to 'shipped' would overwrite their verdict with a claim. This is
  // the refusal that makes « only a human confirms » true rather than merely intended.
  if (row.status === 'confirmed') {
    return conflict('That remark is already confirmed fixed.', 'already-confirmed')
  }

  const at = nowSec()
  const res = await ctx.env.DB.batch([
    // OR IGNORE + the partial unique index on (remark_id, sha) IS the idempotency: a
    // re-run of the workflow, or the notify script's own retry, writes nothing. The
    // callback has no Idempotency-Key to hand the usual middleware, so the database
    // enforces it instead of the handler remembering to.
    ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO remark_events (id, remark_id, kind, text, sha, author_member_id, created_at)
       VALUES (?1, ?2, 'shipped', ?3, ?4, NULL, ?5)`,
    ).bind(newId(), id, explanation, sha, at),
    // The status re-check lives in the WHERE, not only in the read above: those are two
    // statements, and someone can tap « C'est réglé » between them.
    ctx.env.DB.prepare(
      "UPDATE remarks SET status = 'shipped', updated_at = ?1 WHERE id = ?2 AND status <> 'confirmed' AND deleted_at IS NULL",
    ).bind(at, id),
  ])
  const inserted = (res[0].meta?.changes ?? 0) > 0
  const advanced = (res[1].meta?.changes ?? 0) > 0

  // A re-run of the same workflow. The index refused the duplicate; answer 200 so the CI
  // step does not annotate a false failure, and say which it was.
  if (!inserted) return ok({ ok: true, id, status: row.status, duplicate: true })

  // Confirmed between the read and the write. The event still landed (a batch is one
  // transaction, and « this commit claimed to fix it » is true regardless), but the
  // status is untouched.
  if (!advanced) return conflict('That remark was confirmed while this request was in flight.', 'already-confirmed')

  // 6. THE BROADCAST WE MUST MAKE OURSELVES. authed() normally does this after a
  //    successful write; a plain handler broadcasts nothing, so « expédiée » would not
  //    appear on an open tab until its next poll — and the loop closing in front of you
  //    is the whole point. Keys come from keysForPath, not a literal, so this endpoint
  //    and the authed /api/remarks writes can never disagree about which caches a remark
  //    write touches (realtime.test.ts pins both). Best-effort and fully swallowed:
  //    realtime can never fail the write.
  const keys = keysForPath('remarks/shipped')
  if (keys.length > 0) {
    const fire = broadcastInvalidate(ctx.env, row.household_id, keys).catch(() => {})
    if (typeof ctx.waitUntil === 'function') ctx.waitUntil(fire)
    else void fire
  }

  return ok({ ok: true, id, status: 'shipped', sha })
}
