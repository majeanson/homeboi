import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { normalizeRecur } from '../_lib/recur'
import { hexColor } from '../_lib/validate'
import { parseCatchup, parseShares, type Catchup, type Shares } from '../_lib/transfers'

// The standing agreement behind « Les virements » (migration 0126): what the
// household splits, how often it comes due, and who sends what.
//
//   POST   /api/transfer-plans -> create { title, amountCents, recur, anchorAt, shares, catchup, colour }
//   PATCH  /api/transfer-plans -> edit one { id, ...fields }
//   DELETE /api/transfer-plans -> { id } soft delete (recorded transfers keep their lines)
//
// WRITE-ONLY on purpose: plans are READ through /api/transfers, which already has
// to load them to expand due dates and derive the projection. One composed read
// model beats two caches that can disagree about the same rows.
//
// Editing a plan never rewrites history. A recorded transfer stores the amounts it
// was actually sent with, so raising a share next year leaves last year's receipts
// exactly as they were — which is the entire point of keeping receipts.

const TITLE_CAP = 120
const MAX_SHARES = 12
const MAX_CENTS = 100_000_000

const str = (v: unknown, cap: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, cap) : null
}

const daySec = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

const centsOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  return i >= 0 && i <= MAX_CENTS ? i : null
}

// Shares round-trip through the same tolerant parser every reader uses, so what is
// stored is exactly what will be read back — no shape can enter here that
// parseShares would later drop on the floor.
function sharesJson(v: unknown): string {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '{}'
  const entries = Object.entries(v as Record<string, unknown>).slice(0, MAX_SHARES)
  const clean: Shares = {}
  for (const [k, raw] of entries) {
    const c = centsOrNull(raw)
    const id = str(k, 64)
    if (id && c !== null) clean[id] = c
  }
  return JSON.stringify(parseShares(JSON.stringify(clean)))
}

// Same round-trip discipline. An incomplete agreement stores as '{}' (« no catch-up »)
// rather than as a half-built object a reader would have to guard.
function catchupJson(v: unknown): string {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '{}'
  const o = v as Record<string, unknown>
  const draft: Partial<Catchup> = {
    behindMemberId: str(o.behindMemberId, 64) ?? '',
    gapCents: centsOrNull(o.gapCents) ?? 0,
    asOf: daySec(o.asOf) ?? 0,
    termEnd: daySec(o.termEnd) ?? 0,
  }
  const parsed = parseCatchup(JSON.stringify(draft))
  return parsed ? JSON.stringify(parsed) : '{}'
}

const recurJson = (v: unknown): string | null => {
  const r = normalizeRecur(v)
  return r ? JSON.stringify(r) : null
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    title?: string
    amountCents?: unknown
    recur?: unknown
    anchorAt?: unknown
    shares?: unknown
    catchup?: unknown
    colour?: unknown
  }>(ctx.request)

  const title = str(body?.title, TITLE_CAP)
  if (!title) return badRequest('Titre requis.')
  const anchorAt = daySec(body?.anchorAt)
  if (anchorAt === null) return badRequest('Date de référence requise.')

  const { results } = await ctx.env.DB.prepare(
    'SELECT COALESCE(MAX(position), -1) AS max_pos FROM transfer_plans WHERE household_id = ? AND deleted_at IS NULL',
  )
    .bind(actor.householdId)
    .all<{ max_pos: number }>()
  const position = (results[0]?.max_pos ?? -1) + 1

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO transfer_plans
       (id, household_id, title, amount_cents, recur_json, anchor_at, shares_json, catchup_json, colour, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      title,
      centsOrNull(body?.amountCents),
      recurJson(body?.recur),
      anchorAt,
      sharesJson(body?.shares),
      catchupJson(body?.catchup),
      body?.colour == null ? null : hexColor(body.colour, '#7A8B99'),
      position,
      ts,
      ts,
    )
    .run()
  return ok({ id })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    title?: string
    amountCents?: unknown
    recur?: unknown
    anchorAt?: unknown
    shares?: unknown
    catchup?: unknown
    colour?: unknown
    position?: unknown
  }>(ctx.request)
  const id = str(body?.id, 64)
  if (!id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare(
    'SELECT id FROM transfer_plans WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ id: string }>()
  if (!owns) return notFound('Entente introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }

  if (body?.title !== undefined) {
    const title = str(body.title, TITLE_CAP)
    if (!title) return badRequest('Titre requis.')
    setIf(true, 'title', title)
  }
  if (body?.anchorAt !== undefined) {
    const at = daySec(body.anchorAt)
    if (at === null) return badRequest('Date de référence invalide.')
    setIf(true, 'anchor_at', at)
  }
  setIf(!!body && 'amountCents' in body, 'amount_cents', centsOrNull(body?.amountCents))
  // `recur: null` is « plus de récurrence » and must reach the column, so this rides
  // the key-presence check too.
  setIf(!!body && 'recur' in body, 'recur_json', recurJson(body?.recur))
  if (body?.shares !== undefined) setIf(true, 'shares_json', sharesJson(body.shares))
  if (body?.catchup !== undefined) setIf(true, 'catchup_json', catchupJson(body.catchup))
  setIf(!!body && 'colour' in body, 'colour', body?.colour == null ? null : hexColor(body.colour, '#7A8B99'))
  if (body?.position !== undefined) {
    const n = Number(body.position)
    if (Number.isFinite(n)) setIf(true, 'position', Math.max(0, Math.floor(n)))
  }

  if (!sets.length) return ok({ ok: true })
  sets.push('updated_at = ?')
  binds.push(nowSec(), id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE transfer_plans SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...binds)
    .run()
  return ok({ ok: true })
}, 'operator')

// Soft delete. Transfers that referenced this plan KEEP their lines: a receipt for
// money that moved stays true even once the agreement behind it ends. Those lines
// simply stop resolving to a live plan, exactly like a soft member ref.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 64)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare(
    'UPDATE transfer_plans SET deleted_at = ?, updated_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(nowSec(), nowSec(), id, actor.householdId)
    .run()
  if (!res.meta.changes) return notFound('Entente introuvable.')
  return ok({ ok: true })
}, 'operator')
