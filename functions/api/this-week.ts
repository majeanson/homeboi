import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, addLocalDays } from '../_lib/ids'
import { parseRecur, expandRange } from '../_lib/recur'
import { fetchBirthdayPeople, birthdayOccurrences } from '../_lib/birthdays'
import { workOccurrencesInRange, parseScheduleBlockRow, type ScheduleBlockRow } from '../_lib/carResolve'

// "Cette semaine ensemble" — a calm, READ-ONLY weekly ritual surface (Réglages).
// Two halves off existing data: the week AHEAD (what's coming — meals, who works
// when, birthdays, events, dated projects) and the week BEHIND ("ce qu'on a fait
// ensemble" — chores + routines + projects, by FACE, never a count). It widens the
// chore-ledger pattern (functions/api/chores-ledger.ts) to the whole household and
// is governed by the same calm tenet: names + faces, NO tally / ranking / streak /
// score (NFR-CALM-1). Operator-only — a glance, not an action surface.

interface Face {
  memberId: string | null
  name: string | null
  avatarKind: string | null
  avatarRef: string | null
  colour: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const today = localDayStart(new Date(Date.now()))
  const weekEnd = addLocalDays(today, 7)
  const weekStart = addLocalDays(today, -7)

  const [members, blocks, mealsAhead, oneOff, recurring, projects, ledgerRows, routineRows, moodRows] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT id, display_name, avatar_kind, avatar_ref, colour FROM members WHERE household_id = ? ORDER BY position, created_at',
    )
      .bind(hh)
      .all<{ id: string; display_name: string; avatar_kind: string | null; avatar_ref: string | null; colour: string | null }>(),
    ctx.env.DB.prepare(
      'SELECT id, member_id, label, start_min, end_min, holds_car, colour AS color, recur_json, anchor_day FROM schedule_blocks WHERE household_id = ?',
    )
      .bind(hh)
      .all<ScheduleBlockRow>(),
    // Week ahead — meals planned.
    ctx.env.DB.prepare(
      'SELECT date, slot, title FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date, position, created_at, id',
    )
      .bind(hh, today, weekEnd)
      .all<{ date: number; slot: string; title: string }>(),
    // Week ahead — one-off events.
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at',
    )
      .bind(hh, today, weekEnd)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null }>(),
    // Week ahead — recurring events (expanded below).
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null; recur_json: string }>(),
    // Projects: upcoming (dated in range) AND advanced this week (last_done_at in window).
    ctx.env.DB.prepare(
      'SELECT title, at, last_done_at, colour AS color FROM home_projects WHERE household_id = ? AND ((at >= ? AND at < ?) OR (last_done_at >= ? AND last_done_at < ?))',
    )
      .bind(hh, today, weekEnd, weekStart, today)
      .all<{ title: string; at: number | null; last_done_at: number | null; color: string | null }>(),
    // Week behind — chores done (the append-only attribution log; faces, no count).
    ctx.env.DB.prepare(
      `SELECT tp.task_id, tp.role, tp.contributed_at, tp.member_id,
              t.title AS chore_title, t.colour AS chore_color,
              m.display_name AS name, m.avatar_kind, m.avatar_ref, m.colour
         FROM task_participants tp
         JOIN tasks t ON t.id = tp.task_id AND t.household_id = ?
         LEFT JOIN members m ON m.id = tp.member_id
        WHERE tp.contributed_at >= ? AND tp.contributed_at < ?
        ORDER BY tp.contributed_at DESC`,
    )
      .bind(hh, weekStart, weekEnd)
      .all<{
        task_id: string
        role: string
        contributed_at: number
        member_id: string | null
        chore_title: string
        chore_color: string | null
        name: string | null
        avatar_kind: string | null
        avatar_ref: string | null
        colour: string | null
      }>(),
    // Week behind — routines that ran (a non-empty done set on a day in the window).
    ctx.env.DB.prepare(
      `SELECT r.id, r.name, r.member_id, rr.done_idx_json
         FROM routine_runs rr
         JOIN routines r ON r.id = rr.routine_id
        WHERE r.household_id = ? AND rr.date >= ? AND rr.date < ? AND rr.done_idx_json != '[]'`,
    )
      .bind(hh, weekStart, weekEnd)
      .all<{ id: string; name: string; member_id: string | null; done_idx_json: string }>(),
    // Week behind — the "week of moments" (#C): each routine finish where a feeling was
    // tapped, with its optional selfie. By FACE + glyph, one row per routine per day —
    // NO count, NO trend, NO score (the same calm rule as the chore ledger above).
    ctx.env.DB.prepare(
      `SELECT r.name, r.member_id, rr.date, rr.feeling, rr.feeling_photo
         FROM routine_runs rr
         JOIN routines r ON r.id = rr.routine_id
        WHERE r.household_id = ? AND rr.date >= ? AND rr.date < ?
          AND (rr.feeling IS NOT NULL OR rr.feeling_photo IS NOT NULL)
        ORDER BY rr.date DESC`,
    )
      .bind(hh, weekStart, weekEnd)
      .all<{ name: string; member_id: string | null; date: number; feeling: string | null; feeling_photo: string | null }>(),
  ])

  const memberById = new Map(members.results.map((m) => [m.id, m]))
  const nameOf = (id: string | null): string | null => (id && memberById.get(id)?.display_name) || null
  const faceOf = (id: string | null): Face => {
    const m = id ? memberById.get(id) : undefined
    return {
      memberId: id,
      name: m?.display_name ?? null,
      avatarKind: m?.avatar_kind ?? null,
      avatarRef: m?.avatar_ref ?? null,
      colour: m?.colour ?? null,
    }
  }

  // ---- Week ahead -----------------------------------------------------------
  const events: { title: string; at: number; allDay: number; who: string | null }[] = oneOff.results.map((e) => ({
    title: e.title,
    at: e.start_at,
    allDay: e.all_day,
    who: nameOf(e.member_id),
  }))
  for (const e of recurring.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, today, weekEnd)) {
      events.push({ title: e.title, at, allDay: e.all_day, who: nameOf(e.member_id) })
    }
  }
  events.sort((a, b) => a.at - b.at)

  const birthdayPeople = await fetchBirthdayPeople(ctx.env.DB, hh)
  const birthdays = birthdayOccurrences(birthdayPeople, today, weekEnd)
    .sort((a, b) => a.at - b.at)
    .map((b) => ({ name: b.name, at: b.at, age: b.age }))

  const work = workOccurrencesInRange(blocks.results.map(parseScheduleBlockRow), today, weekEnd)
    .sort((a, b) => a.at - b.at)
    .map((o) => ({ at: o.at, label: o.label, who: nameOf(o.memberId), face: faceOf(o.memberId) }))

  const projectsAhead = projects.results
    .filter((p) => p.at != null && p.at >= today && p.at < weekEnd)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    .map((p) => ({ title: p.title, at: p.at as number, color: p.color }))

  // ---- Week behind ----------------------------------------------------------
  // Chore faces: group by (local day, chore), each person once (named by name,
  // anonymous taps by role). Mirrors chores-ledger; NO count kept.
  interface LedgerRow {
    date: number
    choreTitle: string
    choreColor: string | null
    helpers: Face[]
  }
  const groups = new Map<string, LedgerRow>()
  const seen = new Map<string, Set<string>>()
  for (const r of ledgerRows.results) {
    const day = localDayStart(new Date(r.contributed_at * 1000))
    const key = `${day}|${r.task_id}`
    let row = groups.get(key)
    if (!row) {
      row = { date: day, choreTitle: r.chore_title, choreColor: r.chore_color, helpers: [] }
      groups.set(key, row)
      seen.set(key, new Set())
    }
    const s = seen.get(key)!
    const dedupe = r.name ?? `role:${r.role}`
    if (!s.has(dedupe) && row.helpers.length < 8) {
      s.add(dedupe)
      row.helpers.push({
        memberId: r.member_id,
        name: r.name,
        avatarKind: r.avatar_kind,
        avatarRef: r.avatar_ref,
        colour: r.colour,
      })
    }
  }
  const choresDone = [...groups.values()].sort((a, b) => b.date - a.date || a.choreTitle.localeCompare(b.choreTitle))

  // Routines that ran — one entry per routine (which one, whose), not how many times.
  const routineSeen = new Set<string>()
  const routinesDone: { name: string; who: string | null; face: Face }[] = []
  for (const r of routineRows.results) {
    if (routineSeen.has(r.id)) continue
    routineSeen.add(r.id)
    routinesDone.push({ name: r.name, who: nameOf(r.member_id), face: faceOf(r.member_id) })
  }

  const projectsDone = projects.results
    .filter((p) => p.last_done_at != null && p.last_done_at >= weekStart && p.last_done_at < today)
    .map((p) => ({ title: p.title, color: p.color }))

  // The "week of moments" (#C) — this week's routine feelings/selfies, by face + glyph,
  // newest first. NOT a count/trend/streak: just which moments happened, whose.
  const moods = moodRows.results.map((m) => ({
    date: m.date,
    name: nameOf(m.member_id),
    face: faceOf(m.member_id),
    feeling: m.feeling,
    feelingPhoto: m.feeling_photo,
  }))

  return ok({
    today,
    weekStart,
    weekEnd,
    ahead: { meals: mealsAhead.results, events, birthdays, work, projects: projectsAhead },
    behind: { chores: choresDone, routines: routinesDone, projects: projectsDone, moods },
  })
}, 'operator')
