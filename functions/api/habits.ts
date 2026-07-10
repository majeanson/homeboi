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
//                                  cadence, recur?, weekTimes?, dayTimes?, everyHours?,
//                                  windowStart?, windowEnd?, reminders?, memberId? }
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

// Four rhythms: two that pick DAYS ('recur' schedule, 'week' quota) and two that
// live INSIDE the day ('day' = n times a day, 'hours' = every N hours in a window).
const CADENCES = ['recur', 'week', 'day', 'hours'] as const
type HabitCadence = (typeof CADENCES)[number]

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
  day_times: number | null
  every_hours: number | null
  window_start: number | null
  window_end: number | null
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
const MAX_DAY_TIMES = 24 // an hourly rhythm, at most — past that it isn't a habit
const DEFAULT_WINDOW_START = 8 * 60
const DEFAULT_WINDOW_END = 20 * 60

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

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

// A wall-clock minute past LOCAL midnight, or the fallback.
const minuteOfDay = (v: unknown, fallback: number): number => clamp(v, 0, 1439, fallback)

interface CadenceShape {
  cadence: HabitCadence
  recur_json: string | null
  week_times: number | null
  day_times: number | null
  every_hours: number | null
  window_start: number | null
  window_end: number | null
}

// The whole « À quel rythme ? » answer, normalized in ONE place: each cadence
// keeps only its own fields and NULLs the other three shapes, so switching a
// habit from « aux 4 h » to « 3 fois par semaine » can never leave a stale window
// behind for a reader to guard against.
//
// 'hours' is the only shape with a DERIVED field: day_times is the number of
// moments the window fits, computed here and stored, so the calendar and the
// check-in scene read one number instead of re-deriving a slot grid.
function cadenceShape(body: {
  cadence?: string
  recur?: unknown
  weekTimes?: unknown
  dayTimes?: unknown
  everyHours?: unknown
  windowStart?: unknown
  windowEnd?: unknown
}): CadenceShape {
  const empty = { recur_json: null, week_times: null, day_times: null, every_hours: null, window_start: null, window_end: null }
  const cadence = (CADENCES as readonly string[]).includes(body.cadence ?? '') ? (body.cadence as HabitCadence) : 'recur'

  if (cadence === 'week') return { ...empty, cadence, week_times: clamp(body.weekTimes, 1, 7, 1) }
  if (cadence === 'day') return { ...empty, cadence, day_times: clamp(body.dayTimes, 1, MAX_DAY_TIMES, 1) }
  if (cadence === 'hours') {
    const everyHours = clamp(body.everyHours, 1, 12, 4)
    const start = minuteOfDay(body.windowStart, DEFAULT_WINDOW_START)
    // An end before the start would fit zero moments; pin it to the start (one moment).
    const end = Math.max(start, minuteOfDay(body.windowEnd, DEFAULT_WINDOW_END))
    const slots = Math.min(MAX_DAY_TIMES, Math.floor((end - start) / (everyHours * 60)) + 1)
    return { ...empty, cadence, day_times: slots, every_hours: everyHours, window_start: start, window_end: end }
  }
  const recur = normalizeRecur(body.recur)
  return { ...empty, cadence, recur_json: recur ? JSON.stringify(recur) : null }
}

