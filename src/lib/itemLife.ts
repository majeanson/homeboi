import { useEffect, useState } from 'react'
import { localMinuteOfDay } from './localDay'
import { DEFAULT_HERO, DEFAULT_SLOT_HOURS, SLOT_GRACE_MIN, clockOrder, isMealSlot, type MealSlot } from './mealSlots'

// The board's item LIFECYCLE — one shared clock + the one "is this timed thing past?"
// rule, so every surface crosses things out the same way at the same moment. Before this,
// past-ness was re-derived ad hoc per section (meals by a slot threshold, the Fil by the
// item's own time, rendez-vous not at all), each on its own clock — so a left-on wall
// tablet only advanced its strike-throughs when a poll happened to land. (NFR-CALM: the
// board shows what's NOW and NEXT; a timed thing whose moment has passed is line-crossed,
// stays as a quiet record, and rolls off at local midnight.)

// Minute-granular "now" (ms, like Date.now()) that forces a re-render each minute, so the
// board's time-derived state — past strike-through, « Bientôt » chips, today/tomorrow
// bucketing, the day-part drift — advances on its own instead of waiting for the next poll.
// One interval; mirrors the Fil's own tick, lifted so every surface ticks together. Cheap
// (a re-render, no network); a day-change is the cue to refetch the day-bucketed payload.
export function useNow(stepMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs)
    return () => window.clearInterval(id)
  }, [stepMs])
  return now
}

// THE "is this timed item past?" predicate — a timed thing is crossed-out once its anchor
// moment is behind us. Untimed / all-day items pass `null` and are never past (they leave by
// being done/cleared or at local midnight, not by a passing minute).
export function isPastSec(anchorSec: number | null | undefined, nowMs: number): boolean {
  return anchorSec != null && anchorSec * 1000 < nowMs
}

// Meal slots carry no per-item time, only a slot — so their "past" anchor is derived
// from the household's serve times (Réglages ▸ Repas, `hours`): a meal is crossed out
// once its serve window has closed, i.e. exactly when it stops being the meal
// « Cuisiner » would offer (mealSlots' shared SLOT_GRACE_MIN). This used to be a fixed
// {breakfast: 10:30, lunch: 14:00, snack: 17:00} table, which silently lied the moment
// a household moved an hour: a collation served at 18:00 struck through at 17:01.
//
// The HERO meal never strikes: it's the day's headline — the standing answer to "what's
// for supper tonight" — so it keeps full emphasis all evening. Nor does any meal served
// AFTER the hero (the dessert, by default): those follow it and stay live until they
// roll off at local midnight with it.
export function mealSlotPast(
  slot: string,
  nowMs: number,
  hours: Record<MealSlot, number> = DEFAULT_SLOT_HOURS,
  hero: MealSlot = DEFAULT_HERO,
): boolean {
  if (!isMealSlot(slot)) return false
  const clock = clockOrder(hours)
  // The hero and everything after it on the clock are never line-crossed.
  if (clock.indexOf(slot) >= clock.indexOf(hero)) return false
  // Household-local wall-clock minute, not the runtime's own zone (localDay.ts) — a
  // CI runner (UTC) must strike the same slots a Toronto kiosk would at the same instant.
  return localMinuteOfDay(new Date(nowMs)) > hours[slot] + SLOT_GRACE_MIN
}
