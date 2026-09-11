import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import {
  catchupProjection,
  dueWindow,
  linesTotal,
  parseCatchup,
  parseLines,
  parseShares,
  planOccurrences,
  todayLocal,
  type PlanRow,
  type TransferLine,
  type TransferRow,
} from '../_lib/transfers'
import { parseRecur } from '../_lib/recur'

// « Les virements » — what each person actually sent to the shared account
// (migration 0126), plus the standing agreements it pays into.
//
//   GET    /api/transfers -> { today, plans (each with its due dates + projection), transfers }
//   POST   /api/transfers -> log one  { memberId, sentAt, lines, memo, reference, note }
//   PATCH  /api/transfers -> edit one { id, ...fields }  (the reference usually lands here,
//                            pasted back from the bank once the transfer settles)
//   DELETE /api/transfers -> { id } soft delete (this is a money record: recoverable)
//
// ONE composed read model, like /api/board and /api/habits: the tab, the composer
// and the peek all render from a single fetch. The SPA has no recurrence expander,
// so the due DATES are expanded here (_lib/transfers) and shipped as plain numbers;
// « already covered » is then a trivial client-side filter over the same transfers
// this payload already carries — no date math, and nothing mirrored.
//
// CALM (NFR-CALM-1): a total is summed from its lines and never stored; there is no
// balance column, no ranking, and the catch-up projection is descriptive arithmetic
// over rows the household recorded themselves.
//
// PRIVACY: both transfer paths are denied to a showcase guest link (guestScope.ts),
// the same call already made for care_log invoice amounts.

const MEMO_CAP = 400
const REFERENCE_CAP = 40
const NOTE_CAP = 2000
const MAX_LINES = 20
const LABEL_CAP = 60
// One hundred million cents = 1 000 000 $. Not a household limit so much as a
// typo fence: it keeps a stray keystroke out of the projection arithmetic.
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

const centsOf = (v: unknown): number | null => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  return i >= 0 && i <= MAX_CENTS ? i : null
}

// Validate the breakdown a client sends. Returns null when ANY line is malformed:
// a transfer whose lines don't add up is worse than a rejected write, because its
// total and its coverage claims are what every other surface reads.
function validateLines(v: unknown, planIds: ReadonlySet<string>): TransferLine[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_LINES) return null
  const out: TransferLine[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    const amountCents = centsOf(o.amountCents)
    if (amountCents === null) return null
    if (o.kind === 'plan') {
      const planId = typeof o.planId === 'string' ? o.planId : ''
      const dueAt = daySec(o.dueAt)
      // The plan must be THIS household's — a line may not claim coverage of a
      // series the household doesn't own.
      if (!planId || !planIds.has(planId) || dueAt === null) return null
      out.push({ kind: 'plan', planId, dueAt, amountCents })
    } else if (o.kind === 'topup') {
      out.push({ kind: 'topup', amountCents })
    } else if (o.kind === 'other') {
      out.push({ kind: 'other', label: str(o.label, LABEL_CAP) ?? '', amountCents })
    } else {
      return null
    }
  }
  return out
}

async function householdPlanIds(env: { DB: D1Database }, householdId: string): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    'SELECT id FROM transfer_plans WHERE household_id = ? AND deleted_at IS NULL',
  )
    .bind(householdId)
    .all<{ id: string }>()
  return new Set(results.map((r) => r.id))
}

const PLAN_COLS =
  'id, household_id, title, amount_cents, recur_json, anchor_at, shares_json, catchup_json, colour, position'
const TRANSFER_COLS = 'id, member_id, sent_at, lines_json, memo, reference, note, created_at'

