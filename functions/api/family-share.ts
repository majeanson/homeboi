import { ok, badRequest, notFound, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, copyR2Blob } from '../_lib/r2'
import { sanitizeIntake, intakeMediaKeys, type IntakeSubmission, type SanitizeCaps } from '../_lib/intake'
import type { Env } from '../_lib/env'

// « Partager une famille » (migration 0100). Hand a family you built in Le cercle to a
// FRIEND who runs their OWN Babillard account. A family isn't a stored row — it's a
// subgraph derived at read time (src/lib/cercle.ts) — so the sender's client
// MATERIALIZES a snapshot in the shared IntakeSubmission shape ({self, household[],
// links[], pets[]}, index-addressed — see functions/_lib/intake.ts) and POSTs it here.
// We store it under an unguessable id that IS the share capability, and hand back a
// /cercle/import?s=<id> URL. The recipient, signed into their own account, GETs the
// snapshot by id and MERGES it client-side via the existing /api/cercle* endpoints
// (reusing matchIntakePerson + the ReviewChecklist flow, exactly like intake review).
//
// This is a one-time COPY, never a cross-household live link:
//   POST            → create a share, returns { id, url }                    (operator)
//   GET  ?s=<id>    → the snapshot to preview + merge (ANY account — id is the cap)
//   GET  (no id)    → the sender's own live shares (manage list)
//   DELETE { id }   → revoke early (frees the share-owned photo copies)      (operator)
//
// Photo keys inside the payload are SHARE-OWNED R2 copies (prefix `fs`) minted at POST
// so the snapshot survives the source contact being deleted; they're freed on
// revoke/expire. Calm: a directory hand-off, no counts/streaks. R2 unset → the share
// is text-only (photos silently drop), matching the app's optional-binding contract.

const SHARE_TTL = 30 * 24 * 60 * 60 // 30 days — long-lived but always expiring (never permanent)
const MAX_SHARES = 100 // bound how many live shares one household can pile up
const LABEL_CAP = 80
// A shared family is built by a TRUSTED operator (not an anonymous intake guest), so it
// gets far higher count ceilings than the intake form — enough for any real extended
// family — while the per-field length caps still bound total size. 60 people = self + 59.
const SHARE_CAPS: SanitizeCaps = { maxHousehold: 59, maxPets: 40, maxLinks: 300 }

// Every photo key a snapshot references (self + household + pets) — reuses intake's helper.
const sharePhotoKeys = (s: IntakeSubmission): string[] => intakeMediaKeys(s)

// Free a snapshot's share-owned photo copies (best-effort; no-ops when R2 is unset).
async function freeSharePhotos(env: Env, payloadJson: string): Promise<void> {
  let s: IntakeSubmission | null = null
  try {
    s = JSON.parse(payloadJson) as IntakeSubmission
  } catch {
    return
  }
  if (!s) return
  for (const k of sharePhotoKeys(s)) await deleteR2Blob(env.PHOTOS, k)
}

