import { ok, badRequest, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import type { IntakeSubmission } from '../_lib/intake'

// Operator side of the family-info intake (migration 0075). Thin on purpose: the
// actual merge into Le cercle runs CLIENT-side at review time (it reuses the
// existing /api/cercle, /api/cercle-links, /api/cercle-groups endpoints + the
// ReviewChecklist + proposeAllFamilyLinks flow), so this just lists the pending
// submissions and marks one merged/dismissed. Operator-only — a kiosk/guest never
// sees other people's submitted forms.

interface PendingOut extends IntakeSubmission {
  id: string
  targetKey: string | null
  createdAt: number
}

// GET → every pending submission for this household (newest first), payload inlined.
export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    "SELECT id, target_key, payload, created_at FROM intake_submissions WHERE household_id = ? AND status = 'pending' ORDER BY created_at DESC",
  )
    .bind(actor.householdId)
    .all<{ id: string; target_key: string | null; payload: string; created_at: number }>()

  const submissions: PendingOut[] = []
  for (const r of rows.results) {
    try {
      const parsed = JSON.parse(r.payload) as IntakeSubmission
      submissions.push({ ...parsed, id: r.id, targetKey: r.target_key, createdAt: r.created_at })
    } catch {
      // A corrupt row shouldn't break the whole queue — skip it.
    }
  }
  return ok({ submissions })
}, 'operator')

// PATCH { id, status: 'merged' | 'dismissed' } → clear a reviewed submission from
// the queue. The cercle writes themselves already happened client-side.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; status?: string }>(ctx.request)
  const id = body?.id
  const status = body?.status
  if (!id || (status !== 'merged' && status !== 'dismissed')) {
    return badRequest('id et status (merged|dismissed) requis.')
  }
  await ctx.env.DB.prepare(
    'UPDATE intake_submissions SET status = ?, reviewed_at = ? WHERE id = ? AND household_id = ?',
  )
    .bind(status, nowSec(), id, actor.householdId)
    .run()
  return ok()
}, 'operator')
