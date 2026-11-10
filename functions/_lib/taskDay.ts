import { localDayStart } from './ids'
import { DEFAULT_TZ, isValidTz } from './tz'

// THE DAY OF A TASK: one encoding, one encoder, one decoder (plans/2026-11-06-TACHE-UNIFIEE.md,
// « Still to do » (3), the owner's decision of 2026-11-10: « every task stores its day as a
// household-LOCAL midnight »).
//
// WHAT WAS STORED. `home_projects.at` held three encodings, by where the row was written:
//   · a household-local midnight: every to-do, every capture, the season seeds, the sample;
//   · a UTC midnight (`dateToAnchorSec`): what the old chore and home forms wrote, and the one
//     form until today for any task with a schedule;
//   · an arbitrary instant: 0152's `created_at` start of an old recurring chore, and a series
//     written without a start (« from the moment it is written »).
//
// WHAT A HOUSEHOLD SAW. Every reader (the board, the calendar, the day page, the year, the
// recurrence engine, the overdue scan) read each of the three the same way: the household-
// local DAY that contains the instant, `localDayStart(at)` (_lib/upkeep, _lib/recur). So the
// day a task has is `taskDay(at)`, for every encoding. That is the rule, and the only one that
// keeps every displayed day, every recurrence's weekday, month day and fortnight, and every
// rotation projection where it was. (A UTC midnight in a zone WEST of Greenwich is the evening
// before: the board showed « 14 » for a date the old form echoed as « 15 ». The board was the
// truth a household lived by, so it wins, and the form now echoes it too.)
//
// WHY NOT A SQL MIGRATION. `localDayStart` needs the zone's UTC offset AT that instant: the
// household's own zone (0135, any IANA name), with its own DST rules. D1 is SQLite: no zone
// database, no `localtime` but the server's (UTC). A UTC midnight could be decoded in SQL
// only if every zone's offset rules were spelled out in it, and a migration that is right for
// Toronto and wrong for the next household's zone is the half-right migration we do not ship.
// So the rewrite is a WORKER-SIDE, IDEMPOTENT backfill (`normalizeTaskDays`, run by the nightly
// cron, household by household in its own zone), and until it has run every reader DECODES
// on read through `taskDay`, which is exact for all three encodings, so nothing a household
// sees depends on whether the backfill ran yet. Every write ENCODES through `taskDayOf`.
//
// What the conversion moves, by design: an occurrence's time of day (a 20:00 or 14:37 anchor
// becomes 00:00 on the SAME day). Two answers follow from it, both from the decision: the
// « Bientôt » lead window counts back from midnight instead of from that hour, and a series
// ticked on its day BEFORE its anchor hour no longer reads as owed the next morning (the
// tick at 09:00 fell before a 20:00 occurrence and did not cover it).

/** The task's day: the household-local midnight of the day containing `sec`. THE decoder. */
export function taskDay(sec: number | null | undefined, tz?: string): number | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null
  return localDayStart(new Date(Math.floor(sec) * 1000), tz)
}

/** A write's day: whatever a body sent (a local midnight from today's client, a UTC midnight
 *  or an instant from an older bundle or a queued write), stored as the day it falls on.
 *  THE encoder: every write of `home_projects.at` goes through it. */
export function taskDayOf(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? taskDay(n) : null
}

/** A row as the readers see it: `at` decoded. Every reader of the spine goes through this. */
export const withTaskDay = <R extends { at: number | null }>(r: R): R => ({ ...r, at: taskDay(r.at) })

// THE BACKFILL. Every household, in ITS zone: each task whose stored `at` is not already the
// local midnight `taskDay` reads it as is rewritten to that midnight. Nothing else moves, and
// a second run changes nothing (a local midnight decodes to itself). Bounded and cheap: one
// read of the dated tasks per household, one UPDATE per row that differs (a household holds a
// few dozen tasks, and after the first night none differ). A zone the runtime does not know
// is skipped, never guessed at: its rows stay as they are and keep decoding on read.
export async function normalizeTaskDays(db: D1Database, householdId?: string): Promise<number> {
  const households = (
    await (householdId
      ? db.prepare('SELECT id, tz FROM households WHERE id = ?').bind(householdId)
      : db.prepare('SELECT id, tz FROM households')
    ).all<{ id: string; tz: string | null }>()
  ).results
  let fixed = 0
  for (const h of households) {
    const tz = h.tz ?? DEFAULT_TZ
    if (!isValidTz(tz)) continue
    const rows = (await db.prepare('SELECT id, at FROM home_projects WHERE household_id = ? AND at IS NOT NULL').bind(h.id).all<{ id: string; at: number }>()).results
    const stmts = rows
      .map((r) => ({ id: r.id, at: r.at, day: taskDay(r.at, tz) }))
      .filter((r) => r.day !== r.at)
      // `AND at = ?`: a write that landed between the read and this UPDATE wins.
      .map((r) => db.prepare('UPDATE home_projects SET at = ? WHERE id = ? AND household_id = ? AND at = ?').bind(r.day, r.id, h.id, r.at))
    for (let i = 0; i < stmts.length; i += 50) {
      const done = await db.batch(stmts.slice(i, i + 50))
      fixed += done.reduce((n, d) => n + (d.meta.changes ?? 0), 0)
    }
  }
  return fixed
}