export const onRequestGet = authed(async (ctx, actor) => {
  const [plansRes, transfersRes] = await Promise.all([
    ctx.env.DB.prepare(
      `SELECT ${PLAN_COLS} FROM transfer_plans WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at`,
    )
      .bind(actor.householdId)
      .all<PlanRow>(),
    ctx.env.DB.prepare(
      `SELECT ${TRANSFER_COLS} FROM transfers WHERE household_id = ? AND deleted_at IS NULL ORDER BY sent_at DESC, created_at DESC`,
    )
      .bind(actor.householdId)
      .all<TransferRow>(),
  ])

  const today = todayLocal()
  const { from, to } = dueWindow(today)
  const rows = transfersRes.results

  return ok({
    today,
    plans: plansRes.results.map((p) => ({
      id: p.id,
      title: p.title,
      amountCents: p.amount_cents,
      recur: parseRecur(p.recur_json),
      anchorAt: p.anchor_at,
      shares: parseShares(p.shares_json),
      catchup: parseCatchup(p.catchup_json),
      colour: p.colour,
      position: p.position,
      // Expanded here because only this side can: ascending local midnights across
      // a bounded window, DST-correct via _lib/recur.
      due: planOccurrences(p, from, to),
      projection: catchupProjection(p, rows, today),
    })),
    transfers: rows.map((t) => {
      const lines = parseLines(t.lines_json)
      return {
        id: t.id,
        memberId: t.member_id,
        sentAt: t.sent_at,
        lines,
        totalCents: linesTotal(lines),
        memo: t.memo,
        reference: t.reference,
        note: t.note,
      }
    }),
  })
})

// Operator-scoped: a paired wall tablet may READ the household's money (it is the
// same roof and the same shared account) but may not log a transfer from the wall.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    memberId?: string | null
    sentAt?: unknown
    lines?: unknown
    memo?: string
    reference?: string | null
    note?: string | null
  }>(ctx.request)

  const lines = validateLines(body?.lines, await householdPlanIds(ctx.env, actor.householdId))
  if (!lines) return badRequest('Lignes du virement invalides.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO transfers (id, household_id, member_id, sent_at, lines_json, memo, reference, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      str(body?.memberId, 64),
      daySec(body?.sentAt) ?? todayLocal(),
      JSON.stringify(lines),
      str(body?.memo, MEMO_CAP) ?? '',
      str(body?.reference, REFERENCE_CAP),
      str(body?.note, NOTE_CAP),
      ts,
      ts,
    )
    .run()
  return ok({ id })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    memberId?: string | null
    sentAt?: unknown
    lines?: unknown
    memo?: string
    reference?: string | null
    note?: string | null
  }>(ctx.request)
  const id = str(body?.id, 64)
  if (!id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare(
    'SELECT id FROM transfers WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ id: string }>()
  if (!owns) return notFound('Virement introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }

  if (body?.lines !== undefined) {
    const lines = validateLines(body.lines, await householdPlanIds(ctx.env, actor.householdId))
    if (!lines) return badRequest('Lignes du virement invalides.')
    setIf(true, 'lines_json', JSON.stringify(lines))
  }
  if (body?.sentAt !== undefined) {
    const at = daySec(body.sentAt)
    if (at === null) return badRequest('Date invalide.')
    setIf(true, 'sent_at', at)
  }
  if (body?.memo !== undefined) setIf(true, 'memo', str(body.memo, MEMO_CAP) ?? '')
  // `'x' in body` rather than `!== undefined` for the nullable fields: sending null
  // is how a client CLEARS one, and that has to reach the column.
  setIf(!!body && 'memberId' in body, 'member_id', str(body?.memberId, 64))
  setIf(!!body && 'reference' in body, 'reference', str(body?.reference, REFERENCE_CAP))
  setIf(!!body && 'note' in body, 'note', str(body?.note, NOTE_CAP))

  if (!sets.length) return ok({ ok: true })
  sets.push('updated_at = ?')
  binds.push(nowSec(), id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE transfers SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...binds)
    .run()
  return ok({ ok: true })
}, 'operator')

// SOFT delete, unlike the hard DELETE most rows here get: this is the household's
// own record of money that actually moved, and the bank reference on it may be the
// only copy outside a statement. A mistaken tap must stay recoverable.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 64)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare(
    'UPDATE transfers SET deleted_at = ?, updated_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(nowSec(), nowSec(), id, actor.householdId)
    .run()
  if (!res.meta.changes) return notFound('Virement introuvable.')
  return ok({ ok: true })
}, 'operator')
