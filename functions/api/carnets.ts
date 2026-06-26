import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { hexColor } from '../_lib/validate'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'
import { carnetLifeSoon, fetchCarnetLifeItems } from '../_lib/carnetLife'

// « Les carnets » — the household's cared-for things as a TREE (migration 0082).
// A top-level carnet is a house or a car (parent_id NULL); a child is a thing
// inside it (water heater, roof) or a room ('zone'). Every node is the same shape,
// so carnets nest. Each keeps an identity here, a service history (care_log), a
// recurring-upkeep cadence (home_projects.carnet_id), and a « long jeu » lifecycle
// (installed_at + lifespan_months → a DERIVED "à prévoir", see carnetLife.ts).
//
//   GET    /api/carnets -> the whole tree + the lifecycle "soon" glance
//   POST   /api/carnets -> image blob → upload a photo, return { key }
//                       -> JSON → create a carnet
//   PATCH  /api/carnets -> edit one { id, …fields }
//   DELETE /api/carnets -> archive one { id } (+ its descendants), reversible
//
// CALM: an identity + a calendar of care, never a score/inventory. authed() makes
// a guest read-only structurally. Photo upload degrades to 503 when R2 is unbound.

const MAX_PHOTO_BYTES = 3 * 1024 * 1024
const NAME_CAP = 200
const TEXT_CAP = 2000

const KINDS = new Set(['home', 'auto', 'appliance', 'system', 'zone', 'thing'])
const kindOf = (v: unknown): string => (typeof v === 'string' && KINDS.has(v) ? v : 'thing')

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

// local-midnight unix seconds, or null
const atSec = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

const months = (v: unknown): number | null => {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1200) : null // ≤100 yr
}

// kind-specific facts (built_year, make/model, serial, warranty_until, address…)
const factsJson = (v: unknown): string | null => {
  if (v === null) return null
  if (typeof v !== 'object') return null
  try {
    const s = JSON.stringify(v)
    return s && s !== '{}' ? s.slice(0, 4000) : null
  } catch {
    return null
  }
}

interface CarnetRow {
  id: string
  parent_id: string | null
  kind: string
  name: string
  media_key: string | null
  color: string
  facts_json: string | null
  installed_at: number | null
  lifespan_months: number | null
  link_id: string | null
  notes: string | null
  sort: number
}

function mapRow(r: CarnetRow) {
  let facts: Record<string, unknown> | null = null
  if (r.facts_json) {
    try {
      facts = JSON.parse(r.facts_json)
    } catch {
      facts = null
    }
  }
  return {
    id: r.id,
    parentId: r.parent_id,
    kind: r.kind,
    name: r.name,
    mediaKey: r.media_key,
    color: r.color,
    facts,
    installedAt: r.installed_at,
    lifespanMonths: r.lifespan_months,
    linkId: r.link_id,
    notes: r.notes,
    sort: r.sort, // API keeps `sort`; DB column renamed to `position` (DB-3, SELECT aliases `position AS sort`)
  }
}

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    `SELECT id, parent_id, kind, name, media_key, colour AS color, facts_json, installed_at, lifespan_months, link_id, notes, position AS sort
       FROM carnets WHERE household_id = ? AND archived_at IS NULL
      ORDER BY position, created_at`,
  )
    .bind(actor.householdId)
    .all<CarnetRow>()
  const life = await fetchCarnetLifeItems(ctx.env.DB, actor.householdId)
  return ok({
    carnets: rows.results.map(mapRow),
    soon: carnetLifeSoon(life, nowSec()),
  })
})

