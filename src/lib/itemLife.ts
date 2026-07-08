import { useEffect, useState } from 'react'

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

// Meal slots carry no per-item time, only a slot, so their "past" anchor is a slot
// end-of-window minute-of-day (déjeuner is done by ~10:30, etc.). SOUPER is deliberately
// absent: it's the evening HEADLINE — the standing answer to "what's for supper tonight" —
// so it keeps full emphasis all evening and never strikes (the hero is never line-crossed).
// DESSERT is absent too: it follows the souper, so it stays live all evening and rolls
// off at midnight like the hero.
export const SLOT_PAST_MIN: Partial<Record<string, number>> = {
  breakfast: 10 * 60 + 30,
  lunch: 14 * 60,
  snack: 17 * 60,
}
export function mealSlotPast(slot: string, nowMs: number): boolean {
  const cut = SLOT_PAST_MIN[slot]
  if (cut == null) return false
  const d = new Date(nowMs)
  return d.getHours() * 60 + d.getMinutes() > cut
}
