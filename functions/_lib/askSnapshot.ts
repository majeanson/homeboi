// The household snapshot — one bounded, dated read of everything a question could
// be about: suppers, events (one-off + recurring), birthdays, the list, chores,
// fridge notes, Le cercle contacts, businesses, carnet next-dues, and who works when.
//
// WHY THIS IS ITS OWN FILE. It used to live inline in functions/api/ask.ts, which was
// fine while « Demande à la maison » was the only caller. It has a second caller now
// (the MCP server's `household_snapshot` tool), and a second caller is exactly when an
// inline block becomes a drift risk: two copies of "what counts as the household right
// now" would answer the SAME question differently within a month.
//
// The split is deliberate and matches the one askContext.ts already made:
//   · askContext.ts stays PURE — formatting, recur expansion, caps, FR/EN. No DB.
//   · this file is the DB read, and nothing else. No AI, no formatting.
//   · ask.ts is now snapshot → prompt lines → one inference.
//
// ZERO AI here, and zero writes. Every window below is capped, because this runs on a
// Worker CPU budget and an unbounded household would otherwise decide how long it took.

import type { Env } from './env'
import { fetchBirthdayPeople } from './birthdays'
import { fetchCarnetLifeItems } from './carnetLife'
import type { ScheduleBlockRow } from './carResolve'
import {
  expandAskEvents,
  birthdaysForPrompt,
  carnetDuesForPrompt,
  workForPrompt,
  type AskSnapshot,
  type AskEventRow,
  type AskRecurEventRow,
  type AskMealRow,
  type AskContactRow,
  type AskBusinessRow,
} from './askContext'

const DAY = 86400

/**
 * Gather the snapshot for a household, anchored on `today` (a LOCAL midnight — the
 * caller gets it from localDayStart, which reads the household's own zone).
 *
 * The windows are the ones « Demande à la maison » was tuned to and are part of the
 * answer's meaning, so they live here rather than at each call site:
 *   · events   last week → next month (wide enough for "what's this week", bounded)
 *   · birthdays  the same start, but a FULL YEAR out — a birthday is asked about
 *                well ahead of the date, unlike an appointment
 *   · meals    two days back → two weeks out (the planning window plus leftovers)
 *   · work     a two-week look-ahead, the horizon "is X free on …" actually asks about
 */
export async function gatherAskSnapshot(env: Env, householdId: string, today: number): Promise<AskSnapshot> {
  const hh = householdId
  const rangeStart = today - 7 * DAY
  const rangeEnd = today + 30 * DAY
  const birthdayRangeEnd = today + 365 * DAY

  const [
    meals,
    oneOffEvents,
    recurEvents,
    list,
    chores,
    notes,
    birthdayPeople,
    contacts,
    businesses,
    carnetItems,
    membersRes,
    scheduleRes,
    carDayRes,
  ] = await Promise.all([
    env.DB.prepare(
      'SELECT title, date, slot, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date LIMIT 60',
    )
      .bind(hh, today - 2 * DAY, today + 14 * DAY)
      .all<AskMealRow>(),
    env.DB.prepare(
      'SELECT title, start_at, all_day FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 60',
    )
      .bind(hh, rangeStart, rangeEnd)
      .all<AskEventRow>(),
    // Recurring series: one row per series, expanded below (mirrors board.ts/year.ts —
    // the only DB-side difference from a one-off query is dropping the date filter,
    // since a series' anchor can be arbitrarily old).
    env.DB.prepare('SELECT title, start_at, all_day, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL')
      .bind(hh)
      .all<AskRecurEventRow>(),
    env.DB.prepare('SELECT text FROM list_items WHERE household_id = ? AND checked_at IS NULL ORDER BY created_at LIMIT 60')
      .bind(hh)
      .all<{ text: string }>(),
    env.DB.prepare('SELECT title FROM tasks WHERE household_id = ? ORDER BY created_at LIMIT 30')
      .bind(hh)
      .all<{ title: string }>(),
    env.DB.prepare(
      'SELECT text FROM notes WHERE household_id = ? AND dismissed_at IS NULL AND text IS NOT NULL ORDER BY created_at DESC LIMIT 12',
    )
      .bind(hh)
      .all<{ text: string }>(),
    fetchBirthdayPeople(env.DB, hh),
    // Le cercle contacts: name + how to reach them.
    env.DB.prepare(
      'SELECT first_name, last_name, nickname, phone, email FROM contacts WHERE household_id = ? ORDER BY first_name LIMIT 30',
    )
      .bind(hh)
      .all<AskContactRow>(),
    // Services & vendors (vet, plumber…) — a business is NOT a cercle person, but is
    // exactly what « le numéro du vétérinaire » needs.
    env.DB.prepare(
      'SELECT name, category, phone FROM businesses WHERE household_id = ? AND deleted_at IS NULL ORDER BY name LIMIT 30',
    )
      .bind(hh)
      .all<AskBusinessRow>(),
    fetchCarnetLifeItems(env.DB, hh),
    // « L'auto » — the household's names, the recurring work windows, and the per-date
    // adjustments that release the car. Derived onto dates below, never event rows
    // (like birthdays).
    env.DB.prepare('SELECT id, display_name FROM members WHERE household_id = ?')
      .bind(hh)
      .all<{ id: string; display_name: string }>(),
    env.DB.prepare(
      'SELECT id, member_id, label, start_min, end_min, holds_car, colour AS color, recur_json, anchor_day FROM schedule_blocks WHERE household_id = ?',
    )
      .bind(hh)
      .all<ScheduleBlockRow>(),
    env.DB.prepare('SELECT day FROM car_day WHERE household_id = ? AND day >= ? AND day < ?')
      .bind(hh, today, today + 14 * DAY)
      .all<{ day: number }>(),
  ])

  return {
    today,
    meals: meals.results,
    events: expandAskEvents(oneOffEvents.results, recurEvents.results, rangeStart, rangeEnd),
    birthdays: birthdaysForPrompt(birthdayPeople, rangeStart, birthdayRangeEnd),
    list: list.results,
    chores: chores.results,
    notes: notes.results,
    contacts: contacts.results,
    businesses: businesses.results,
    carnetDues: carnetDuesForPrompt(carnetItems, today),
    work: workForPrompt(scheduleRes.results, carDayRes.results, membersRes.results, today, today + 14 * DAY),
  }
}
