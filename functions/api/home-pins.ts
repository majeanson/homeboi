import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'

// « En cas de pépin » — a home carnet's house map (migration 0082): a calm reference
// of LOCATIONS and how-tos (water shutoff, breaker panel, spare key, how the
// thermostat works), each with an optional photo. Deliberately NOT quantities — it's
// "where is it / how does it work", the babysitter-and-new-partner gold. Surfaces
// read-only in guest mode (the sitter window).
//
//   GET    /api/home-pins?carnet=<id> -> that carnet's pins, in order
//   POST   /api/home-pins -> image blob → upload a photo, return { key }
//                         -> JSON → create a pin
//   PATCH  /api/home-pins -> edit one { id, …fields }
//   DELETE /api/home-pins -> delete one { id } (frees its photo)

const MAX_PHOTO_BYTES = 3 * 1024 * 1024
const LABEL_CAP = 200
const TEXT_CAP = 2000

const KINDS = new Set(['where', 'howto', 'doc'])
const kindOf = (v: unknown): string => (typeof v === 'string' && KINDS.has(v) ? v : 'where')
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

interface PinRow {
  id: string
  carnet_id: string
  kind: string
  label: string
  detail: string | null
  media_key: string | null
  sort: number
}

export const onRequestGet = authed(async (ctx, actor) => {
  const carnet = new URL(ctx.request.url).searchParams.get('carnet')
  if (!carnet) return ok({ pins: [] })
  const rows = await ctx.env.DB.prepare(
    `SELECT id, carnet_id, kind, label, detail, media_key, sort
       FROM home_pins WHERE household_id = ? AND carnet_id = ? ORDER BY sort, created_at`,
  )
    .bind(actor.householdId, carnet)
    .all<PinRow>()
  return ok({
    pins: rows.results.map((p) => ({
      id: p.id,
      carnetId: p.carnet_id,
      kind: p.kind,
      label: p.label,
      detail: p.detail,
      mediaKey: p.media_key,
      sort: p.sort,
    })),
  })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const type = ctx.request.headers.get('content-type') ?? ''
  if (type.startsWith('image/')) {
    if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage photo indisponible ici.')
    const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, { prefix: 'hp', maxBytes: MAX_PHOTO_BYTES, accept: () => true })
    if ('error' in up) return up.error
    return ok({ key: up.key })
  }

  const body = await readJson<{ carnetId?: string; kind?: string; label?: string; detail?: string | null; mediaKey?: string | null }>(ctx.request)
  const label = str(body?.label)?.slice(0, LABEL_CAP)
  if (!label) return badRequest('Nom requis.')
  if (!body?.carnetId) return badRequest('Carnet requis.')
  const owns = await ctx.env.DB.prepare('SELECT id FROM carnets WHERE id = ? AND household_id = ?')
    .bind(body.carnetId, actor.householdId)
    .first<{ id: string }>()
  if (!owns) return badRequest('Carnet introuvable.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO home_pins (id, household_id, carnet_id, kind, label, detail, media_key, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, actor.householdId, body.carnetId, kindOf(body?.kind), label, str(body?.detail)?.slice(0, TEXT_CAP) ?? null, str(body?.mediaKey), ts, ts, ts)
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; kind?: string; label?: string; detail?: string | null; mediaKey?: string | null; sort?: number }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const owns = await ctx.env.DB.prepare('SELECT media_key FROM home_pins WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ media_key: string | null }>()
  if (!owns) return notFound('Introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }
  if (body.label !== undefined) {
    const l = str(body.label)?.slice(0, LABEL_CAP)
    if (!l) return badRequest('Nom requis.')
    setIf(true, 'label', l)
  }
  if (body.kind !== undefined) setIf(true, 'kind', kindOf(body.kind))
  setIf('detail' in body, 'detail', str(body.detail)?.slice(0, TEXT_CAP) ?? null)
  setIf('mediaKey' in body, 'media_key', str(body.mediaKey))
  if (typeof body.sort === 'number' && Number.isFinite(body.sort)) setIf(true, 'sort', Math.floor(body.sort))

  if (!sets.length) return ok({ ok: true })
  sets.push('updated_at = ?')
  binds.push(nowSec(), body.id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE home_pins SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`).bind(...binds).run()

  if ('mediaKey' in body && ctx.env.PHOTOS) {
    const next = str(body.mediaKey)
    if (owns.media_key !== next) await deleteR2Blob(ctx.env.PHOTOS, owns.media_key)
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const owns = await ctx.env.DB.prepare('SELECT media_key FROM home_pins WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ media_key: string | null }>()
  if (ctx.env.PHOTOS && owns) await deleteR2Blob(ctx.env.PHOTOS, owns.media_key)
  await ctx.env.DB.prepare('DELETE FROM home_pins WHERE id = ? AND household_id = ?').bind(body.id, actor.householdId).run()
  return ok({ ok: true })
})
