import { ok, badRequest, readJson, serverError } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { issueGuestToken, normalizeGuestKind, STANDING_TTL, type GuestKind } from '../../_lib/auth'
import { clampShareTtl } from '../../_lib/shareModes'
import { newId, nowSec } from '../../_lib/ids'

// Mint a typed share-link token. Operator-only (a kiosk or guest can't hand out
// access). The token is a stateless HMAC capability bound to this household,
// READ-ONLY, time-boxed, and carries its share-mode `kind` (see auth.ts GuestKind)
// which scopes what it can read (enforced by the allowlist in worker/index.ts).
// The per-kind TTL window lives in _lib/shareModes (clampShareTtl).
//
// Each minted link is recorded in `guests` (keyed by its token id) so the operator
// can REVOKE it before its TTL — resolveActor rejects a token whose row is revoked
// (REVIEW-PASS §509). A token with no row (legacy, pre-0098) still works until it
// expires. The insert is best-effort: a token stays valid even if the row write
// fails (it just can't be revoked early) — never fail the mint over bookkeeping.
//
// D-18 (bmad/10) — `standing: true` mints a NAMED, DURABLE link instead (any kind
// may be standing — decided): it carries auth.ts's 10-year backstop TTL, but the
// `guests` row insert becomes MANDATORY (500 on failure) because resolveActor now
// DB-REQUIRES that row for a standing token (guestRowAcceptable) — a mint that can't
// record its row must not hand out a token nobody can ever revoke.

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    ttlSeconds?: number
    kind?: string
    targetKey?: string
    fields?: number
    standing?: boolean
    label?: string
    lang?: string
  }>(ctx.request)

  // Validate the kind explicitly: an unknown string is a client bug, not a silent
  // downgrade to showcase (which would over-share). Absent kind defaults to showcase.
  if (body?.kind != null && normalizeGuestKind(body.kind) !== body.kind) {
    return badRequest('Unknown share-mode kind.')
  }
  const kind: GuestKind = normalizeGuestKind(body?.kind)

  const standing = body?.standing === true
  // The "Pour qui ?" name — required for a standing link (it's what tells one durable
  // link apart from another in "Liens actifs"); optional otherwise, unchanged.
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 60) : ''
  if (standing && !label) return badRequest('Un nom est requis pour un lien durable.')

  // E-38 — per-guest locale, rides along: 'fr' | 'en' | null (household default).
  const lang = body?.lang === 'fr' || body?.lang === 'en' ? body.lang : null

  const ttlSeconds = standing ? STANDING_TTL : clampShareTtl(kind, body?.ttlSeconds)

  // A per-person link binds the addressed person into the SIGNED token so it can't
  // be retargeted by editing the URL. Meaningful for 'intake' (who the form is for)
  // and, since D-19, 'sitter' (the opt-in « Joindre un parent » — which member's
  // phone the card shows); ignored for every other kind (showcase/welcome/family/
  // postbox have no target). Validated in-household at READ time (guest/window.ts),
  // not here — mirrors intake exactly (a bogus id just yields nothing back).
  const targetKey =
    (kind === 'intake' || kind === 'sitter') && typeof body?.targetKey === 'string' && body.targetKey
      ? body.targetKey
      : null

  // Field scope: which optional sections the intake form asks for. Clamp to the
  // valid 4-bit range; anything out of range (or non-intake) → null = ask everything.
  const fields =
    kind === 'intake' && typeof body?.fields === 'number' && body.fields >= 0 && body.fields <= 15
      ? Math.floor(body.fields)
      : null

  const guestId = newId()
  const guestToken = await issueGuestToken(
    ctx.env,
    guestId,
    actor.householdId,
    ttlSeconds,
    kind,
    targetKey,
    fields,
    standing,
  )
  const now = nowSec()
  const expiresAt = now + ttlSeconds

  if (standing) {
    // MANDATORY: a standing token is only revocable through this row (household.ts
    // guestRowAcceptable) — never hand out one nobody can ever kill.
    try {
      await ctx.env.DB.prepare(
        'INSERT INTO guests (id, household_id, kind, target_key, standing, label, lang, created_at, expires_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)',
      )
        .bind(guestId, actor.householdId, kind, targetKey, label, lang, now, expiresAt)
        .run()
    } catch {
      return serverError('Impossible de créer le lien durable — réessaie.')
    }
  } else {
    // Record the link so it can be listed + revoked (§509). Best-effort: the token is
    // already valid regardless — a failed row write just means it can't be killed early.
    try {
      await ctx.env.DB.prepare(
        'INSERT INTO guests (id, household_id, kind, target_key, label, lang, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(guestId, actor.householdId, kind, targetKey, label || null, lang, now, expiresAt)
        .run()
    } catch {
      /* bookkeeping only — never fail the mint over it */
    }
  }

  return ok({ guestToken, guestId, kind, ttlSeconds, expiresAt, targetKey, standing, label: label || null, lang })
}, 'operator')
