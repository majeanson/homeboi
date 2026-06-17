import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, addLocalDays } from '../_lib/ids'

// "Qui a fait quoi cette semaine ?" — a calm, READ-ONLY settle-the-turn view.
// It answers "it's not my turn" by SHOWING the recent shared record, never by
// scoring it: only names, dates and chore titles. There is deliberately NO
// count, NO tally, NO ranking, NO "you're behind" — that would turn attribution
// into a leaderboard (NFR-CALM-1). The data is the append-only task_participants
// log (migration 0002), already an attribution record, not a score.
//
// One read groups contributions by LOCAL day (America/Toronto, DST-aware — same
// boundary the board buckets at, see board.ts / _lib/ids), then collapses to the
// distinct members who pitched in on a chore that day. Mirrors how board.ts builds
// its `helpers` field: each person once, named people by name, anonymous taps by
// role — no per-tap repetition. A deleted member resolves to null name (the client
// falls back to the role label).
export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId

  // Default window: the last ~30 days, bucketed at local midnight so a day
  // boundary lines up with the board. `?since=<unix>` narrows it (e.g. this week).
  const url = new URL(ctx.request.url)
  const sinceParam = Number(url.searchParams.get('since'))
  const defaultSince = addLocalDays(localDayStart(new Date(Date.now())), -30)
  const since = Number.isFinite(sinceParam) && sinceParam > 0 ? Math.floor(sinceParam) : defaultSince

  // JOIN (not IN-subquery) so the planner walks the household's few tasks via
  // tasks_household_idx, then task_participants_task_idx(task_id, contributed_at).
  // LEFT JOIN members: a member may have been deleted (the contribution stays as
  // an anonymous record) → null name, the client falls back to the role.
  const rows = await ctx.env.DB.prepare(
    `SELECT tp.task_id, tp.role, tp.contributed_at,
            tp.member_id AS member_id,
            t.title AS chore_title, t.color AS chore_color,
            m.display_name AS name, m.avatar_kind, m.avatar_ref, m.colour
       FROM task_participants tp
       JOIN tasks t ON t.id = tp.task_id AND t.household_id = ?
       LEFT JOIN members m ON m.id = tp.member_id
      WHERE tp.contributed_at >= ?
      ORDER BY tp.contributed_at DESC`,
  )
    .bind(hh, since)
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
    }>()

  interface Helper {
    memberId: string | null
    name: string | null
    role: string
    avatarKind: string | null
    avatarRef: string | null
    colour: string | null
  }
  interface LedgerRow {
    date: number // local-midnight unix seconds of the day it happened
    choreId: string
    choreTitle: string
    choreColor: string | null
    helpers: Helper[]
  }

  // Group by (local day, chore). Newest day first (rows already DESC by time);
  // within a group, collapse repeat taps so each person shows once — named people
  // by name, anonymous taps as a single role entry. NO count is kept.
  const groups = new Map<string, LedgerRow>()
  const seen = new Map<string, Set<string>>()
  for (const r of rows.results) {
    const day = localDayStart(new Date(r.contributed_at * 1000))
    const key = `${day}|${r.task_id}`
    let row = groups.get(key)
    if (!row) {
      row = {
        date: day,
        choreId: r.task_id,
        choreTitle: r.chore_title,
        choreColor: r.chore_color,
        helpers: [],
      }
      groups.set(key, row)
      seen.set(key, new Set<string>())
    }
    const s = seen.get(key)!
    const dedupe = r.name ?? `role:${r.role}`
    if (!s.has(dedupe) && row.helpers.length < 8) {
      s.add(dedupe)
      row.helpers.push({
        memberId: r.member_id,
        name: r.name,
        role: r.role,
        avatarKind: r.avatar_kind,
        avatarRef: r.avatar_ref,
        colour: r.colour,
      })
    }
  }

  // Newest day first, then alphabetical chore within a day for a stable read.
  const ledger = [...groups.values()].sort(
    (a, b) => b.date - a.date || a.choreTitle.localeCompare(b.choreTitle),
  )

  return ok({ since, ledger })
})