// The photo keys this household actually OWNS (its contacts / member faces / pets /
// gallery). A crafted POST could otherwise name an arbitrary R2 key to smuggle it into
// a share; we only copy keys the sender owns and drop the rest. Mirrors the ownership
// guard on intake's staged media (ownedStagedKeys).
async function ownedPhotoKeys(db: D1Database, hh: string): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT media_key AS k FROM contacts WHERE household_id = ? AND media_key IS NOT NULL
       UNION SELECT avatar_ref FROM members WHERE household_id = ? AND avatar_kind = 'photo' AND avatar_ref != ''
       UNION SELECT media_key FROM pets WHERE household_id = ? AND media_key IS NOT NULL
       UNION SELECT media_key FROM contact_photos WHERE household_id = ? AND media_key IS NOT NULL`,
    )
    .bind(hh, hh, hh, hh)
    .all<{ k: string | null }>()
  return new Set(rows.results.map((r) => r.k).filter((k): k is string => !!k))
}

// Copy each OWNED photo into a share-owned `fs_` blob so the snapshot is self-contained;
// drop any key the sender doesn't own (anti-exfiltration). Returns the rewritten payload.
async function snapshotPhotos(
  photos: R2Bucket | undefined,
  s: IntakeSubmission,
  owned: Set<string>,
): Promise<IntakeSubmission> {
  const copy = async <T extends { photoKey: string | null }>(p: T): Promise<T> => {
    if (!p.photoKey) return p
    if (!owned.has(p.photoKey)) return { ...p, photoKey: null }
    return { ...p, photoKey: await copyR2Blob(photos, p.photoKey, 'fs') }
  }
  const self = await copy(s.self)
  const household = await Promise.all(s.household.map(copy))
  const pets = await Promise.all(s.pets.map(copy))
  return { self, household, links: s.links, pets }
}

// POST → create a share from a materialized family snapshot. Operator-only (a kiosk
// can't hand your directory to another household).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ label?: string; payload?: unknown }>(ctx.request)
  // No field-scope: a share carries the whole family (all sections). sanitizeIntake
  // still bounds it (≤60 people, ≤300 links) and rejects a payload with no named self.
  const submission = sanitizeIntake(body?.payload, undefined, SHARE_CAPS)
  if (!submission) return badRequest('Famille vide (au moins une personne avec un prénom).')
  const hh = actor.householdId
  // How many people the sender sent vs how many survived the cap — so the share sheet
  // can say "shared N of M" if a huge family was clipped (rather than dropping silently).
  const rawHousehold = Array.isArray((body?.payload as { household?: unknown })?.household)
    ? (body!.payload as { household: unknown[] }).household.length
    : 0
  const totalPeople = 1 + rawHousehold
  const sharedPeople = 1 + submission.household.length

  const count = await ctx.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM family_shares WHERE source_household_id = ? AND revoked_at IS NULL',
  )
    .bind(hh)
    .first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_SHARES) return badRequest('Trop de familles partagées. Retires-en une d’abord.')

  const owned = await ownedPhotoKeys(ctx.env.DB, hh)
  const snapshot = await snapshotPhotos(ctx.env.PHOTOS, submission, owned)

  const id = newId()
  const ts = nowSec()
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, LABEL_CAP) : ''
  await ctx.env.DB.prepare(
    'INSERT INTO family_shares (id, source_household_id, label, payload, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
  )
    .bind(id, hh, label, JSON.stringify(snapshot), ts + SHARE_TTL, ts)
    .run()

  const origin = new URL(ctx.request.url).origin
  return ok({ id, url: `${origin}/cercle/import?s=${id}`, sharedPeople, totalPeople })
}, 'operator')

// GET ?s=<id> → the snapshot for the recipient to preview + merge (any account: the id
// is the capability). GET with no id → the sender's own live shares (manage list).
export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const id = url.searchParams.get('s')
  const now = nowSec()

  if (id) {
    const row = await ctx.env.DB.prepare(
      `SELECT fs.label, fs.payload, fs.expires_at, fs.revoked_at, h.name AS source_name
         FROM family_shares fs JOIN households h ON h.id = fs.source_household_id
        WHERE fs.id = ?`,
    )
      .bind(id)
      .first<{ label: string; payload: string; expires_at: number | null; revoked_at: number | null; source_name: string | null }>()
    if (!row || row.revoked_at != null || (row.expires_at != null && row.expires_at < now)) {
      return notFound('Ce partage n’existe plus.')
    }
    let payload: IntakeSubmission | null = null
    try {
      payload = JSON.parse(row.payload) as IntakeSubmission
    } catch {
      payload = null
    }
    if (!payload) return notFound('Ce partage n’existe plus.')
    return ok({ label: row.label, payload, sourceName: row.source_name ?? null })
  }

  // Manage list: this household's live shares, newest first. Opportunistically sweep
  // expired shares (free their photo copies + stop listing them) so R2 can't accumulate.
  const hh = actor.householdId
  const rows = await ctx.env.DB.prepare(
    'SELECT id, label, payload, expires_at, created_at FROM family_shares WHERE source_household_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
  )
    .bind(hh)
    .all<{ id: string; label: string; payload: string; expires_at: number | null; created_at: number }>()

  const shares: { id: string; label: string; createdAt: number; expiresAt: number | null }[] = []
  for (const r of rows.results) {
    if (r.expires_at != null && r.expires_at < now) {
      await freeSharePhotos(ctx.env, r.payload)
      await ctx.env.DB.prepare('UPDATE family_shares SET revoked_at = ? WHERE id = ? AND source_household_id = ?')
        .bind(now, r.id, hh)
        .run()
      continue
    }
    shares.push({ id: r.id, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at })
  }
  return ok({ shares })
})

// DELETE { id } → revoke a share early (frees its share-owned photo copies). Operator-only.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const hh = actor.householdId
  const row = await ctx.env.DB.prepare('SELECT payload FROM family_shares WHERE id = ? AND source_household_id = ?')
    .bind(body.id, hh)
    .first<{ payload: string }>()
  if (!row) return notFound('Partage introuvable.')
  await freeSharePhotos(ctx.env, row.payload)
  await ctx.env.DB.prepare('UPDATE family_shares SET revoked_at = ? WHERE id = ? AND source_household_id = ?')
    .bind(nowSec(), body.id, hh)
    .run()
  return ok({ ok: true })
}, 'operator')
