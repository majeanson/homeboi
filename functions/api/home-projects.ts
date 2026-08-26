import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, localDayStart } from '../_lib/ids'
import { hexColor } from '../_lib/validate'
import { normalizeRecur } from '../_lib/recur'
import { upkeepStatus } from '../_lib/upkeep'

// "Projets & Entretien" — the longer-horizon home work that lives under Corvées
// but isn't a chore (see migration 0074). ONE table, `kind` ('plan'|'upkeep')
// discriminates the two faces; the frontend filters by kind. A row may carry BOTH
// a budget AND a recurrence (a water-heater replacement is both maintenance and a
// budgeted purchase). Modelled on chores.ts: the board expands recurring/dated
// rows onto Aujourd'hui / À venir, and the same edit-vs-complete PATCH split lets
// a kiosk check an upkeep occurrence off the board. NFR-CALM-1: budget is a
// descriptive target only (no progress bar), no rotation, no counts.

const kindOf = (v: unknown): 'plan' | 'upkeep' => (v === 'upkeep' ? 'upkeep' : 'plan')

// What the recurrence counts from (migration 0119): the fixed anchor grid, or
// « à partir de la dernière fois » (last_done_at re-anchors the cycle).
const recurFromOf = (v: unknown): 'anchor' | 'done' => (v === 'done' ? 'done' : 'anchor')

const recurJson = (recur: unknown): string | null => {
  const r = normalizeRecur(recur)
  return r ? JSON.stringify(r) : null
}

// The date this item targets / its recurrence anchors from (unix-seconds, local
// midnight of the picked day). null = undated → never surfaces in dated views.
const atSec = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

// Optional TARGET amount in cents (no progress-to-goal — NFR-CALM-1). null clears it.
const budgetCents = (v: unknown): number | null => {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

const notesOf = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

// Calm "Bientôt" lead window, clamped to [1 s .. 7 days] like chores/events.
const MAX_LEAD = 7 * 86400
const leadSeconds = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_LEAD) : null
}

// A nullable carnet_id (migration 0082) optionally ties an Entretien row to a
// « carnet » (a house, a car, the water heater). NULL = an ordinary household-level
// Projet/Entretien. The row surfaces on the board exactly the same either way — the
// carnet link just lets « Les carnets » group + brand it (reuse seam #1).
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

// A carnet_id is only honoured when it names a carnet THIS household owns (mirrors
// care-log / home-pins). A foreign/garbage id stores NULL rather than a dangling link.
async function validCarnetId(db: D1Database, hh: string, v: unknown): Promise<string | null> {
  const id = str(v)
  if (!id) return null
  const owns = await db.prepare('SELECT id FROM carnets WHERE id = ? AND household_id = ?').bind(id, hh).first<{ id: string }>()
  return owns ? id : null
}

interface ProjectRow {
  id: string
  kind: string
  title: string
  notes: string | null
  budget_cents: number | null
  color: string | null
  at: number | null
  recur_json: string | null
  recur_from: string | null
  lead_seconds: number | null
  last_done_at: number | null
  carnet_id: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, kind, title, notes, budget_cents, colour AS color, at, recur_json, recur_from, lead_seconds, last_done_at, carnet_id FROM home_projects WHERE household_id = ? ORDER BY created_at',
  )
    .bind(actor.householdId)
    .all<ProjectRow>()
  // Derived scheduling facts, from the ONE expander (_lib/upkeep): nextAt lets the
  // client group « cette saison » without re-implementing recurrence; overdueSince /
  // dueToday are the calm carry-forward the board and season card render.
  const today = localDayStart(new Date(nowSec() * 1000))
  const projects = results.map((p) => ({ ...p, ...upkeepStatus(p, today) }))
  return ok({ projects })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    kind?: string
    title?: string
    notes?: string | null
    budgetCents?: number | null
    color?: string
    at?: unknown
    recur?: unknown
    recurFrom?: unknown
    leadSeconds?: number | null
    carnetId?: string | null
  }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  const at = atSec(body?.at)
  const carnetId = await validCarnetId(ctx.env.DB, actor.householdId, body?.carnetId)
  await ctx.env.DB.prepare(
    'INSERT INTO home_projects (id, household_id, kind, title, notes, budget_cents, colour, at, recur_json, recur_from, lead_seconds, carnet_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      kindOf(body?.kind),
      title,
      notesOf(body?.notes),
      budgetCents(body?.budgetCents),
      hexColor(body?.color, '#88a36f'),
      at,
      recurJson(body?.recur),
      recurFromOf(body?.recurFrom),
      at ? leadSeconds(body?.leadSeconds) : null, // a lead needs an occurrence date to anchor against
      carnetId,
      ts,
      ts,
    )
    .run()
  return ok({ id, title })
})

