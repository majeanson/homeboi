import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, addLocalDays, newId, nowSec } from '../_lib/ids'
import { parseRecur, normalizeRecur, expandRange, type Recur } from '../_lib/recur'
import { profileMemberId } from '../_lib/profile'

// « Mes habitudes » — gentle personal/household rhythms behind the daily
// check-in scene (migration 0112). A habit is one row; its per-day history is
// habit_days (UNIQUE(habit_id, day), day = household-LOCAL midnight — the
// routine_runs pattern, but rows are KEPT: history is the point, progress is
// derived at read time, and nothing here is ever a score.
//
//   GET    /api/habits -> { habits (each with due_days), days, today }
//   POST   /api/habits -> create { title, icon?, colour?, kind, target?, unit?,
//                                  cadence, recur?, weekTimes?, reminders?, memberId? }
//   PATCH  /api/habits -> { id, mark: { day, value, slips?, note? } }  — the day upsert
//                         { id, ...field edits, archived?: boolean }   — edit / pause
//   DELETE /api/habits -> { id } soft delete (history rows stay)
//
// Marking sends ABSOLUTE per-day values, never deltas: the offline outbox may
// replay a queued write, and an absolute upsert writes the same end state twice
// (a delta would double-count). Two devices tapping +1 in the same minute is
// last-write-wins — the routine_runs trade, fine for a calm household.

const KINDS = ['do', 'count', 'limit', 'avoid'] as const
type HabitKind = (typeof KINDS)[number]

interface HabitRow {
  id: string
  member_id: string | null
  title: string
  icon: string
  colour: string | null
  kind: string
  target: number | null
  unit: string
  cadence: string
  recur_json: string | null
  week_times: number | null
  anchor_at: number
  reminders_json: string
  position: number
  archived_at: number | null
}

const TITLE_CAP = 200
const UNIT_CAP = 40
const NOTE_CAP = 500
const MAX_VALUE = 100000 // "walk 100 000 steps" fits; junk beyond it doesn't
const MAX_REMINDERS = 6

// How far the dueness window reaches: ~10 weeks back feeds the week/month
// history views; +2 days forward lets an always-on kiosk flip to the new day at
// local midnight from the CACHED payload (the next poll refreshes the window).
const PAST_DAYS = 69
const FUTURE_DAYS = 2

const kindOf = (v: unknown): HabitKind | null => (KINDS.includes(v as HabitKind) ? (v as HabitKind) : null)

// A per-day goal/ceiling in a sane range, or null.
function targetOrNull(v: unknown): number | null {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 && n <= MAX_VALUE ? n : null
}

// Reminder times as minutes past local midnight — sorted, deduped, capped.
function normalizeReminders(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  const mins = v
    .map((m) => Math.round(Number(m)))
    .filter((m) => Number.isInteger(m) && m >= 0 && m <= 1439)
  return [...new Set(mins)].sort((a, b) => a - b).slice(0, MAX_REMINDERS)
}

function parseReminders(json: string): number[] {
  try {
    return normalizeReminders(JSON.parse(json))
  } catch {
    return [] // corrupt JSON → no reminders (never crash the sheet)
  }
}

// A recur-cadence habit with no rule means "every day".
const EVERY_DAY: Recur = { freq: 'daily' }

