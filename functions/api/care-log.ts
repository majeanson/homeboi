import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'

// « Le carnet » → the service history of one carnet (migration 0082): dated entries,
// each with optional notes, a recorded cost, the installer/servicer (a cercle
// business), and attached R2 docs (the invoice / manual / photo). Marc's example —
// "new water heater → install date + invoice + notes" — is one row here.
//
//   GET    /api/care-log?carnet=<id> -> that carnet's entries, newest first
//   POST   /api/care-log -> file blob → upload a doc, return { key }
//                        -> JSON → create an entry
//   PATCH  /api/care-log -> edit one { id, …fields }
//   DELETE /api/care-log -> delete one { id } (frees its docs)
//
// CALM: cost_cents is a recorded invoice total, never a running balance. No counts.

const MAX_DOC_BYTES = 6 * 1024 * 1024 // invoices/manuals run larger than a thumb
const TITLE_CAP = 200
const TEXT_CAP = 4000

const KINDS = new Set(['service', 'install', 'purchase', 'note'])
const kindOf = (v: unknown): string => (typeof v === 'string' && KINDS.has(v) ? v : 'note')

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

const atSec = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : nowSec()
}

const costCents = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

// media_json is a JSON array of R2 keys (invoice / manual / photo).
const mediaJson = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null
  const keys = v.filter((k): k is string => typeof k === 'string' && !!k.trim()).slice(0, 12)
  return keys.length ? JSON.stringify(keys) : null
}
const parseMedia = (s: string | null): string[] => {
  if (!s) return []
  try {
    const a = JSON.parse(s)
    return Array.isArray(a) ? a.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

interface LogRow {
  id: string
  carnet_id: string
  at: number
  kind: string
  title: string
  note: string | null
  cost_cents: number | null
  business_id: string | null
  media_json: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const carnet = new URL(ctx.request.url).searchParams.get('carnet')
  const sql = carnet
    ? `SELECT id, carnet_id, at, kind, title, note, cost_cents, business_id, media_json
         FROM care_log WHERE household_id = ? AND carnet_id = ? ORDER BY at DESC, created_at DESC`
    : `SELECT id, carnet_id, at, kind, title, note, cost_cents, business_id, media_json
         FROM care_log WHERE household_id = ? ORDER BY at DESC, created_at DESC`
  const stmt = ctx.env.DB.prepare(sql)
  const rows = await (carnet ? stmt.bind(actor.householdId, carnet) : stmt.bind(actor.householdId)).all<LogRow>()
  return ok({
    entries: rows.results.map((r) => ({
      id: r.id,
      carnetId: r.carnet_id,
      at: r.at,
      kind: r.kind,
      title: r.title,
      note: r.note,
      costCents: r.cost_cents,
      businessId: r.business_id,
      mediaKeys: parseMedia(r.media_json),
    })),
  })
})

// POST: a non-JSON body (image/* or application/pdf) is a doc upload → { key };
// JSON creates an entry (mirrors /api/businesses, /api/carnets).
export const onRequestPost = authed(async (ctx, actor) => {
  const type = ctx.request.headers.get('content-type') ?? ''
  // A doc upload is positively an image or a PDF (invoice/manual/photo); anything else
  // is treated as the JSON create — never the reverse (a header-less JSON body won't
  // be misrouted into R2).
  if (type.startsWith('image/') || type.startsWith('application/pdf')) {
    if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage indisponible ici.')
    // extFromType: the stored key carries `.pdf`/`.jpg` so the doc viewer can tell a
    // PDF (→ iframe) from an image (→ zoom) from the key alone.
    const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, { prefix: 'cl', maxBytes: MAX_DOC_BYTES, accept: () => true, extFromType: true })
    if ('error' in up) return up.error
    return ok({ key: up.key })
  }

  const body = await readJson<{
    carnetId?: string
    at?: unknown
    kind?: string
    title?: string
    note?: string | null
    costCents?: number | null
    businessId?: string | null
    mediaKeys?: unknown
  }>(ctx.request)
  const title = str(body?.title)?.slice(0, TITLE_CAP)
  if (!title) return badRequest('Titre requis.')
  if (!body?.carnetId) return badRequest('Carnet requis.')
  const owns = await ctx.env.DB.prepare('SELECT id FROM carnets WHERE id = ? AND household_id = ?')
    .bind(body.carnetId, actor.householdId)
    .first<{ id: string }>()
  if (!owns) return badRequest('Carnet introuvable.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO care_log (id, household_id, carnet_id, at, kind, title, note, cost_cents, business_id, media_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      body.carnetId,
      atSec(body?.at),
      kindOf(body?.kind),
      title,
      str(body?.note)?.slice(0, TEXT_CAP) ?? null,
      costCents(body?.costCents),
      str(body?.businessId),
      mediaJson(body?.mediaKeys),
      ts,
      ts,
    )
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    at?: unknown
    kind?: string
    title?: string
    note?: string | null
    costCents?: number | null
    businessId?: string | null
    mediaKeys?: unknown
  }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare('SELECT media_json FROM care_log WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ media_json: string | null }>()
  if (!owns) return notFound('Entrée introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }
  if (body.title !== undefined) {
    const ti = str(body.title)?.slice(0, TITLE_CAP)
    if (!ti) return badRequest('Titre requis.')
    setIf(true, 'title', ti)
  }
  if (body.at !== undefined) setIf(true, 'at', atSec(body.at))
  if (body.kind !== undefined) setIf(true, 'kind', kindOf(body.kind))
  setIf('note' in body, 'note', str(body.note)?.slice(0, TEXT_CAP) ?? null)
  setIf('costCents' in body, 'cost_cents', costCents(body.costCents))
  setIf('businessId' in body, 'business_id', str(body.businessId))
  setIf('mediaKeys' in body, 'media_json', mediaJson(body.mediaKeys))

  if (!sets.length) return ok({ ok: true })
  sets.push('updated_at = ?')
  binds.push(nowSec(), body.id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE care_log SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...binds)
    .run()

  // Replacing the docs frees the previous R2 blobs (best-effort).
  if ('mediaKeys' in body && ctx.env.PHOTOS) {
    const next = new Set(parseMedia(mediaJson(body.mediaKeys)))
    for (const key of parseMedia(owns.media_json)) if (!next.has(key)) await deleteR2Blob(ctx.env.PHOTOS, key)
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const owns = await ctx.env.DB.prepare('SELECT media_json FROM care_log WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ media_json: string | null }>()
  // deleteR2Blob no-ops on an unset bucket, so no env.PHOTOS guard needed here.
  if (owns) for (const key of parseMedia(owns.media_json)) await deleteR2Blob(ctx.env.PHOTOS, key)
  await ctx.env.DB.prepare('DELETE FROM care_log WHERE id = ? AND household_id = ?').bind(body.id, actor.householdId).run()
  return ok({ ok: true })
})
