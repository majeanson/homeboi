import { ok, badRequest, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'
import { intakeMediaKeys, type IntakeSubmission } from '../_lib/intake'

// Operator side of the family-info intake (migrations 0075 + 0076). Thin on purpose:
// the actual merge into Le cercle runs CLIENT-side at review time (it reuses the
// existing /api/cercle, /api/cercle-links, /api/cercle-groups, /api/pets endpoints +
// the ReviewChecklist + proposeAllFamilyLinks flow), so this lists pending
// submissions, marks one merged/dismissed, and owns the staged-photo lifecycle:
// keep a merged submission's blobs (now contact/pet photos), free a dismissed one's,
// and sweep abandoned uploads. Operator-only.

const DAY = 86_400

interface PendingOut extends IntakeSubmission {
  id: string
  targetKey: string | null
  createdAt: number
}

function parsePayload(raw: string): IntakeSubmission | null {
  try {
    return JSON.parse(raw) as IntakeSubmission
  } catch {
    return null
  }
}

// GET → every pending submission (newest first), payload inlined. Also opportunistically
// frees abandoned staged photos (uploaded, but the form was never submitted) so R2
// can't accumulate — anything 'staged', older than a link's max life (7d), and NOT
// referenced by a still-pending submission.
export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const rows = await ctx.env.DB.prepare(
    "SELECT id, target_key, payload, created_at FROM intake_submissions WHERE household_id = ? AND status = 'pending' ORDER BY created_at DESC",
  )
    .bind(hh)
    .all<{ id: string; target_key: string | null; payload: string; created_at: number }>()

  const submissions: PendingOut[] = []
  const referenced = new Set<string>()
  for (const r of rows.results) {
    const parsed = parsePayload(r.payload)
    if (!parsed) continue // a corrupt row shouldn't break the whole queue
    for (const k of intakeMediaKeys(parsed)) referenced.add(k)
    submissions.push({ ...parsed, id: r.id, targetKey: r.target_key, createdAt: r.created_at })
  }

  // Orphan sweep — best-effort, never blocks the read.
  const cutoff = nowSec() - 7 * DAY
  const stale = await ctx.env.DB.prepare(
    "SELECT id, media_key AS r2_key FROM intake_media WHERE household_id = ? AND status = 'staged' AND created_at < ?",
  )
    .bind(hh, cutoff)
    .all<{ id: string; r2_key: string }>()
  for (const m of stale.results) {
    if (referenced.has(m.r2_key)) continue // a still-pending submission needs it
    await deleteR2Blob(ctx.env.PHOTOS, m.r2_key)
    await ctx.env.DB.prepare('DELETE FROM intake_media WHERE id = ? AND household_id = ?').bind(m.id, hh).run()
  }

  return ok({ submissions })
}, 'operator')

// PATCH { id, status: 'merged' | 'dismissed' } → clear a reviewed submission. On
// merge the cercle writes already happened client-side and the photos now belong to
// the contacts, so we just drop the staging rows (keep the blobs). On dismiss we free
// the blobs too — nothing references them.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; status?: string }>(ctx.request)
  const id = body?.id
  const status = body?.status
  if (!id || (status !== 'merged' && status !== 'dismissed')) {
    return badRequest('id et status (merged|dismissed) requis.')
  }
  const hh = actor.householdId

  const row = await ctx.env.DB.prepare(
    'SELECT payload FROM intake_submissions WHERE id = ? AND household_id = ?',
  )
    .bind(id, hh)
    .first<{ payload: string }>()
  const keys = row ? intakeMediaKeys(parsePayload(row.payload) ?? ({} as IntakeSubmission)) : []

  if (status === 'dismissed') {
    for (const k of keys) await deleteR2Blob(ctx.env.PHOTOS, k)
  }
  // Either way, the staging rows are done with — the blobs are now orphan-swept-proof
  // (merged: owned by a contact; dismissed: just deleted).
  for (const k of keys) {
    await ctx.env.DB.prepare('DELETE FROM intake_media WHERE household_id = ? AND media_key = ?').bind(hh, k).run()
  }

  await ctx.env.DB.prepare(
    'UPDATE intake_submissions SET status = ?, reviewed_at = ? WHERE id = ? AND household_id = ?',
  )
    .bind(status, nowSec(), id, hh)
    .run()
  return ok()
}, 'operator')