// Two shapes (mirrors chores.ts):
//   - edit:     any field present → update the row in place (the same form
//               creates and edits). A parent-mode kiosk may edit too.
//   - complete: `id` alone → stamp last_done_at (mark this cycle done / archive
//               a one-off). Kiosk + operator can both call this, so an upkeep
//               occurrence is checkable straight off the board.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    title?: string
    notes?: string | null
    budgetCents?: number | null
    color?: string
    at?: unknown
    recur?: unknown
    recurFrom?: unknown
    leadSeconds?: number | null
    carnetId?: string | null
  }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  const editsContent =
    body.title !== undefined ||
    body.notes !== undefined ||
    body.budgetCents !== undefined ||
    body.color !== undefined ||
    body.at !== undefined ||
    body.recur !== undefined ||
    body.recurFrom !== undefined ||
    body.leadSeconds !== undefined ||
    body.carnetId !== undefined
  if (editsContent) {
    const sets: string[] = []
    const binds: unknown[] = []
    if (typeof body.title === 'string' && body.title.trim()) {
      sets.push('title = ?')
      binds.push(body.title.trim())
    }
    if (body.notes !== undefined) {
      sets.push('notes = ?')
      binds.push(notesOf(body.notes))
    }
    if (body.budgetCents !== undefined) {
      sets.push('budget_cents = ?')
      binds.push(budgetCents(body.budgetCents))
    }
    if (body.color !== undefined) {
      sets.push('colour = ?')
      binds.push(hexColor(body.color, '#88a36f'))
    }
    if (body.at !== undefined) {
      sets.push('at = ?')
      binds.push(atSec(body.at))
    }
    if (body.recur !== undefined) {
      sets.push('recur_json = ?')
      binds.push(recurJson(body.recur))
    }
    if (body.recurFrom !== undefined) {
      sets.push('recur_from = ?')
      binds.push(recurFromOf(body.recurFrom))
    }
    if (body.leadSeconds !== undefined) {
      sets.push('lead_seconds = ?')
      binds.push(leadSeconds(body.leadSeconds))
    }
    if (body.carnetId !== undefined) {
      sets.push('carnet_id = ?')
      binds.push(await validCarnetId(ctx.env.DB, actor.householdId, body.carnetId))
    }
    if (!sets.length) return ok({ ok: true })
    sets.push('updated_at = ?')
    binds.push(nowSec())
    binds.push(body.id, actor.householdId)
    const res = await ctx.env.DB.prepare(`UPDATE home_projects SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
      .bind(...binds)
      .run()
    if (!res.meta.changes) return notFound('Introuvable.')
    return ok({ ok: true })
  }

  // Complete: stamp this cycle done. A recurring upkeep's next occurrence then
  // shows; a one-off drops from the active list (mirrors a chore's last_done_at).
  const ts = nowSec()
  const res = await ctx.env.DB.prepare(
    'UPDATE home_projects SET last_done_at = ?, updated_at = ? WHERE id = ? AND household_id = ?',
  )
    .bind(ts, ts, body.id, actor.householdId)
    .run()
  if (!res.meta.changes) return notFound('Introuvable.')
  return ok({ ok: true, done: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM home_projects WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