export const onRequestGet = authed(async (ctx, actor) => {
  const today = localDayStart(new Date(Date.now()))
  const from = addLocalDays(today, -PAST_DAYS)
  const to = addLocalDays(today, FUTURE_DAYS)

  const rows = await ctx.env.DB.prepare(
    `SELECT id, member_id, title, icon, colour, kind, target, unit, cadence, recur_json,
            week_times, anchor_at, reminders_json, position, archived_at
       FROM habits WHERE household_id = ? AND deleted_at IS NULL
      ORDER BY position, created_at`,
  )
    .bind(actor.householdId)
    .all<HabitRow>()

  const days = await ctx.env.DB.prepare(
    `SELECT habit_id, day, value, slips, member_id, note FROM habit_days
      WHERE day >= ? AND day < ?
        AND habit_id IN (SELECT id FROM habits WHERE household_id = ? AND deleted_at IS NULL)
      ORDER BY day`,
  )
    .bind(from, to, actor.householdId)
    .all<{ habit_id: string; day: number; value: number; slips: number; member_id: string | null; note: string }>()

  const habits = rows.results.map((h) => {
    // Scheduled habits get concrete due days over the window (birthdays-style
    // derive-on-read); week-quota habits have no fixed days by definition.
    const due =
      h.cadence === 'week' ? [] : expandRange(h.anchor_at, parseRecur(h.recur_json) ?? EVERY_DAY, from, to).map((at) => localDayStart(new Date(at * 1000)))
    return {
      id: h.id,
      member_id: h.member_id,
      title: h.title,
      icon: h.icon,
      colour: h.colour,
      kind: h.kind,
      target: h.target,
      unit: h.unit,
      cadence: h.cadence,
      recur: h.recur_json, // raw rule JSON; the form re-hydrates it via recurOf()
      week_times: h.week_times,
      reminders: parseReminders(h.reminders_json),
      position: h.position,
      archived: h.archived_at != null,
      due_days: due,
    }
  })

  return ok({ habits, days: days.results, today })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    title?: string
    icon?: string
    colour?: string
    kind?: string
    target?: number
    unit?: string
    cadence?: string
    recur?: unknown
    weekTimes?: number
    reminders?: unknown
    memberId?: string | null
  }>(ctx.request)

  const title = body?.title?.trim().slice(0, TITLE_CAP)
  if (!title) return badRequest('Titre requis.')
  const kind = kindOf(body?.kind) ?? 'do'
  const cadence = body?.cadence === 'week' ? 'week' : 'recur'
  const recur = cadence === 'recur' ? normalizeRecur(body?.recur) : null
  const weekTimes = cadence === 'week' ? Math.min(7, Math.max(1, Math.round(Number(body?.weekTimes) || 1))) : null
  // count/limit need a goal/ceiling; default 1 so a bad payload still reads sanely.
  const target = kind === 'count' || kind === 'limit' ? (targetOrNull(body?.target) ?? 1) : null

  // Owner resolution — mots-style: NULL/absent = the whole maisonnée; a non-null
  // id must be a member of THIS household (reject unknowns, don't drop silently).
  let memberId: string | null = null
  const wanted = body?.memberId?.trim()
  if (wanted) {
    const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
      .bind(wanted, actor.householdId)
      .first<{ 1: number }>()
    if (!m) return badRequest('Membre inconnu.')
    memberId = wanted
  }

  const pos = await ctx.env.DB.prepare(
    'SELECT COALESCE(MAX(position), 0) + 1 AS p FROM habits WHERE household_id = ? AND deleted_at IS NULL',
  )
    .bind(actor.householdId)
    .first<{ p: number }>()

  const id = newId()
  await ctx.env.DB.prepare(
    `INSERT INTO habits (id, household_id, member_id, title, icon, colour, kind, target, unit,
                         cadence, recur_json, week_times, anchor_at, reminders_json, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      memberId,
      title,
      (body?.icon ?? '').trim().slice(0, 8),
      body?.colour?.trim() || null,
      kind,
      target,
      (body?.unit ?? '').trim().slice(0, UNIT_CAP),
      cadence,
      recur ? JSON.stringify(recur) : null,
      weekTimes,
      nowSec(),
      JSON.stringify(normalizeReminders(body?.reminders)),
      pos?.p ?? 1,
      nowSec(),
    )
    .run()
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    mark?: { day?: number; value?: number; slips?: number; note?: string }
    title?: string
    icon?: string
    colour?: string | null
    kind?: string
    target?: number | null
    unit?: string
    cadence?: string
    recur?: unknown
    weekTimes?: number
    reminders?: unknown
    memberId?: string | null
    archived?: boolean
    position?: number
  }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')

  const habit = await ctx.env.DB.prepare(
    'SELECT id, kind, cadence FROM habits WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ id: string; kind: string; cadence: string }>()
  if (!habit) return notFound('Habitude introuvable.')
  const now = nowSec()

  // --- The day mark (the check-in tap) ---------------------------------------
  if (body?.mark) {
    const today = localDayStart(new Date(Date.now()))
    const day = Math.round(Number(body.mark.day))
    // ANY past day is fair game — the calendar day panel and the history dots both
    // let you backfill « j'ai oublié hier » (or last week), so there is no grace
    // floor anymore. Still never the future: a day is only ever marked once it has
    // happened.
    if (!Number.isFinite(day) || day > today) return badRequest('Jour hors fenêtre.')
    const value = Math.min(MAX_VALUE, Math.max(0, Math.round(Number(body.mark.value) || 0)))
    const slips = habit.kind === 'avoid' ? Math.min(MAX_VALUE, Math.max(0, Math.round(Number(body.mark.slips) || 0))) : 0
    const note = typeof body.mark.note === 'string' ? body.mark.note.trim().slice(0, NOTE_CAP) : null

    await ctx.env.DB.prepare(
      `INSERT INTO habit_days (id, habit_id, day, value, slips, member_id, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, ''), ?)
       ON CONFLICT(habit_id, day) DO UPDATE SET
         value = excluded.value, slips = excluded.slips, member_id = excluded.member_id,
         note = COALESCE(?, note), updated_at = excluded.updated_at`,
    )
      .bind(newId(), id, day, value, slips, profileMemberId(ctx.request), note, now, note)
      .run()
    return ok({ ok: true })
  }

  // --- Field edits / pause ----------------------------------------------------
  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body?.title === 'string') {
    const t = body.title.trim().slice(0, TITLE_CAP)
    if (!t) return badRequest('Titre requis.')
    sets.push('title = ?')
    binds.push(t)
  }
  if (typeof body?.icon === 'string') {
    sets.push('icon = ?')
    binds.push(body.icon.trim().slice(0, 8))
  }
  if (body != null && Object.prototype.hasOwnProperty.call(body, 'colour')) {
    sets.push('colour = ?')
    binds.push(body.colour?.trim() || null)
  }
  const kind = kindOf(body?.kind)
  if (kind) {
    sets.push('kind = ?')
    binds.push(kind)
  }
  if (body != null && Object.prototype.hasOwnProperty.call(body, 'target')) {
    sets.push('target = ?')
    binds.push(targetOrNull(body.target))
  }
  if (typeof body?.unit === 'string') {
    sets.push('unit = ?')
    binds.push(body.unit.trim().slice(0, UNIT_CAP))
  }
  if (body?.cadence === 'week' || body?.cadence === 'recur') {
    const recur = body.cadence === 'recur' ? normalizeRecur(body.recur) : null
    const weekTimes = body.cadence === 'week' ? Math.min(7, Math.max(1, Math.round(Number(body.weekTimes) || 1))) : null
    sets.push('cadence = ?', 'recur_json = ?', 'week_times = ?')
    binds.push(body.cadence, recur ? JSON.stringify(recur) : null, weekTimes)
  }
  if (body != null && Object.prototype.hasOwnProperty.call(body, 'reminders')) {
    sets.push('reminders_json = ?')
    binds.push(JSON.stringify(normalizeReminders(body.reminders)))
  }
  if (body != null && Object.prototype.hasOwnProperty.call(body, 'memberId')) {
    let memberId: string | null = null
    const wanted = body.memberId?.trim()
    if (wanted) {
      const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
        .bind(wanted, actor.householdId)
        .first<{ 1: number }>()
      if (!m) return badRequest('Membre inconnu.')
      memberId = wanted
    }
    sets.push('member_id = ?')
    binds.push(memberId)
  }
  if (typeof body?.archived === 'boolean') {
    sets.push('archived_at = ?')
    binds.push(body.archived ? now : null)
  }
  if (typeof body?.position === 'number' && Number.isFinite(body.position)) {
    sets.push('position = ?')
    binds.push(Math.round(body.position))
  }
  if (!sets.length) return badRequest('Rien à modifier.')

  sets.push('updated_at = ?')
  binds.push(now)
  await ctx.env.DB.prepare(`UPDATE habits SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...binds, id, actor.householdId)
    .run()
  return ok({ ok: true })
})

// Destructive (drops the habit + its history is orphaned) and the UI only offers
// it from the operator-only form, so the API matches: a kiosk/guest can never
// delete a habit even if a request slipped past the UI.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Soft delete; habit_days history stays (harmless orphans behind the
  // deleted_at filter, same stance as every other soft-deleted parent).
  await ctx.env.DB.prepare('UPDATE habits SET deleted_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