export const onRequestGet = authed(async (ctx, actor) => {
  const today = localDayStart(new Date(Date.now()))
  const from = addLocalDays(today, -PAST_DAYS)
  const to = addLocalDays(today, FUTURE_DAYS)

  const rows = await ctx.env.DB.prepare(
    `SELECT id, member_id, title, icon, colour, kind, target, unit, cadence, recur_json,
            week_times, day_times, every_hours, window_start, window_end,
            anchor_at, reminders_json, position, archived_at
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

  // « Le défi du jour » per-face check-ins (migration 0115). Same window as `days`;
  // a mark is one FACE that tried today's défi — never a count (the chore-ledger rule).
  const marks = await ctx.env.DB.prepare(
    `SELECT habit_id, day, member_id FROM habit_marks
      WHERE day >= ? AND day < ?
        AND habit_id IN (SELECT id FROM habits WHERE household_id = ? AND deleted_at IS NULL)
      ORDER BY day`,
  )
    .bind(from, to, actor.householdId)
    .all<{ habit_id: string; day: number; member_id: string | null }>()

  const habits = rows.results.map((h) => {
    // Scheduled habits get concrete due days over the window (birthdays-style
    // derive-on-read). Every other cadence has no fixed days by definition: a week
    // quota floats across the week, and an intra-day rhythm is due every day (the
    // client answers that from the cadence alone, so no expansion is needed).
    const due =
      h.cadence === 'recur'
        ? expandRange(h.anchor_at, parseRecur(h.recur_json) ?? EVERY_DAY, from, to).map((at) => localDayStart(new Date(at * 1000)))
        : []
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
      day_times: h.day_times,
      every_hours: h.every_hours,
      window_start: h.window_start,
      window_end: h.window_end,
      reminders: parseReminders(h.reminders_json),
      position: h.position,
      archived: h.archived_at != null,
      due_days: due,
    }
  })

  return ok({ habits, days: days.results, marks: marks.results, today })
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
    dayTimes?: number
    everyHours?: number
    windowStart?: number
    windowEnd?: number
    reminders?: unknown
    memberId?: string | null
    defi?: { text?: string; title?: string }
  }>(ctx.request)

  // « Le défi du jour » — commit today's drawn/typed défi. The défi is one standing
  // household habit (kind='defi', created lazily here, one per household); the chosen
  // text lives on that habit's habit_days.note for today. Re-rolls never reach the
  // server — only the accepted défi is written. See migration 0115.
  if (body?.defi) {
    const text = String(body.defi.text ?? '').trim().slice(0, NOTE_CAP)
    if (!text) return badRequest('Défi requis.')
    const today = localDayStart(new Date(Date.now()))

    let habitId = (
      await ctx.env.DB.prepare(
        "SELECT id FROM habits WHERE household_id = ? AND kind = 'defi' AND deleted_at IS NULL LIMIT 1",
      )
        .bind(actor.householdId)
        .first<{ id: string }>()
    )?.id
    if (!habitId) {
      habitId = newId()
      const pos = await ctx.env.DB.prepare(
        'SELECT COALESCE(MAX(position), 0) + 1 AS p FROM habits WHERE household_id = ? AND deleted_at IS NULL',
      )
        .bind(actor.householdId)
        .first<{ p: number }>()
      // A daily 'recur' (null rule) so it's "today's thing" — but kind='defi' keeps it
      // OUT of the check-in list, the board's due list and the calendar (all filter it):
      // it renders only as the board's pinned défi. Title is a stored fallback; every
      // surface shows the localized header + the day's text, never this string.
      await ctx.env.DB.prepare(
        `INSERT INTO habits (id, household_id, member_id, title, icon, colour, kind, target, unit,
                             cadence, recur_json, week_times, day_times, every_hours, window_start, window_end,
                             anchor_at, reminders_json, position, created_at)
         VALUES (?, ?, NULL, ?, '🎯', NULL, 'defi', NULL, '', 'recur', NULL, NULL, NULL, NULL, NULL, NULL, ?, '[]', ?, ?)`,
      )
        .bind(habitId, actor.householdId, (body.defi.title ?? 'Le défi du jour').trim().slice(0, TITLE_CAP), nowSec(), pos?.p ?? 1, nowSec())
        .run()
    }

    // Today's défi text rides the habit_days.note; value=1 marks "there is a défi
    // today". member_id records who drew it (attribution, soft ref).
    await ctx.env.DB.prepare(
      `INSERT INTO habit_days (id, habit_id, day, value, slips, member_id, note, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?, ?)
       ON CONFLICT(habit_id, day) DO UPDATE SET
         value = 1, note = excluded.note, member_id = excluded.member_id, updated_at = excluded.updated_at`,
    )
      .bind(newId(), habitId, today, profileMemberId(ctx.request), text, nowSec())
      .run()
    return ok({ ok: true, id: habitId, day: today })
  }

  const title = body?.title?.trim().slice(0, TITLE_CAP)
  if (!title) return badRequest('Titre requis.')
  const kind = kindOf(body?.kind) ?? 'do'
  const rhythm = cadenceShape(body ?? {})
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
                         cadence, recur_json, week_times, day_times, every_hours, window_start, window_end,
                         anchor_at, reminders_json, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      rhythm.cadence,
      rhythm.recur_json,
      rhythm.week_times,
      rhythm.day_times,
      rhythm.every_hours,
      rhythm.window_start,
      rhythm.window_end,
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
    dayTimes?: number
    everyHours?: number
    windowStart?: number
    windowEnd?: number
    reminders?: unknown
    memberId?: string | null
    archived?: boolean
    position?: number
    defiMark?: { day?: number; on?: boolean }
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

  // --- « Le défi du jour » per-face check-in (« Je l'ai tenu ! ») -------------
  // One mark per FACE per day (idempotent). Requires a picked face — a mark is
  // always someone's, never the anonymous « Maisonnée ». See migration 0115.
  if (body?.defiMark) {
    const member = profileMemberId(ctx.request)
    if (!member) return badRequest('Choisis un visage.')
    const today = localDayStart(new Date(Date.now()))
    const day = Math.round(Number(body.defiMark.day))
    if (!Number.isFinite(day) || day > today) return badRequest('Jour hors fenêtre.')
    if (body.defiMark.on) {
      await ctx.env.DB.prepare(
        `INSERT INTO habit_marks (id, habit_id, day, member_id, note, created_at)
         VALUES (?, ?, ?, ?, '', ?)
         ON CONFLICT(habit_id, day, member_id) DO NOTHING`,
      )
        .bind(newId(), id, day, member, now)
        .run()
    } else {
      await ctx.env.DB.prepare('DELETE FROM habit_marks WHERE habit_id = ? AND day = ? AND member_id = ?')
        .bind(id, day, member)
        .run()
    }
    return ok({ ok: true })
  }

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
  // The rhythm moves as ONE field: every shape is rewritten together (the unused
  // three back to NULL), so an edit can't leave a stale window on a weekly habit.
  if ((CADENCES as readonly string[]).includes(body?.cadence ?? '')) {
    const r = cadenceShape(body ?? {})
    sets.push('cadence = ?', 'recur_json = ?', 'week_times = ?', 'day_times = ?', 'every_hours = ?', 'window_start = ?', 'window_end = ?')
    binds.push(r.cadence, r.recur_json, r.week_times, r.day_times, r.every_hours, r.window_start, r.window_end)
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