// POST wears two hats by content-type (mirrors /api/businesses):
//   image/*  → upload a photo to R2, return { key }
//   JSON     → create a carnet
export const onRequestPost = authed(async (ctx, actor) => {
  const type = ctx.request.headers.get('content-type') ?? ''
  if (type.startsWith('image/')) {
    if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage photo indisponible ici.')
    const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, { prefix: 'cn', maxBytes: MAX_PHOTO_BYTES, accept: () => true })
    if ('error' in up) return up.error
    return ok({ key: up.key })
  }

  const body = await readJson<{
    parentId?: string | null
    kind?: string
    name?: string
    mediaKey?: string | null
    color?: string
    facts?: unknown
    installedAt?: unknown
    lifespanMonths?: number | null
    linkId?: string | null
    notes?: string | null
  }>(ctx.request)
  const name = str(body?.name)?.slice(0, NAME_CAP)
  if (!name) return badRequest('Nom requis.')

  // A child must point at a carnet we own (kept shallow by the UI, any depth here).
  let parentId: string | null = null
  if (body?.parentId) {
    const owns = await ctx.env.DB.prepare('SELECT id FROM carnets WHERE id = ? AND household_id = ?')
      .bind(body.parentId, actor.householdId)
      .first<{ id: string }>()
    if (!owns) return badRequest('Parent introuvable.')
    parentId = body.parentId
  }

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO carnets
       (id, household_id, parent_id, kind, name, media_key, colour, facts_json, installed_at, lifespan_months, link_id, notes, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      parentId,
      kindOf(body?.kind),
      name,
      str(body?.mediaKey),
      hexColor(body?.color, '#88a36f'),
      factsJson(body?.facts),
      atSec(body?.installedAt),
      months(body?.lifespanMonths),
      str(body?.linkId),
      str(body?.notes)?.slice(0, TEXT_CAP) ?? null,
      ts, // sort: append (a small int, fine to seed with the timestamp; reorder later)
      ts,
      ts,
    )
    .run()
  return ok({ id, name })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    kind?: string
    name?: string
    mediaKey?: string | null
    color?: string
    facts?: unknown
    installedAt?: unknown
    lifespanMonths?: number | null
    linkId?: string | null
    notes?: string | null
    sort?: number
  }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  // Grab the current photo so replacing it can free the old R2 blob (best-effort),
  // like care-log / home-pins / businesses do.
  const owns = await ctx.env.DB.prepare('SELECT media_key FROM carnets WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ media_key: string | null }>()
  if (!owns) return notFound('Carnet introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }
  if (body.name !== undefined) {
    const n = str(body.name)?.slice(0, NAME_CAP)
    if (!n) return badRequest('Nom requis.')
    setIf(true, 'name', n)
  }
  if (body.kind !== undefined) setIf(true, 'kind', kindOf(body.kind))
  setIf('mediaKey' in body, 'media_key', str(body.mediaKey))
  if (body.color !== undefined) setIf(true, 'colour', hexColor(body.color, '#88a36f'))
  setIf('facts' in body, 'facts_json', factsJson(body.facts))
  setIf('installedAt' in body, 'installed_at', atSec(body.installedAt))
  setIf('lifespanMonths' in body, 'lifespan_months', months(body.lifespanMonths))
  setIf('linkId' in body, 'link_id', str(body.linkId))
  setIf('notes' in body, 'notes', str(body.notes)?.slice(0, TEXT_CAP) ?? null)
  if (typeof body.sort === 'number' && Number.isFinite(body.sort)) setIf(true, 'position', Math.floor(body.sort))

  if (!sets.length) return ok({ ok: true })
  sets.push('updated_at = ?')
  binds.push(nowSec(), body.id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE carnets SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...binds)
    .run()

  // Replacing the photo frees the previous R2 blob (best-effort).
  if ('mediaKey' in body && ctx.env.PHOTOS) {
    const next = str(body.mediaKey)
    if (owns.media_key !== next) await deleteR2Blob(ctx.env.PHOTOS, owns.media_key)
  }
  return ok({ ok: true })
})

// Archive (reversible) the carnet AND its descendants, so a parent never leaves
// orphaned children behind. The blobs are kept for a possible un-archive.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const subtree = await ctx.env.DB.prepare(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM carnets WHERE id = ? AND household_id = ?
       UNION ALL
       SELECT c.id FROM carnets c JOIN sub ON c.parent_id = sub.id
     )
     SELECT id FROM sub`,
  )
    .bind(body.id, actor.householdId)
    .all<{ id: string }>()
  const ids = subtree.results.map((r) => r.id)
  if (!ids.length) return notFound('Carnet introuvable.')
  const ts = nowSec()
  const ph = ids.map(() => '?').join(', ')
  await ctx.env.DB.prepare(
    `UPDATE carnets SET archived_at = ?, updated_at = ? WHERE household_id = ? AND id IN (${ph})`,
  )
    .bind(ts, ts, actor.householdId, ...ids)
    .run()
  return ok({ ok: true })
})
